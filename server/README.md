# File Manager Server

A high-performance Rust-based file management server with full filesystem access.

## Features

- **Complete File Operations**: List, read, write, delete, move, copy files and directories
- **Real-time Communication**: WebSocket support for live updates
- **RESTful API**: HTTP endpoints for command execution
- **Security Ready**: Authentication framework (to be implemented)
- **Cross-platform**: Works on Windows, macOS, and Linux

## Architecture

- **Web Framework**: Axum (high-performance, async)
- **Protocol**: JSON-based command/response protocol
- **Communication**: HTTP REST API + WebSocket
- **Logging**: Structured logging with tracing

## Installation

### Prerequisites

- Rust 1.70+ (install from https://rustup.rs)

### Build

```bash
cd server
cargo build --release
```

### Run

```bash
cargo run
```

The server will start on `http://localhost:3030`

## API Endpoints

### HTTP REST API

**POST /api/command**
- Execute a file system command
- Request body: JSON command object
- Response: JSON response object

**GET /health**
- Health check endpoint
- Returns: "OK"

### WebSocket

**WS /ws**
- Real-time bidirectional communication
- Send commands and receive responses in real-time
- Supports ping/pong for connection monitoring

## Command Protocol

All commands follow this structure:

```json
{
  "type": "COMMAND_TYPE",
  "id": "unique-id",
  "timestamp": 1234567890,
  ...additional fields
}
```

### Available Commands

#### LIST_DIRECTORY
```json
{
  "type": "LIST_DIRECTORY",
  "id": "cmd-1",
  "timestamp": 1234567890,
  "path": "/home/user/documents",
  "show_hidden": false
}
```

#### READ_FILE
```json
{
  "type": "READ_FILE",
  "id": "cmd-2",
  "timestamp": 1234567890,
  "path": "/home/user/file.txt",
  "encoding": "utf8"
}
```

#### WRITE_FILE
```json
{
  "type": "WRITE_FILE",
  "id": "cmd-3",
  "timestamp": 1234567890,
  "path": "/home/user/file.txt",
  "content": "Hello, World!",
  "encoding": "utf8"
}
```

See `src/protocol.rs` for all available commands.

## Response Format

Successful response:
```json
{
  "status": "SUCCESS",
  "command_id": "cmd-1",
  "timestamp": 1234567890,
  "data": { ...result data... }
}
```

Error response:
```json
{
  "status": "ERROR",
  "command_id": "cmd-1",
  "timestamp": 1234567890,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

## Development

### Run in development mode
```bash
cargo run
```

### Run tests
```bash
cargo test
```

### Enable debug logging
```bash
RUST_LOG=debug cargo run
```

## Security Considerations

⚠️ **Important**: This server has full filesystem access. In production:

1. **Authentication**: Implement token-based auth (framework ready in `protocol.rs`)
2. **Authorization**: Add path restrictions and permission checks
3. **TLS**: Use HTTPS in production
4. **Rate Limiting**: Protect against abuse
5. **Audit Logging**: Log all file operations
6. **Sandboxing**: Consider restricting accessible paths

## Installation as System Service

### Windows
```bash
# Install as Windows Service (requires administrator)
sc create FileManagerServer binPath="C:\path\to\file-manager-server.exe"
sc start FileManagerServer
```

### Linux (systemd)
```bash
# Copy service file
sudo cp file-manager-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable file-manager-server
sudo systemctl start file-manager-server
```

### macOS (launchd)
```bash
# Copy plist file
sudo cp com.filemanager.server.plist /Library/LaunchDaemons/
sudo launchctl load /Library/LaunchDaemons/com.filemanager.server.plist
```

## Configuration

Create a `config.toml` file (coming soon):

```toml
[server]
host = "127.0.0.1"
port = 3030

[security]
require_auth = true
allowed_paths = ["/home", "/Users"]
forbidden_paths = ["/etc/passwd", "/System"]

[logging]
level = "info"
file = "/var/log/file-manager-server.log"
```

## License

MIT
