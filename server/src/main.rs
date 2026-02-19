mod archive;
mod protocol;

use std::net::SocketAddr;
use std::path::Path;

use anyhow::Result;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use walkdir::WalkDir;

use protocol::*;

// ============================================================================
// App State
// ============================================================================

#[derive(Clone)]
struct AppState {}

// ============================================================================
// Main
// ============================================================================

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let state = AppState {};

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(health))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    info!("Server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> &'static str {
    "OK"
}

// ============================================================================
// WebSocket upgrade
// ============================================================================

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, _state: AppState) {
    let (mut sender, mut receiver) = socket.split();

    while let Some(msg) = receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                let response_text = match process_message(&text) {
                    Ok(r) => r,
                    Err(e) => {
                        error!("Error processing message: {e}");
                        // Return a generic error response
                        let err_resp = Response::Error {
                            command_id: "unknown".to_string(),
                            timestamp: Utc::now().timestamp_millis(),
                            error: ErrorInfo {
                                code: "INTERNAL_ERROR".to_string(),
                                message: e.to_string(),
                                details: None,
                            },
                        };
                        serde_json::to_string(&err_resp).unwrap_or_default()
                    }
                };
                if sender.send(Message::Text(response_text)).await.is_err() {
                    break;
                }
            }
            Ok(Message::Ping(data)) => {
                let _ = sender.send(Message::Pong(data)).await;
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                error!("WebSocket error: {e}");
                break;
            }
            _ => {}
        }
    }
}

// ============================================================================
// Message processing
// ============================================================================

fn process_message(text: &str) -> Result<String> {
    // Support both wrapped { type: "COMMAND", payload: {...} } and bare command objects
    let cmd: Command = if let Ok(v) = serde_json::from_str::<Value>(text) {
        if v.get("type").and_then(|t| t.as_str()) == Some("COMMAND") {
            let payload = v
                .get("payload")
                .cloned()
                .unwrap_or(Value::Null);
            serde_json::from_value(payload)?
        } else {
            serde_json::from_value(v)?
        }
    } else {
        serde_json::from_str(text)?
    };

    let command_id = cmd.id().to_string();
    let timestamp = Utc::now().timestamp_millis();

    let result = handle_command(cmd);

    let response = match result {
        Ok(data) => Response::Success {
            command_id,
            timestamp,
            data,
        },
        Err(e) => Response::Error {
            command_id,
            timestamp,
            error: ErrorInfo {
                code: error_code(&e),
                message: e.to_string(),
                details: None,
            },
        },
    };

    Ok(serde_json::to_string(&response)?)
}

fn error_code(e: &anyhow::Error) -> String {
    let msg = e.to_string().to_lowercase();
    if msg.contains("not found") || msg.contains("no such file") {
        "NOT_FOUND"
    } else if msg.contains("permission") || msg.contains("access denied") {
        "PERMISSION_DENIED"
    } else if msg.contains("unrecognised archive") || msg.contains("not a valid") {
        "UNSUPPORTED_FORMAT"
    } else {
        "OPERATION_FAILED"
    }
    .to_string()
}

// ============================================================================
// Command handlers
// ============================================================================

fn handle_command(cmd: Command) -> Result<ResponseData> {
    match cmd {
        Command::GetOsInfo { .. } => handle_get_os_info(),
        Command::ListDrives { .. } => handle_list_drives(),
        Command::ListDirectory { path, show_hidden, .. } => {
            handle_list_directory(&path, show_hidden)
        }
        Command::ReadFile { path, encoding, .. } => handle_read_file(&path, encoding.as_deref()),
        Command::WriteFile { path, content, encoding, .. } => {
            handle_write_file(&path, &content, encoding.as_deref())
        }
        Command::DeleteFile { path, recursive, .. } => handle_delete_file(&path, recursive),
        Command::CreateDirectory { path, recursive, .. } => {
            handle_create_directory(&path, recursive)
        }
        Command::MoveFile { source, destination, .. } => handle_move_file(&source, &destination),
        Command::CopyFile { source, destination, recursive, .. } => {
            handle_copy_file(&source, &destination, recursive)
        }
        Command::GetFileInfo { path, .. } => handle_get_file_info(&path),
        Command::SearchFiles { path, pattern, recursive, .. } => {
            handle_search_files(&path, &pattern, recursive)
        }
        // Archive commands
        Command::ListArchive { archive_path, inner_path, .. } => {
            handle_list_archive(&archive_path, &inner_path)
        }
        Command::ReadArchiveFile { archive_path, inner_path, encoding, .. } => {
            handle_read_archive_file(&archive_path, &inner_path, encoding.as_deref())
        }
        Command::ExtractArchive { archive_path, destination, inner_paths, .. } => {
            handle_extract_archive(&archive_path, &destination, &inner_paths)
        }
    }
}

// ============================================================================
// OS Info
// ============================================================================

fn handle_get_os_info() -> Result<ResponseData> {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    Ok(ResponseData::OsInfo(OsInfo {
        os,
        version: "unknown".to_string(),
        arch,
        hostname,
        system_drive: system_drive(),
    }))
}

fn system_drive() -> Option<String> {
    #[cfg(windows)]
    {
        Some("C:\\".to_string())
    }
    #[cfg(not(windows))]
    {
        Some("/".to_string())
    }
}

// ============================================================================
// Drives
// ============================================================================

fn handle_list_drives() -> Result<ResponseData> {
    #[cfg(unix)]
    {
        let stat = nix_statvfs("/");
        let drives = vec![DriveInfo {
            name: "Root".to_string(),
            path: "/".to_string(),
            drive_type: "fixed".to_string(),
            total_space: stat.map(|(t, _)| t).unwrap_or(0),
            free_space: stat.map(|(_, f)| f).unwrap_or(0),
            file_system: Some("unknown".to_string()),
        }];
        Ok(ResponseData::DrivesList(DrivesList { drives }))
    }
    #[cfg(windows)]
    {
        Ok(ResponseData::DrivesList(DrivesList { drives: vec![] }))
    }
}

#[cfg(unix)]
fn nix_statvfs(path: &str) -> Option<(u64, u64)> {
    use std::os::unix::fs::MetadataExt;
    // Simple fallback: use std::fs::metadata isn't enough; skip for now
    let _ = path;
    None
}

// ============================================================================
// Directory listing
// ============================================================================

fn handle_list_directory(path: &str, show_hidden: bool) -> Result<ResponseData> {
    let dir = std::fs::read_dir(path)?;
    let mut entries = Vec::new();
    let mut total_size = 0u64;

    for entry in dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let file_type = if meta.is_dir() {
            FileType::Directory
        } else if meta.is_symlink() {
            FileType::Symlink
        } else {
            FileType::File
        };

        let size = meta.len();
        total_size += size;

        let created = meta
            .created()
            .map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        let modified = meta
            .modified()
            .map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0)
            })
            .unwrap_or(0);
        let accessed = meta
            .accessed()
            .map(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0)
            })
            .unwrap_or(0);

        let full_path = entry.path().to_string_lossy().to_string();
        let is_hidden = name.starts_with('.');

        #[cfg(unix)]
        let permissions = {
            use std::os::unix::fs::PermissionsExt;
            format!("{:o}", meta.permissions().mode())
        };
        #[cfg(not(unix))]
        let permissions = "rwxrwxrwx".to_string();

        entries.push(FileInfo {
            name,
            path: full_path,
            file_type,
            size,
            created,
            modified,
            accessed,
            permissions,
            is_hidden,
        });
    }

    entries.sort_by(|a, b| {
        let ord = matches!(b.file_type, FileType::Directory)
            .cmp(&matches!(a.file_type, FileType::Directory));
        ord.then(a.name.cmp(&b.name))
    });

    Ok(ResponseData::DirectoryListing(DirectoryListing {
        path: path.to_string(),
        entries,
        total_size,
    }))
}

// ============================================================================
// File read/write
// ============================================================================

fn handle_read_file(path: &str, encoding: Option<&str>) -> Result<ResponseData> {
    let bytes = std::fs::read(path)?;
    let size = bytes.len() as u64;

    let (content, enc) = match encoding {
        Some("base64") | None if is_binary(&bytes) => {
            (B64.encode(&bytes), "base64".to_string())
        }
        _ => (
            String::from_utf8_lossy(&bytes).to_string(),
            "utf-8".to_string(),
        ),
    };

    Ok(ResponseData::FileContent(FileContent {
        path: path.to_string(),
        content,
        encoding: enc,
        size,
    }))
}

fn is_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(8192)];
    sample.iter().any(|&b| b == 0)
}

fn handle_write_file(path: &str, content: &str, encoding: Option<&str>) -> Result<ResponseData> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    match encoding {
        Some("base64") => {
            let bytes = B64.decode(content)?;
            std::fs::write(path, bytes)?;
        }
        _ => {
            std::fs::write(path, content.as_bytes())?;
        }
    }

    Ok(ResponseData::OperationResult(OperationResult {
        success: true,
        message: None,
        affected_paths: Some(vec![path.to_string()]),
    }))
}

// ============================================================================
// File operations
// ============================================================================

fn handle_delete_file(path: &str, recursive: bool) -> Result<ResponseData> {
    let meta = std::fs::metadata(path)?;
    if meta.is_dir() {
        if recursive {
            std::fs::remove_dir_all(path)?;
        } else {
            std::fs::remove_dir(path)?;
        }
    } else {
        std::fs::remove_file(path)?;
    }
    Ok(ResponseData::OperationResult(OperationResult {
        success: true,
        message: None,
        affected_paths: Some(vec![path.to_string()]),
    }))
}

fn handle_create_directory(path: &str, recursive: bool) -> Result<ResponseData> {
    if recursive {
        std::fs::create_dir_all(path)?;
    } else {
        std::fs::create_dir(path)?;
    }
    Ok(ResponseData::OperationResult(OperationResult {
        success: true,
        message: None,
        affected_paths: Some(vec![path.to_string()]),
    }))
}

fn handle_move_file(source: &str, destination: &str) -> Result<ResponseData> {
    std::fs::rename(source, destination)?;
    Ok(ResponseData::OperationResult(OperationResult {
        success: true,
        message: None,
        affected_paths: Some(vec![source.to_string(), destination.to_string()]),
    }))
}

fn handle_copy_file(source: &str, destination: &str, _recursive: bool) -> Result<ResponseData> {
    let src_meta = std::fs::metadata(source)?;
    if src_meta.is_dir() {
        copy_dir_recursive(source, destination)?;
    } else {
        if let Some(parent) = Path::new(destination).parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(source, destination)?;
    }
    Ok(ResponseData::OperationResult(OperationResult {
        success: true,
        message: None,
        affected_paths: Some(vec![destination.to_string()]),
    }))
}

fn copy_dir_recursive(src: &str, dst: &str) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)?.flatten() {
        let src_path = entry.path();
        let dst_path = Path::new(dst).join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(
                &src_path.to_string_lossy(),
                &dst_path.to_string_lossy(),
            )?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

fn handle_get_file_info(path: &str) -> Result<ResponseData> {
    let meta = std::fs::metadata(path)?;
    let name = Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let file_type = if meta.is_dir() {
        FileType::Directory
    } else if meta.is_symlink() {
        FileType::Symlink
    } else {
        FileType::File
    };

    let created = meta
        .created()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0))
        .unwrap_or(0);
    let modified = meta
        .modified()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0))
        .unwrap_or(0);
    let accessed = meta
        .accessed()
        .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0))
        .unwrap_or(0);

    #[cfg(unix)]
    let permissions = {
        use std::os::unix::fs::PermissionsExt;
        format!("{:o}", meta.permissions().mode())
    };
    #[cfg(not(unix))]
    let permissions = "rwxrwxrwx".to_string();

    let is_hidden = name.starts_with('.');

    Ok(ResponseData::FileInfo(FileInfo {
        name,
        path: path.to_string(),
        file_type,
        size: meta.len(),
        created,
        modified,
        accessed,
        permissions,
        is_hidden,
    }))
}

fn handle_search_files(path: &str, pattern: &str, recursive: bool) -> Result<ResponseData> {
    let pattern_lower = pattern.to_lowercase();
    let mut matches = Vec::new();

    let walker = if recursive {
        WalkDir::new(path)
    } else {
        WalkDir::new(path).max_depth(1)
    };

    for entry in walker.into_iter().flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.to_lowercase().contains(&pattern_lower) {
            if let Ok(meta) = entry.metadata() {
                let file_type = if meta.is_dir() {
                    FileType::Directory
                } else {
                    FileType::File
                };
                let created = meta
                    .created()
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0))
                    .unwrap_or(0);
                let modified = meta
                    .modified()
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0))
                    .unwrap_or(0);

                #[cfg(unix)]
                let permissions = {
                    use std::os::unix::fs::PermissionsExt;
                    format!("{:o}", meta.permissions().mode())
                };
                #[cfg(not(unix))]
                let permissions = "rwxrwxrwx".to_string();

                let is_hidden = name.starts_with('.');
                matches.push(FileInfo {
                    name,
                    path: entry.path().to_string_lossy().to_string(),
                    file_type,
                    size: meta.len(),
                    created,
                    modified,
                    accessed: 0,
                    permissions,
                    is_hidden,
                });
            }
        }
    }

    let total = matches.len();
    Ok(ResponseData::SearchResult(SearchResult {
        path: path.to_string(),
        matches,
        total_matches: total,
    }))
}

// ============================================================================
// Archive command handlers
// ============================================================================

fn handle_list_archive(archive_path: &str, inner_path: &str) -> Result<ResponseData> {
    let listing = archive::list_archive(archive_path, inner_path)?;
    Ok(ResponseData::ArchiveListing(listing))
}

fn handle_read_archive_file(
    archive_path: &str,
    inner_path: &str,
    encoding: Option<&str>,
) -> Result<ResponseData> {
    let bytes = archive::read_archive_file(archive_path, inner_path)?;
    let size = bytes.len() as u64;

    let (content, enc) = match encoding {
        Some("base64") => (B64.encode(&bytes), "base64".to_string()),
        _ if is_binary(&bytes) => (B64.encode(&bytes), "base64".to_string()),
        _ => (String::from_utf8_lossy(&bytes).to_string(), "utf-8".to_string()),
    };

    Ok(ResponseData::FileContent(FileContent {
        path: format!("{}!/{}", archive_path, inner_path),
        content,
        encoding: enc,
        size,
    }))
}

fn handle_extract_archive(
    archive_path: &str,
    destination: &str,
    inner_paths: &[String],
) -> Result<ResponseData> {
    let extracted = archive::extract_archive(archive_path, destination, inner_paths)?;
    Ok(ResponseData::OperationResult(OperationResult {
        success: true,
        message: Some(format!("Extracted {} files", extracted.len())),
        affected_paths: Some(extracted),
    }))
}

// ============================================================================
// hostname helper (cross-platform)
// ============================================================================

mod hostname {
    pub fn get() -> Result<std::ffi::OsString, std::io::Error> {
        #[cfg(unix)]
        {
            let mut buf = [0u8; 256];
            let res = unsafe { libc::gethostname(buf.as_mut_ptr() as *mut libc::c_char, buf.len()) };
            if res == 0 {
                let len = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
                Ok(std::ffi::OsString::from(
                    String::from_utf8_lossy(&buf[..len]).to_string(),
                ))
            } else {
                Err(std::io::Error::last_os_error())
            }
        }
        #[cfg(windows)]
        {
            Ok(std::ffi::OsString::from("localhost"))
        }
        #[cfg(not(any(unix, windows)))]
        {
            Ok(std::ffi::OsString::from("localhost"))
        }
    }
}