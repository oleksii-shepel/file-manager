use axum::{
    body::Body,
    extract::{Json, Path},
    http::StatusCode,
    response::{Html, IntoResponse, Response as AxumResponse},
};
use std::fs;
use std::path::PathBuf;
use crate::commands::CommandExecutor;
use crate::protocol::{Command, Response};

pub async fn handle_command(
    Json(command): Json<Command>,
) -> Result<Json<Response>, ApiError> {
    tracing::info!("Received command: {:?}", command);
    
    // Execute command
    let response = CommandExecutor::execute(command);
    
    tracing::info!("Command executed successfully");
    Ok(Json(response))
}

pub async fn handle_share_root(
    Path(share_id): Path<String>,
) -> Result<AxumResponse, ApiError> {
    handle_share_internal(share_id, None).await
}

pub async fn handle_share_file(
    Path((share_id, tail)): Path<(String, String)>,
) -> Result<AxumResponse, ApiError> {
    handle_share_internal(share_id, Some(tail)).await
}

async fn handle_share_internal(
    share_id: String,
    tail: Option<String>,
) -> Result<AxumResponse, ApiError> {
    let resolved = crate::commands::CommandExecutor::resolve_share_download(&share_id, tail.as_deref())
        .map_err(|e| ApiError::new(StatusCode::NOT_FOUND, e.to_string()))?;

    match resolved {
        crate::commands::ResolvedShareTarget::DirectoryRoot(dir) => {
            let html = render_directory_listing(&share_id, &dir)?;
            Ok(Html(html).into_response())
        }
        crate::commands::ResolvedShareTarget::File(file_path) => {
            let bytes = fs::read(&file_path)
                .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            let mime = guess_mime(&file_path);
            let response = axum::http::Response::builder()
                .status(StatusCode::OK)
                .header("content-type", mime)
                .body(Body::from(bytes))
                .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            Ok(response)
        }
    }
}

fn render_directory_listing(share_id: &str, dir: &PathBuf) -> Result<String, ApiError> {
    let mut rows = String::new();
    let entries = fs::read_dir(dir)
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = path
            .strip_prefix(dir)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or(name.clone());
        let href = format!("/share/{}/{}", share_id, rel);
        rows.push_str(&format!("<li><a href=\"{}\">{}</a></li>", href, name));
    }

    Ok(format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>Shared Directory</title></head><body><h1>Shared Directory</h1><ul>{}</ul></body></html>",
        rows
    ))
}

fn guess_mime(path: &PathBuf) -> &'static str {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "txt" | "md" | "log" => "text/plain; charset=utf-8",
        "json" => "application/json",
        "pdf" => "application/pdf",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

// Error handling
pub struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> AxumResponse {
        let body = serde_json::json!({
            "error": {
                "code": self.status.as_u16(),
                "message": self.message,
            }
        });

        (self.status, Json(body)).into_response()
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(err: serde_json::Error) -> Self {
        ApiError::new(StatusCode::BAD_REQUEST, err.to_string())
    }
}
