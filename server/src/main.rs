mod archive;
mod commands;
mod handlers;
mod protocol;
mod ws;

use std::net::SocketAddr;
use anyhow::Result;
use axum::{
    extract::State,
    routing::{get, post},
    Router,
};
use tower_http::cors::CorsLayer;
use tracing::info;

#[derive(Clone)]
struct AppState {}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let state = AppState {};

    let app = Router::new()
        .route("/ws", get(ws::websocket_handler))
        .route("/api/command", post(handlers::handle_command))
        .route("/health", get(health))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], 3030));
    info!("Server listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> &'static str {
    "OK"
}