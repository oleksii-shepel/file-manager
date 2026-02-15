use crate::protocol::*;
use anyhow::{Context, Result};
use chrono::Utc;
use std::fs;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command as ProcCommand;
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};
use uuid::Uuid;
use walkdir::WalkDir;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

pub struct CommandExecutor;
const GLOBAL_INDEX_TTL: Duration = Duration::from_secs(45);
const GLOBAL_INDEX_MAX_ENTRIES: usize = 350_000;

#[derive(Clone)]
struct SearchIndexEntry {
    info: FileInfo,
    name_lower: String,
    path_lower: String,
    name_norm: String,
    stem_norm: String,
}

#[derive(Default)]
struct SearchIndexCache {
    roots_key: String,
    built_at: Option<Instant>,
    entries: Vec<SearchIndexEntry>,
    refresh_in_progress: bool,
}

static GLOBAL_SEARCH_INDEX: OnceLock<Mutex<SearchIndexCache>> = OnceLock::new();
static PROTECTED_PATHS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static SHARE_SESSIONS: OnceLock<Mutex<HashMap<String, ShareSession>>> = OnceLock::new();

#[derive(Clone)]
struct ShareSession {
    id: String,
    path: String,
    is_directory: bool,
    created_at: i64,
    expires_at: Option<i64>,
}

pub enum ResolvedShareTarget {
    DirectoryRoot(PathBuf),
    File(PathBuf),
}

impl CommandExecutor {
    pub fn execute(command: Command) -> Response {
        let command_id = command.id().to_string();
        let timestamp = Utc::now().timestamp();

        let result = match command {
            Command::ListDirectory { path, show_hidden, .. } => {
                Self::list_directory(&path, show_hidden)
            }
            Command::ReadFile { path, encoding, .. } => {
                Self::read_file(&path, encoding.as_deref())
            }
            Command::WriteFile { path, content, encoding, .. } => {
                Self::write_file(&path, &content, encoding.as_deref())
            }
            Command::DeleteFile { path, recursive, .. } => {
                Self::delete_file(&path, recursive)
            }
            Command::CreateDirectory { path, recursive, .. } => {
                Self::create_directory(&path, recursive)
            }
            Command::MoveFile { source, destination, .. } => {
                Self::move_file(&source, &destination)
            }
            Command::CopyFile { source, destination, recursive, .. } => {
                Self::copy_file(&source, &destination, recursive)
            }
            Command::GetFileInfo { path, .. } => {
                Self::get_file_info(&path)
            }
            Command::SearchFiles { path, pattern, recursive, max_results, .. } => {
                Self::search_files(&path, &pattern, recursive, max_results)
            }
            Command::SuggestPaths { input, current_path, limit, .. } => {
                Self::suggest_paths(&input, &current_path, limit)
            }
            Command::ProtectPath { path, .. } => {
                Self::protect_path(&path)
            }
            Command::UnprotectPath { path, .. } => {
                Self::unprotect_path(&path)
            }
            Command::ListProtected { .. } => {
                Self::list_protected()
            }
            Command::StartShare { path, expires_minutes, .. } => {
                Self::start_share(&path, expires_minutes)
            }
            Command::StopShare { share_id, .. } => {
                Self::stop_share(&share_id)
            }
            Command::ListShares { .. } => {
                Self::list_shares()
            }
            Command::CreateArchive { sources, archive_path, .. } => {
                Self::create_archive(&sources, &archive_path)
            }
            Command::ExtractArchive { archive_path, destination_path, .. } => {
                Self::extract_archive(&archive_path, &destination_path)
            }
        };

        match result {
            Ok(data) => Response::Success {
                command_id,
                timestamp,
                data,
            },
            Err(e) => Response::Error {
                command_id,
                timestamp,
                error: ErrorInfo {
                    code: "EXECUTION_ERROR".to_string(),
                    message: e.to_string(),
                    details: None,
                },
            },
        }
    }

    fn list_directory(path: &str, show_hidden: bool) -> Result<ResponseData> {
        let path_buf = Path::new(path);
        
        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }
        
        if !path_buf.is_dir() {
            anyhow::bail!("Path is not a directory: {}", path);
        }

        let mut entries = Vec::new();
        let mut total_size = 0u64;

        for entry in fs::read_dir(path_buf)? {
            let entry = entry?;
            let metadata = entry.metadata()?;
            let name = entry.file_name().to_string_lossy().to_string();
            
            // Skip hidden files if requested
            if !show_hidden && name.starts_with('.') {
                continue;
            }

            let file_info = Self::metadata_to_file_info(
                &name,
                &entry.path(),
                &metadata,
            )?;
            
            total_size += file_info.size;
            entries.push(file_info);
        }

        // Sort entries using a strict total order to avoid comparator panics:
        // directory first, then symlink, then file; finally case-insensitive name.
        entries.sort_by_key(|entry| {
            let type_rank = match entry.file_type {
                FileType::Directory => 0u8,
                FileType::Symlink => 1u8,
                FileType::File => 2u8,
            };

            (type_rank, entry.name.to_lowercase(), entry.name.clone())
        });

        Ok(ResponseData::DirectoryListing(DirectoryListing {
            path: path.to_string(),
            entries,
            total_size,
        }))
    }

    fn read_file(path: &str, encoding: Option<&str>) -> Result<ResponseData> {
        let path_buf = Path::new(path);
        
        if !path_buf.exists() {
            anyhow::bail!("File does not exist: {}", path);
        }

        let metadata = fs::metadata(path_buf)?;
        let size = metadata.len();

        let encoding = encoding.unwrap_or("utf8");
        let content = match encoding {
            "utf8" => fs::read_to_string(path_buf)?,
            "base64" => {
                let bytes = fs::read(path_buf)?;
                base64::encode(&bytes)
            }
            _ => anyhow::bail!("Unsupported encoding: {}", encoding),
        };

        Ok(ResponseData::FileContent(FileContent {
            path: path.to_string(),
            content,
            encoding: encoding.to_string(),
            size,
        }))
    }

    fn write_file(path: &str, content: &str, encoding: Option<&str>) -> Result<ResponseData> {
        Self::ensure_path_not_protected(path, "write")?;
        let path_buf = Path::new(path);
        let encoding = encoding.unwrap_or("utf8");

        match encoding {
            "utf8" => fs::write(path_buf, content)?,
            "base64" => {
                let bytes = base64::decode(content)
                    .context("Failed to decode base64 content")?;
                fs::write(path_buf, bytes)?;
            }
            _ => anyhow::bail!("Unsupported encoding: {}", encoding),
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("File written successfully: {}", path)),
            affected_paths: Some(vec![path.to_string()]),
        }))
    }

    fn delete_file(path: &str, recursive: bool) -> Result<ResponseData> {
        Self::ensure_path_not_protected(path, "delete")?;
        let path_buf = Path::new(path);
        
        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }

        if path_buf.is_dir() {
            if recursive {
                fs::remove_dir_all(path_buf)?;
            } else {
                fs::remove_dir(path_buf)?;
            }
        } else {
            fs::remove_file(path_buf)?;
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Deleted: {}", path)),
            affected_paths: Some(vec![path.to_string()]),
        }))
    }

    fn create_directory(path: &str, recursive: bool) -> Result<ResponseData> {
        Self::ensure_path_not_protected(path, "create")?;
        let path_buf = Path::new(path);

        if recursive {
            fs::create_dir_all(path_buf)?;
        } else {
            fs::create_dir(path_buf)?;
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Directory created: {}", path)),
            affected_paths: Some(vec![path.to_string()]),
        }))
    }

    fn move_file(source: &str, destination: &str) -> Result<ResponseData> {
        Self::ensure_path_not_protected(source, "move")?;
        Self::ensure_path_not_protected(destination, "move")?;
        let source_buf = Path::new(source);
        let dest_buf = Path::new(destination);

        if !source_buf.exists() {
            anyhow::bail!("Source does not exist: {}", source);
        }

        fs::rename(source_buf, dest_buf)?;

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Moved from {} to {}", source, destination)),
            affected_paths: Some(vec![source.to_string(), destination.to_string()]),
        }))
    }

    fn copy_file(source: &str, destination: &str, recursive: bool) -> Result<ResponseData> {
        Self::ensure_path_not_protected(destination, "copy into")?;
        let source_buf = Path::new(source);
        let dest_buf = Path::new(destination);

        if !source_buf.exists() {
            anyhow::bail!("Source does not exist: {}", source);
        }

        if source_buf.is_dir() {
            if !recursive {
                anyhow::bail!("Cannot copy directory without recursive flag");
            }
            Self::copy_dir_recursive(source_buf, dest_buf)?;
        } else {
            fs::copy(source_buf, dest_buf)?;
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Copied from {} to {}", source, destination)),
            affected_paths: Some(vec![destination.to_string()]),
        }))
    }

    fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
        fs::create_dir_all(dst)?;
        
        for entry in fs::read_dir(src)? {
            let entry = entry?;
            let ty = entry.file_type()?;
            let src_path = entry.path();
            let dst_path = dst.join(entry.file_name());

            if ty.is_dir() {
                Self::copy_dir_recursive(&src_path, &dst_path)?;
            } else {
                fs::copy(&src_path, &dst_path)?;
            }
        }
        Ok(())
    }

    fn get_file_info(path: &str) -> Result<ResponseData> {
        let path_buf = Path::new(path);
        
        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }

        let metadata = fs::metadata(path_buf)?;
        let name = path_buf
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let file_info = Self::metadata_to_file_info(&name, path_buf, &metadata)?;

        Ok(ResponseData::FileInfo(file_info))
    }

    fn search_files(
        path: &str,
        pattern: &str,
        recursive: bool,
        max_results: Option<usize>,
    ) -> Result<ResponseData> {
        let query = pattern.trim();
        if query.is_empty() {
            return Ok(ResponseData::SearchResult(SearchResult {
                path: path.to_string(),
                matches: Vec::new(),
                total_matches: 0,
            }));
        }

        let query_lower = query.to_lowercase();
        let query_normalized = Self::normalize_for_fuzzy(query);
        let query_tokens: Vec<String> = query_lower
            .split_whitespace()
            .map(ToOwned::to_owned)
            .collect();
        let limit = max_results.unwrap_or(200).clamp(1, 2000);

        let search_roots = Self::resolve_search_roots(path)?;
        if Self::is_global_path(path) && recursive {
            return Self::search_from_global_index(
                path,
                &search_roots,
                &query_lower,
                &query_normalized,
                &query_tokens,
                limit,
            );
        }

        let mut scored: Vec<(i32, FileInfo)> = Vec::new();
        let mut scanned: usize = 0;
        let max_scanned: usize = 150_000;

        for root in search_roots {
            let walker = if recursive {
                WalkDir::new(&root)
            } else {
                WalkDir::new(&root).max_depth(1)
            };

            for entry in walker.into_iter().filter_map(|e| e.ok()) {
                scanned += 1;
                if scanned > max_scanned {
                    break;
                }

                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.is_empty() {
                    continue;
                }

                let full_path = entry.path().to_string_lossy().to_string();
                let maybe_score = Self::score_search_candidate(
                    &file_name,
                    &full_path,
                    &query_lower,
                    &query_normalized,
                    &query_tokens,
                );

                if let Some(score) = maybe_score {
                    if let Ok(metadata) = entry.metadata() {
                        let file_info = Self::metadata_to_file_info(
                            &file_name,
                            entry.path(),
                            &metadata,
                        )?;
                        scored.push((score, file_info));
                    }
                }
            }
        }

        scored.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.name.to_lowercase().cmp(&b.1.name.to_lowercase()))
                .then_with(|| a.1.path.cmp(&b.1.path))
        });
        scored.truncate(limit);

        let matches: Vec<FileInfo> = scored.into_iter().map(|(_, item)| item).collect();
        let total_matches = matches.len();

        Ok(ResponseData::SearchResult(SearchResult {
            path: path.to_string(),
            matches,
            total_matches,
        }))
    }

    fn search_from_global_index(
        path: &str,
        search_roots: &[String],
        query_lower: &str,
        query_normalized: &str,
        query_tokens: &[String],
        limit: usize,
    ) -> Result<ResponseData> {
        let cache = GLOBAL_SEARCH_INDEX.get_or_init(|| Mutex::new(SearchIndexCache::default()));
        let mut state = cache
            .lock()
            .map_err(|_| anyhow::anyhow!("Global search index lock is poisoned"))?;

        let roots_key = Self::roots_cache_key(search_roots);
        let is_empty = state.entries.is_empty();
        let roots_changed = state.roots_key != roots_key;
        let is_stale = state
            .built_at
            .map(|built| built.elapsed() > GLOBAL_INDEX_TTL)
            .unwrap_or(true);

        if is_empty || roots_changed {
            *state = Self::build_global_index(search_roots, &roots_key)?;
        } else if is_stale && !state.refresh_in_progress {
            state.refresh_in_progress = true;
            Self::spawn_global_index_refresh(search_roots.to_vec(), roots_key.clone());
        }

        let indexed_entries = state.entries.clone();
        drop(state);

        let mut scored: Vec<(i32, FileInfo)> = indexed_entries
            .iter()
            .filter_map(|entry| {
                Self::score_indexed_candidate(entry, query_lower, query_normalized, query_tokens)
                    .map(|score| (score, entry.info.clone()))
            })
            .collect();

        scored.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then_with(|| a.1.name.to_lowercase().cmp(&b.1.name.to_lowercase()))
                .then_with(|| a.1.path.cmp(&b.1.path))
        });
        scored.truncate(limit);

        let matches: Vec<FileInfo> = scored.into_iter().map(|(_, item)| item).collect();
        let total_matches = matches.len();

        Ok(ResponseData::SearchResult(SearchResult {
            path: path.to_string(),
            matches,
            total_matches,
        }))
    }

    fn suggest_paths(input: &str, current_path: &str, limit: Option<usize>) -> Result<ResponseData> {
        let trimmed = input.trim();
        let cap = limit.unwrap_or(20).clamp(1, 100);

        let (base_dir, prefix) = Self::split_path_for_suggestions(trimmed, current_path);
        let base = Path::new(&base_dir);
        if !base.exists() || !base.is_dir() {
            return Ok(ResponseData::PathSuggestions(PathSuggestions {
                input: input.to_string(),
                suggestions: Vec::new(),
            }));
        }

        let prefix_lower = prefix.to_lowercase();
        let mut suggestions = Vec::new();

        for entry in fs::read_dir(base)? {
            let entry = match entry {
                Ok(item) => item,
                Err(_) => continue,
            };

            let metadata = match entry.metadata() {
                Ok(meta) => meta,
                Err(_) => continue,
            };

            if !metadata.is_dir() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            if !prefix_lower.is_empty() && !name.to_lowercase().starts_with(&prefix_lower) {
                continue;
            }

            suggestions.push(entry.path().to_string_lossy().to_string());
            if suggestions.len() >= cap {
                break;
            }
        }

        suggestions.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

        Ok(ResponseData::PathSuggestions(PathSuggestions {
            input: input.to_string(),
            suggestions,
        }))
    }

    fn split_path_for_suggestions(input: &str, current_path: &str) -> (String, String) {
        if input.is_empty() {
            return (current_path.to_string(), String::new());
        }

        let sanitized = input.replace('\\', "/");
        if sanitized.ends_with('/') {
            return (input.to_string(), String::new());
        }

        let as_path = Path::new(input);
        if as_path.is_absolute() {
            let prefix = as_path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let base = as_path
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| input.to_string());
            return (base, prefix);
        }

        let combined = Path::new(current_path).join(input);
        let prefix = combined
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let base = combined
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| current_path.to_string());
        (base, prefix)
    }

    fn protect_path(path: &str) -> Result<ResponseData> {
        let normalized = Self::normalize_path(path);
        let set = PROTECTED_PATHS.get_or_init(|| Mutex::new(HashSet::new()));
        let mut guard = set
            .lock()
            .map_err(|_| anyhow::anyhow!("Protected path lock is poisoned"))?;
        guard.insert(normalized.clone());

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Protected: {}", normalized)),
            affected_paths: Some(vec![normalized]),
        }))
    }

    fn unprotect_path(path: &str) -> Result<ResponseData> {
        let normalized = Self::normalize_path(path);
        let set = PROTECTED_PATHS.get_or_init(|| Mutex::new(HashSet::new()));
        let mut guard = set
            .lock()
            .map_err(|_| anyhow::anyhow!("Protected path lock is poisoned"))?;
        guard.remove(&normalized);

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Unprotected: {}", normalized)),
            affected_paths: Some(vec![normalized]),
        }))
    }

    fn list_protected() -> Result<ResponseData> {
        let set = PROTECTED_PATHS.get_or_init(|| Mutex::new(HashSet::new()));
        let guard = set
            .lock()
            .map_err(|_| anyhow::anyhow!("Protected path lock is poisoned"))?;
        let mut items: Vec<String> = guard.iter().cloned().collect();
        items.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        Ok(ResponseData::ProtectedPaths(ProtectedPaths { items }))
    }

    fn start_share(path: &str, expires_minutes: Option<i64>) -> Result<ResponseData> {
        let normalized = Self::normalize_path(path);
        let path_buf = PathBuf::from(&normalized);
        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", normalized);
        }

        let now = Utc::now().timestamp();
        let expires_at = expires_minutes
            .filter(|m| *m > 0)
            .map(|m| now + (m * 60));
        let session_id = Uuid::new_v4().to_string();
        let is_directory = path_buf.is_dir();
        let url = format!("http://127.0.0.1:3030/share/{}", session_id);

        let session = ShareSession {
            id: session_id.clone(),
            path: normalized.clone(),
            is_directory,
            created_at: now,
            expires_at,
        };

        let store = SHARE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut guard = store
            .lock()
            .map_err(|_| anyhow::anyhow!("Share session lock is poisoned"))?;
        Self::cleanup_expired_shares(&mut guard, now);
        guard.insert(session_id.clone(), session.clone());

        Ok(ResponseData::ShareInfo(ShareInfo {
            id: session.id,
            path: session.path,
            is_directory: session.is_directory,
            created_at: session.created_at,
            expires_at: session.expires_at,
            url,
        }))
    }

    fn stop_share(share_id: &str) -> Result<ResponseData> {
        let store = SHARE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut guard = store
            .lock()
            .map_err(|_| anyhow::anyhow!("Share session lock is poisoned"))?;
        guard.remove(share_id);

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Share stopped: {}", share_id)),
            affected_paths: None,
        }))
    }

    fn list_shares() -> Result<ResponseData> {
        let store = SHARE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut guard = store
            .lock()
            .map_err(|_| anyhow::anyhow!("Share session lock is poisoned"))?;
        let now = Utc::now().timestamp();
        Self::cleanup_expired_shares(&mut guard, now);

        let mut items: Vec<ShareInfo> = guard
            .values()
            .cloned()
            .map(|s| ShareInfo {
                id: s.id.clone(),
                path: s.path.clone(),
                is_directory: s.is_directory,
                created_at: s.created_at,
                expires_at: s.expires_at,
                url: format!("http://127.0.0.1:3030/share/{}", s.id),
            })
            .collect();
        items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(ResponseData::ShareList(ShareList { items }))
    }

    fn create_archive(sources: &[String], archive_path: &str) -> Result<ResponseData> {
        if sources.is_empty() {
            anyhow::bail!("No sources provided for archive creation");
        }

        Self::ensure_path_not_protected(archive_path, "archive create")?;
        for src in sources {
            if !Path::new(src).exists() {
                anyhow::bail!("Source does not exist: {}", src);
            }
        }

        #[cfg(windows)]
        {
            let src_list = sources
                .iter()
                .map(|s| format!("'{}'", Self::ps_quote(s)))
                .collect::<Vec<_>>()
                .join(", ");
            let script = format!(
                "$src=@({}); Compress-Archive -Path $src -DestinationPath '{}' -Force",
                src_list,
                Self::ps_quote(archive_path)
            );
            let status = ProcCommand::new("powershell")
                .args(["-NoProfile", "-Command", &script])
                .status()
                .context("Failed to run PowerShell Compress-Archive")?;
            if !status.success() {
                anyhow::bail!("Archive creation failed");
            }
        }

        #[cfg(not(windows))]
        {
            let mut cmd = ProcCommand::new("tar");
            cmd.arg("-czf").arg(archive_path);
            for src in sources {
                cmd.arg(src);
            }
            let status = cmd.status().context("Failed to run tar for archive creation")?;
            if !status.success() {
                anyhow::bail!("Archive creation failed");
            }
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Archive created: {}", archive_path)),
            affected_paths: Some(vec![archive_path.to_string()]),
        }))
    }

    fn extract_archive(archive_path: &str, destination_path: &str) -> Result<ResponseData> {
        Self::ensure_path_not_protected(destination_path, "archive extract")?;
        if !Path::new(archive_path).exists() {
            anyhow::bail!("Archive does not exist: {}", archive_path);
        }
        fs::create_dir_all(destination_path)?;

        #[cfg(windows)]
        {
            let script = format!(
                "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                Self::ps_quote(archive_path),
                Self::ps_quote(destination_path)
            );
            let status = ProcCommand::new("powershell")
                .args(["-NoProfile", "-Command", &script])
                .status()
                .context("Failed to run PowerShell Expand-Archive")?;
            if !status.success() {
                anyhow::bail!("Archive extraction failed");
            }
        }

        #[cfg(not(windows))]
        {
            let status = ProcCommand::new("tar")
                .args(["-xzf", archive_path, "-C", destination_path])
                .status()
                .context("Failed to run tar for archive extraction")?;
            if !status.success() {
                anyhow::bail!("Archive extraction failed");
            }
        }

        Ok(ResponseData::OperationResult(OperationResult {
            success: true,
            message: Some(format!("Archive extracted to: {}", destination_path)),
            affected_paths: Some(vec![destination_path.to_string()]),
        }))
    }

    pub fn resolve_share_download(share_id: &str, tail: Option<&str>) -> Result<ResolvedShareTarget> {
        let store = SHARE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()));
        let mut guard = store
            .lock()
            .map_err(|_| anyhow::anyhow!("Share session lock is poisoned"))?;
        let now = Utc::now().timestamp();
        Self::cleanup_expired_shares(&mut guard, now);

        let session = guard
            .get(share_id)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Share not found or expired"))?;

        let root = PathBuf::from(session.path);
        if !root.exists() {
            anyhow::bail!("Shared path no longer exists");
        }

        if !session.is_directory {
            return Ok(ResolvedShareTarget::File(root));
        }

        let maybe_tail = tail.unwrap_or("").trim_matches('/');
        if maybe_tail.is_empty() {
            return Ok(ResolvedShareTarget::DirectoryRoot(root));
        }

        let candidate = root.join(maybe_tail);
        let candidate_norm = candidate.canonicalize().unwrap_or(candidate);
        let root_norm = root.canonicalize().unwrap_or(root);
        if !candidate_norm.starts_with(&root_norm) {
            anyhow::bail!("Requested file is outside of shared directory");
        }
        if !candidate_norm.exists() {
            anyhow::bail!("Requested file not found");
        }
        if candidate_norm.is_dir() {
            Ok(ResolvedShareTarget::DirectoryRoot(candidate_norm))
        } else {
            Ok(ResolvedShareTarget::File(candidate_norm))
        }
    }

    fn cleanup_expired_shares(store: &mut HashMap<String, ShareSession>, now: i64) {
        store.retain(|_, session| match session.expires_at {
            Some(exp) => exp > now,
            None => true,
        });
    }

    fn ensure_path_not_protected(path: &str, action: &str) -> Result<()> {
        if !Self::is_path_or_ancestor_protected(path)? {
            return Ok(());
        }
        anyhow::bail!("Path is protected and cannot be modified ({}): {}", action, path);
    }

    fn is_path_or_ancestor_protected(path: &str) -> Result<bool> {
        let set = PROTECTED_PATHS.get_or_init(|| Mutex::new(HashSet::new()));
        let guard = set
            .lock()
            .map_err(|_| anyhow::anyhow!("Protected path lock is poisoned"))?;
        if guard.is_empty() {
            return Ok(false);
        }

        let target = Self::normalize_path(path);
        for protected in guard.iter() {
            if target == *protected {
                return Ok(true);
            }

            let with_sep = if protected.ends_with('\\') || protected.ends_with('/') {
                protected.clone()
            } else {
                format!("{protected}{}", std::path::MAIN_SEPARATOR)
            };

            if target.starts_with(&with_sep) {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn normalize_path(path: &str) -> String {
        let raw = PathBuf::from(path);
        raw.canonicalize()
            .unwrap_or(raw)
            .to_string_lossy()
            .to_string()
    }

    #[cfg(windows)]
    fn ps_quote(value: &str) -> String {
        value.replace('\'', "''")
    }

    fn resolve_search_roots(path: &str) -> Result<Vec<String>> {
        if Self::is_global_path(path) {
            #[cfg(windows)]
            {
                let mut roots = Vec::new();
                for letter in b'A'..=b'Z' {
                    let drive = format!("{}:\\", letter as char);
                    if Path::new(&drive).exists() {
                        roots.push(drive);
                    }
                }
                if roots.is_empty() {
                    anyhow::bail!("No available filesystem roots for global search");
                }
                return Ok(roots);
            }

            #[cfg(not(windows))]
            {
                return Ok(vec!["/".to_string()]);
            }
        }

        let path_buf = Path::new(path);
        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }
        Ok(vec![path.to_string()])
    }

    fn is_global_path(path: &str) -> bool {
        path == "__global__" || path == "*"
    }

    fn roots_cache_key(roots: &[String]) -> String {
        let mut sorted = roots.to_vec();
        sorted.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
        sorted.join("|")
    }

    fn build_global_index(roots: &[String], roots_key: &str) -> Result<SearchIndexCache> {
        let mut entries: Vec<SearchIndexEntry> = Vec::new();
        let mut scanned: usize = 0;

        for root in roots {
            for item in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
                scanned += 1;
                if scanned > GLOBAL_INDEX_MAX_ENTRIES {
                    break;
                }

                let name = item.file_name().to_string_lossy().to_string();
                if name.is_empty() {
                    continue;
                }

                let metadata = match item.metadata() {
                    Ok(meta) => meta,
                    Err(_) => continue,
                };

                let file_info = Self::metadata_to_file_info(&name, item.path(), &metadata)?;
                let name_lower = file_info.name.to_lowercase();
                let path_lower = file_info.path.to_lowercase();
                let name_norm = Self::normalize_for_fuzzy(&name_lower);
                let stem_norm = Self::normalize_for_fuzzy(
                    name_lower
                        .rsplit_once('.')
                        .map(|(stem, _)| stem)
                        .unwrap_or(&name_lower),
                );

                entries.push(SearchIndexEntry {
                    info: file_info,
                    name_lower,
                    path_lower,
                    name_norm,
                    stem_norm,
                });
            }
        }

        Ok(SearchIndexCache {
            roots_key: roots_key.to_string(),
            built_at: Some(Instant::now()),
            entries,
            refresh_in_progress: false,
        })
    }

    fn spawn_global_index_refresh(search_roots: Vec<String>, roots_key: String) {
        thread::spawn(move || {
            let rebuilt = Self::build_global_index(&search_roots, &roots_key);
            let Some(cache) = GLOBAL_SEARCH_INDEX.get() else {
                return;
            };

            let Ok(mut state) = cache.lock() else {
                return;
            };

            match rebuilt {
                Ok(new_state) => {
                    *state = new_state;
                }
                Err(_) => {
                    state.refresh_in_progress = false;
                }
            }
        });
    }

    fn score_indexed_candidate(
        entry: &SearchIndexEntry,
        query_lower: &str,
        query_normalized: &str,
        query_tokens: &[String],
    ) -> Option<i32> {
        let mut score = 0i32;

        if entry.name_lower == query_lower {
            score += 220;
        }
        if entry.name_lower.contains(query_lower) {
            score += 120;
        }
        if entry.path_lower.contains(query_lower) {
            score += 70;
        }
        if entry.name_norm == query_normalized {
            score += 110;
        }
        if entry.name_norm.contains(query_normalized) || entry.stem_norm.contains(query_normalized) {
            score += 60;
        }

        if !query_tokens.is_empty() {
            let mut matched_tokens = 0i32;
            for token in query_tokens {
                if entry.name_lower.contains(token) || entry.path_lower.contains(token) {
                    matched_tokens += 1;
                }
            }
            score += matched_tokens * 22;
            if matched_tokens == query_tokens.len() as i32 {
                score += 35;
            }
        }

        let distance = Self::levenshtein_limited(&entry.name_norm, query_normalized, 3);
        if let Some(d) = distance {
            if d == 0 {
                score += 90;
            } else {
                score += (40 - (d as i32 * 12)).max(0);
            }
        }

        (score > 0).then_some(score)
    }

    fn score_search_candidate(
        name: &str,
        full_path: &str,
        query_lower: &str,
        query_normalized: &str,
        query_tokens: &[String],
    ) -> Option<i32> {
        let name_lower = name.to_lowercase();
        let path_lower = full_path.to_lowercase();
        let name_norm = Self::normalize_for_fuzzy(&name_lower);
        let stem_norm = Self::normalize_for_fuzzy(
            name_lower
                .rsplit_once('.')
                .map(|(stem, _)| stem)
                .unwrap_or(&name_lower),
        );

        let mut score = 0i32;

        if name_lower == query_lower {
            score += 220;
        }
        if name_lower.contains(query_lower) {
            score += 120;
        }
        if path_lower.contains(query_lower) {
            score += 70;
        }
        if name_norm == query_normalized {
            score += 110;
        }
        if name_norm.contains(query_normalized) || stem_norm.contains(query_normalized) {
            score += 60;
        }

        if !query_tokens.is_empty() {
            let mut matched_tokens = 0i32;
            for token in query_tokens {
                if name_lower.contains(token) || path_lower.contains(token) {
                    matched_tokens += 1;
                }
            }
            score += matched_tokens * 22;
            if matched_tokens == query_tokens.len() as i32 {
                score += 35;
            }
        }

        let distance = Self::levenshtein_limited(&name_norm, query_normalized, 3);
        if let Some(d) = distance {
            if d == 0 {
                score += 90;
            } else {
                score += (40 - (d as i32 * 12)).max(0);
            }
        }

        if score > 0 {
            Some(score)
        } else {
            None
        }
    }

    fn normalize_for_fuzzy(input: &str) -> String {
        input
            .chars()
            .flat_map(|c| c.to_lowercase())
            .filter(|c| c.is_ascii_alphanumeric())
            .collect()
    }

    fn levenshtein_limited(a: &str, b: &str, max_distance: usize) -> Option<usize> {
        if a == b {
            return Some(0);
        }
        if a.is_empty() {
            return (b.len() <= max_distance).then_some(b.len());
        }
        if b.is_empty() {
            return (a.len() <= max_distance).then_some(a.len());
        }

        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();
        let mut prev: Vec<usize> = (0..=b_chars.len()).collect();
        let mut curr = vec![0usize; b_chars.len() + 1];

        for (i, ca) in a_chars.iter().enumerate() {
            curr[0] = i + 1;
            let mut row_min = curr[0];

            for (j, cb) in b_chars.iter().enumerate() {
                let cost = if ca == cb { 0 } else { 1 };
                curr[j + 1] = (prev[j + 1] + 1)
                    .min(curr[j] + 1)
                    .min(prev[j] + cost);
                row_min = row_min.min(curr[j + 1]);
            }

            if row_min > max_distance {
                return None;
            }
            prev.clone_from_slice(&curr);
        }

        let dist = prev[b_chars.len()];
        (dist <= max_distance).then_some(dist)
    }

    fn metadata_to_file_info(
        name: &str,
        path: &Path,
        metadata: &fs::Metadata,
    ) -> Result<FileInfo> {
        let file_type = if metadata.is_dir() {
            FileType::Directory
        } else if metadata.is_symlink() {
            FileType::Symlink
        } else {
            FileType::File
        };

        // Get timestamps
        let created = metadata.created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let modified = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let accessed = metadata.accessed()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        // Get permissions
        #[cfg(unix)]
        let permissions = {
            let mode = metadata.permissions().mode();
            format!("{:o}", mode & 0o777)
        };
        
        #[cfg(not(unix))]
        let permissions = if metadata.permissions().readonly() {
            "r--".to_string()
        } else {
            "rw-".to_string()
        };

        let is_hidden = name.starts_with('.');

        Ok(FileInfo {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            file_type,
            size: metadata.len(),
            created,
            modified,
            accessed,
            permissions,
            is_hidden,
        })
    }
}

// Note: base64 crate is not in dependencies, need to add it
// For now, I'll provide a simple implementation
mod base64 {
    use std::io::{Error, ErrorKind};

    pub fn encode(data: &[u8]) -> String {
        let mut result = String::new();
        for chunk in data.chunks(3) {
            let mut buf = [0u8; 3];
            for (i, &byte) in chunk.iter().enumerate() {
                buf[i] = byte;
            }
            
            let b64_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let i1 = (buf[0] >> 2) as usize;
            let i2 = (((buf[0] & 0x03) << 4) | (buf[1] >> 4)) as usize;
            let i3 = (((buf[1] & 0x0f) << 2) | (buf[2] >> 6)) as usize;
            let i4 = (buf[2] & 0x3f) as usize;
            
            result.push(b64_chars.chars().nth(i1).unwrap());
            result.push(b64_chars.chars().nth(i2).unwrap());
            
            if chunk.len() > 1 {
                result.push(b64_chars.chars().nth(i3).unwrap());
            } else {
                result.push('=');
            }
            
            if chunk.len() > 2 {
                result.push(b64_chars.chars().nth(i4).unwrap());
            } else {
                result.push('=');
            }
        }
        result
    }

    pub fn decode(_s: &str) -> Result<Vec<u8>, Error> {
        // Simplified base64 decoder
        Err(Error::new(ErrorKind::Other, "Not implemented - use base64 crate"))
    }
}
