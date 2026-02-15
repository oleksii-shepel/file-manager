use crate::protocol::*;
use anyhow::{Context, Result};
use chrono::Utc;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

pub struct CommandExecutor;

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
            Command::SearchFiles { path, pattern, recursive, .. } => {
                Self::search_files(&path, &pattern, recursive)
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

    fn search_files(path: &str, pattern: &str, recursive: bool) -> Result<ResponseData> {
        let path_buf = Path::new(path);
        
        if !path_buf.exists() {
            anyhow::bail!("Path does not exist: {}", path);
        }

        let pattern_lower = pattern.to_lowercase();
        let mut matches = Vec::new();

        let walker = if recursive {
            WalkDir::new(path_buf)
        } else {
            WalkDir::new(path_buf).max_depth(1)
        };

        for entry in walker.into_iter().filter_map(|e| e.ok()) {
            let file_name = entry.file_name().to_string_lossy();
            
            if file_name.to_lowercase().contains(&pattern_lower) {
                if let Ok(metadata) = entry.metadata() {
                    let file_info = Self::metadata_to_file_info(
                        &file_name,
                        entry.path(),
                        &metadata,
                    )?;
                    matches.push(file_info);
                }
            }
        }

        let total_matches = matches.len();

        Ok(ResponseData::SearchResult(SearchResult {
            path: path.to_string(),
            matches,
            total_matches,
        }))
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
