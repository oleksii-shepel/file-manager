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
    
    // Execute command
    let response = CommandExecutor::execute(command);
    
    tracing::info!("Command executed successfully");
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
