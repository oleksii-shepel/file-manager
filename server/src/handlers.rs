use axum::{
    extract::Json,
    http::StatusCode,
    response::{IntoResponse, Response as AxumResponse},
};
use crate::commands::CommandExecutor;
use crate::protocol::{Command, Response};

pub async fn handle_command(
    Json(command): Json<Command>,
) -> Result<Json<Response>, ApiError> {
    tracing::info!("Received command: {:?}", command);
    
    // Log command type for better debugging
    match &command {
        Command::ListDrives { .. } => tracing::info!("Processing ListDrives command"),
        Command::GetOsInfo { .. } => tracing::info!("Processing GetOsInfo command"),
        Command::ListDirectory { path, .. } => tracing::info!("Processing ListDirectory for path: {}", path),
        Command::ReadFile { path, .. } => tracing::info!("Processing ReadFile for path: {}", path),
        Command::WriteFile { path, .. } => tracing::info!("Processing WriteFile for path: {}", path),
        Command::DeleteFile { path, .. } => tracing::info!("Processing DeleteFile for path: {}", path),
        Command::CreateDirectory { path, .. } => tracing::info!("Processing CreateDirectory for path: {}", path),
        Command::MoveFile { source, destination, .. } => tracing::info!("Processing MoveFile from {} to {}", source, destination),
        Command::CopyFile { source, destination, .. } => tracing::info!("Processing CopyFile from {} to {}", source, destination),
        Command::GetFileInfo { path, .. } => tracing::info!("Processing GetFileInfo for path: {}", path),
        Command::SearchFiles { path, pattern, .. } => tracing::info!("Processing SearchFiles in {} for pattern: {}", path, pattern),
        // Archive-related commands
        Command::ListArchive { archive_path, inner_path, .. } => tracing::info!("Processing ListArchive: {} (inner: {})", archive_path, inner_path),
        Command::ReadArchiveFile { archive_path, inner_path, .. } => tracing::info!("Processing ReadArchiveFile: {} (inner: {})", archive_path, inner_path),
        Command::ExtractArchive { archive_path, destination, .. } => tracing::info!("Processing ExtractArchive: {} -> {}", archive_path, destination),
        _ => tracing::info!("Processing command"),
    }
    
    // Execute command
    let response = CommandExecutor::execute(command);
    
    // Log response status
    match &response {
        Response::Success { command_id, .. } => {
            tracing::info!("Command {} executed successfully", command_id);
        }
        Response::Error { command_id, error, .. } => {
            tracing::error!("Command {} failed: {} - {}", command_id, error.code, error.message);
        }
    }
    
    Ok(Json(response))
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

impl From<anyhow::Error> for ApiError {
    fn from(err: anyhow::Error) -> Self {
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
    }
}

impl From<std::io::Error> for ApiError {
    fn from(err: std::io::Error) -> Self {
        ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
    }
}