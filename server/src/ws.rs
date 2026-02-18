use axum::{
    extract::ws::{WebSocket, WebSocketUpgrade},
    response::IntoResponse,
};
use futures_util::{StreamExt};
use tracing::info;

pub async fn websocket_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_socket)
}

async fn handle_socket(mut socket: WebSocket) {
    info!("WebSocket connection established");

    while let Some(Ok(msg)) = socket.next().await {
        match msg {
            axum::extract::ws::Message::Text(text) => {
                info!("Received text message: {}", text);
                // Echo back
                if socket
                    .send(axum::extract::ws::Message::Text(text))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            axum::extract::ws::Message::Binary(data) => {
                info!("Received binary message of {} bytes", data.len());
                // Echo back
                if socket
                    .send(axum::extract::ws::Message::Binary(data))
                    .await
                    .is_err()
                {
                    break;
                }
            }
            axum::extract::ws::Message::Ping(_) => {
                // Auto-respond with Pong
            }
            axum::extract::ws::Message::Pong(_) => {
                // Ignore
            }
            axum::extract::ws::Message::Close(_) => {
                info!("Client closed connection");
                break;
            }
        }
    }

    info!("WebSocket connection closed");
}