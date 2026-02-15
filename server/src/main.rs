use axum::{
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tracing_subscriber;

mod commands;
mod handlers;
mod protocol;
mod ws;

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    tracing::info!("Starting File Manager Server...");

    // Build application router
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/health", get(health_handler))
        .route("/ws", get(ws::websocket_handler))
        .route("/api/command", post(handlers::handle_command))
        .layer(CorsLayer::permissive()); // Configure CORS as needed

    // Bind to localhost:3030
    let addr = SocketAddr::from(([127, 0, 0, 1], 3030));
    tracing::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn root_handler() -> &'static str {
    "File Manager Server v0.1.0"
}

async fn health_handler() -> &'static str {
    "OK"
}
