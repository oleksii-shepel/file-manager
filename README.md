# File Manager - Client-Server Application

A modern, dual-pane file manager built with **Rust** (server) and **Tauri + Angular** (client) with full filesystem access.

![Architecture](docs/architecture.png)

## 🏗️ Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   Tauri + Angular   │ ◄─────► │    Rust Server      │
│      (Client)       │  HTTP/  │  (Full FS Access)   │
│                     │   WS    │                     │
└─────────────────────┘         └─────────────────────┘
```

**Client (Tauri + Angular)**
- Beautiful dual-pane interface
- TypeScript for type safety
- Angular for reactive UI
- Tauri for native desktop packaging

**Server (Rust)**
- High-performance file operations
- Full filesystem access
- RESTful API + WebSocket
- Can run as system service

**Shared Protocol**
- JSON-based command/response protocol
- Type-safe communication
- Defined in TypeScript + Rust

## ✨ Features

### Current Features
- ✅ Dual-pane file browser (Sigma-like interface)
- ✅ Basic file operations (list, read, write, delete)
- ✅ Directory operations (create, navigate)
- ✅ File/folder copy and move between panes
- ✅ Multi-file selection
- ✅ Show/hide hidden files
- ✅ Real-time communication via WebSocket
- ✅ Cross-platform support (Windows, macOS, Linux)

### Planned Features
- 🔄 File search with fuzzy matching
- 🔄 Archive support (zip, tar, gz)
- 🔄 File preview (images, text, PDF)
- 🔄 Cloud storage integration
- 🔄 Built-in text editor
- 🔄 Drag & drop support
- 🔄 Keyboard shortcuts
- 🔄 File sharing to network devices
- 🔄 Workspace management

## 📁 Project Structure

```
file-manager-project/
├── server/                    # Rust backend server
│   ├── src/
│   │   ├── main.rs           # Server entry point
│   │   ├── protocol.rs       # Protocol definitions
│   │   ├── commands.rs       # Command executor
│   │   ├── handlers.rs       # HTTP handlers
│   │   └── ws.rs             # WebSocket handler
│   ├── Cargo.toml
│   └── README.md
│
├── client/                    # Tauri + Angular client
│   ├── src-tauri/            # Tauri backend
│   │   ├── src/
│   │   │   └── main.rs
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json
│   └── angular-app/          # Angular frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── components/
│       │   │   │   └── file-browser.component.*
│       │   │   └── services/
│       │   │       └── api.service.ts
│       │   ├── main.ts
│       │   └── index.html
│       ├── package.json
│       └── angular.json
│
├── shared-types/              # Shared TypeScript protocol
│   └── protocol.ts
│
└── docs/                      # Documentation
    └── architecture.md
```

## 🚀 Getting Started

### Prerequisites

- **Rust** 1.70+ ([Install](https://rustup.rs))
- **Node.js** 18+ ([Install](https://nodejs.org))
- **npm** or **yarn**

### Installation

#### 1. Clone the repository
```bash
git clone <your-repo>
cd file-manager-project
```

#### 2. Install server dependencies
```bash
cd server
cargo build
```

#### 3. Install client dependencies
```bash
cd ../client/angular-app
npm install
```

#### 4. Install Tauri CLI
```bash
npm install -g @tauri-apps/cli
```

### Running the Application

#### Option A: Development Mode (Recommended)

**Terminal 1 - Start the server:**
```bash
cd server
cargo run
```
Server will run on `http://localhost:3030`

**Terminal 2 - Start the client:**
```bash
cd client/angular-app
npm run start
```
Angular dev server will run on `http://localhost:4200`

**Terminal 3 - Start Tauri:**
```bash
cd client
npm run tauri dev
```

#### Option B: Production Build

**Build the server:**
```bash
cd server
cargo build --release
./target/release/file-manager-server
```

**Build and run the client:**
```bash
cd client
npm run tauri build
```

The built application will be in `client/src-tauri/target/release/`

## 🔌 API Documentation

### HTTP REST API

**Base URL:** `http://localhost:3030`

#### Endpoints

**POST /api/command**
Execute a file system command
```json
{
  "type": "LIST_DIRECTORY",
  "id": "cmd-123",
  "timestamp": 1234567890,
  "path": "/home/user",
  "showHidden": false
}
```

**GET /health**
Health check
```
Response: "OK"
```

### WebSocket API

**URL:** `ws://localhost:3030/ws`

Real-time bidirectional communication for commands and responses.

### Available Commands

| Command | Description |
|---------|-------------|
| `LIST_DIRECTORY` | List files and folders in a directory |
| `READ_FILE` | Read file contents (text or binary) |
| `WRITE_FILE` | Write content to a file |
| `DELETE_FILE` | Delete a file or directory |
| `CREATE_DIRECTORY` | Create a new directory |
| `MOVE_FILE` | Move a file or directory |
| `COPY_FILE` | Copy a file or directory |
| `GET_FILE_INFO` | Get detailed file information |
| `SEARCH_FILES` | Search for files by pattern |

See `shared-types/protocol.ts` for detailed type definitions.

## 🔒 Security Considerations

⚠️ **IMPORTANT**: This server has unrestricted filesystem access. For production use:

### Current Security Status
- ❌ No authentication (localhost only)
- ❌ No path restrictions
- ❌ No rate limiting
- ❌ HTTP only (no TLS)

### Recommended Security Measures

1. **Enable Authentication**
   - Implement token-based auth
   - Use the auth framework in `protocol.rs`

2. **Restrict Access**
   ```rust
   // Add to server config
   allowed_paths: ["/home", "/Users"]
   forbidden_paths: ["/etc", "/System"]
   ```

3. **Add TLS/HTTPS**
   ```bash
   # Use reverse proxy (nginx, caddy)
   # Or configure Axum with rustls
   ```

4. **Enable Audit Logging**
   - Log all file operations
   - Monitor suspicious activity

5. **Run as System Service**
   - See installation guides below
   - Configure proper permissions

## 📦 Installation as System Service

### Windows Service

```powershell
# Install as Windows Service (run as Administrator)
sc create FileManagerServer binPath="C:\path\to\file-manager-server.exe"
sc start FileManagerServer

# Configure to start automatically
sc config FileManagerServer start=auto
```

### Linux (systemd)

Create `/etc/systemd/system/file-manager-server.service`:
```ini
[Unit]
Description=File Manager Server
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/file-manager-server
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable file-manager-server
sudo systemctl start file-manager-server
```

### macOS (launchd)

Create `/Library/LaunchDaemons/com.filemanager.server.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.filemanager.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/file-manager-server</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

```bash
sudo launchctl load /Library/LaunchDaemons/com.filemanager.server.plist
```

## 🛠️ Development

### Running Tests

**Server tests:**
```bash
cd server
cargo test
```

**Client tests:**
```bash
cd client/angular-app
npm test
```

### Building for Production

**Server:**
```bash
cd server
cargo build --release
# Binary: target/release/file-manager-server
```

**Client:**
```bash
cd client
npm run tauri build
# Installers in: src-tauri/target/release/bundle/
```

### Code Style

**Rust:**
```bash
cargo fmt
cargo clippy
```

**TypeScript/Angular:**
```bash
npm run lint
```

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Inspired by [Sigma File Manager](https://github.com/aleksey-hoffman/sigma-file-manager)
- Built with [Tauri](https://tauri.app)
- Powered by [Axum](https://github.com/tokio-rs/axum)
- UI framework: [Angular](https://angular.io)

## 📞 Support

- 📧 Email: your-email@example.com
- 🐛 Issues: [GitHub Issues](https://github.com/your-repo/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/your-repo/discussions)

---

**Built with ❤️ using Rust, TypeScript, and Angular**
