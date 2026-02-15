# File Manager Project - Complete Starter Kit

## 📦 What You Got

A fully scaffolded **client-server file manager** application with:

### ✅ Server (Rust)
- **Framework**: Axum (high-performance web framework)
- **Features**:
  - Full filesystem access
  - RESTful HTTP API
  - WebSocket support for real-time communication
  - Complete command executor for all file operations
  - Cross-platform support (Windows, macOS, Linux)

### ✅ Client (Tauri + Angular)
- **Framework**: Tauri (native desktop app) + Angular (UI)
- **Features**:
  - Dual-pane file browser (Sigma-style)
  - TypeScript API service for server communication
  - Modern, dark-themed UI
  - Multi-file selection
  - Copy/move between panes
  - Show/hide hidden files

### ✅ Shared Protocol
- **Type-safe** protocol definitions in both TypeScript and Rust
- 9 file operations: list, read, write, delete, create, move, copy, info, search
- JSON-based communication

## 📂 Project Structure

```
file-manager-project/
├── server/                 # Rust backend
│   ├── src/
│   │   ├── main.rs        # Entry point
│   │   ├── protocol.rs    # Protocol definitions
│   │   ├── commands.rs    # File operations
│   │   ├── handlers.rs    # HTTP handlers
│   │   └── ws.rs          # WebSocket handler
│   ├── Cargo.toml
│   └── README.md
│
├── client/                 # Tauri + Angular app
│   ├── src-tauri/         # Tauri (Rust wrapper)
│   │   ├── src/main.rs
│   │   ├── Cargo.toml
│   │   └── tauri.conf.json
│   └── angular-app/       # Angular UI
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
├── shared-types/          # Shared TypeScript protocol
│   └── protocol.ts
│
├── docs/                  # Documentation
│   ├── QUICKSTART.md
│   └── ARCHITECTURE.md
│
├── README.md              # Main documentation
└── .gitignore
```

## 🚀 Quick Start

### Prerequisites
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js 18+
# Download from: https://nodejs.org
```

### Run It

**Terminal 1 - Server:**
```bash
cd server
cargo run
# Server runs on http://localhost:3030
```

**Terminal 2 - Angular Dev Server:**
```bash
cd client/angular-app
npm install
npm start
# Dev server runs on http://localhost:4200
```

**Terminal 3 - Tauri App:**
```bash
cd client/angular-app
npm install -g @tauri-apps/cli  # First time only
cd ..
tauri dev
# Desktop app opens!
```

## 🎯 What It Does

### File Operations
- ✅ Browse directories (dual-pane)
- ✅ Create folders
- ✅ Delete files/folders
- ✅ Copy files between panes
- ✅ Move files between panes
- ✅ Show/hide hidden files
- ✅ Navigate up/down directory tree

### Communication
- ✅ HTTP REST API for commands
- ✅ WebSocket for real-time updates
- ✅ Type-safe protocol (TypeScript ↔ Rust)
- ✅ Error handling with user feedback

## 📋 Available Commands

The protocol supports these file operations:

1. **LIST_DIRECTORY** - List files and folders
2. **READ_FILE** - Read file contents (text or binary)
3. **WRITE_FILE** - Write content to a file
4. **DELETE_FILE** - Delete file or directory
5. **CREATE_DIRECTORY** - Create new folder
6. **MOVE_FILE** - Move/rename file or folder
7. **COPY_FILE** - Copy file or folder
8. **GET_FILE_INFO** - Get detailed file metadata
9. **SEARCH_FILES** - Search for files by pattern

All commands have matching TypeScript and Rust implementations.

## 🔒 Security Note

**⚠️ IMPORTANT**: The server has **unrestricted filesystem access** by design.

**Current State (Development):**
- Runs on localhost only (127.0.0.1)
- No authentication
- No path restrictions
- Suitable for local development

**For Production**, you'll need to add:
- Token-based authentication
- Path access restrictions
- Rate limiting
- Audit logging
- TLS/HTTPS

See `docs/ARCHITECTURE.md` for detailed security implementation guides.

## 📚 Documentation Included

1. **README.md** - Main project overview
2. **docs/QUICKSTART.md** - 5-minute setup guide
3. **docs/ARCHITECTURE.md** - Deep technical documentation
4. **server/README.md** - Server API documentation
5. **client/README.md** - Client setup and configuration

## 🛠️ Next Steps

### Immediate
1. Follow the Quick Start above to run the app
2. Test file operations in both panes
3. Check browser console (F12) for debugging

### Short Term
- [ ] Add file search functionality
- [ ] Implement drag & drop
- [ ] Add context menus
- [ ] Keyboard shortcuts
- [ ] File preview panel

### Medium Term
- [ ] Archive support (zip, tar, gz)
- [ ] Cloud storage integration (Drive, Dropbox)
- [ ] Built-in text/code editor
- [ ] File sharing over network
- [ ] Tabbed interface

### Long Term
- [ ] Authentication system
- [ ] Multi-user support
- [ ] Plugin architecture
- [ ] Remote server access
- [ ] Advanced permissions/ACLs

## 🔧 Customization

### Change Server Port
**server/src/main.rs:**
```rust
let addr = SocketAddr::from(([127, 0, 0, 1], 3030)); // Change 3030
```

**client/angular-app/src/app/services/api.service.ts:**
```typescript
private serverUrl = 'http://localhost:3030'; // Match server port
```

### Customize UI
Edit files in:
- `client/angular-app/src/app/components/file-browser.component.scss`
- Color scheme, fonts, layout

### Add New Commands
1. Define in `shared-types/protocol.ts`
2. Add to `server/src/protocol.rs`
3. Implement in `server/src/commands.rs`
4. Add method in `client/angular-app/src/app/services/api.service.ts`

## 📦 Building for Production

### Server
```bash
cd server
cargo build --release
# Binary: target/release/file-manager-server
```

### Client
```bash
cd client
npm run tauri build
# Installers in: src-tauri/target/release/bundle/
```

**Output formats:**
- **Windows**: .exe, .msi
- **macOS**: .app, .dmg
- **Linux**: .deb, .AppImage

## 💡 Tips

- Server must be running before starting client
- Check http://localhost:3030/health for server status
- Use browser DevTools (F12) for debugging client
- Server logs appear in terminal
- Tauri needs rebuild on Rust changes (hot-reload for UI only)

## 🐛 Common Issues

**"Cannot connect to server"**
- Make sure server is running on port 3030
- Check firewall settings
- Visit http://localhost:3030/health

**"Tauri build fails"**
- Install system dependencies (see client/README.md)
- Run: `rustc --version` to verify Rust installation

**"Permission denied" errors**
- Server needs appropriate file access permissions
- On Linux/Mac, check file ownership
- See docs/ARCHITECTURE.md for privilege model

## 🤝 Contributing

This is a starter project - make it your own!

Suggested workflow:
1. Start with existing features
2. Add one command at a time
3. Test thoroughly
4. Update documentation

## 📄 License

MIT License - Use it however you want!

## 🎓 Learning Resources

**Rust:**
- https://doc.rust-lang.org/book/
- https://tokio.rs/
- https://github.com/tokio-rs/axum

**Angular:**
- https://angular.io/docs
- https://rxjs.dev/

**Tauri:**
- https://tauri.app/v1/guides/
- https://tauri.app/v1/api/

**File System APIs:**
- https://doc.rust-lang.org/std/fs/

---

**Created:** February 2026
**Stack:** Rust + Axum + Tauri + Angular + TypeScript
**Status:** ✅ Ready to run!

Enjoy building your file manager! 🚀
