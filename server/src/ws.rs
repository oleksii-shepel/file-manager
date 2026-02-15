use axum::http::StatusCode;

pub async fn websocket_handler() -> (StatusCode, &'static str) {
    (
        StatusCode::NOT_IMPLEMENTED,
        "WebSocket endpoint is unavailable in this build",
    )
}
