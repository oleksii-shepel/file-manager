# Quick Start Guide

Get up and running with the File Manager in 5 minutes!

## ⚡ Quick Setup

### 1. Install Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Node.js (if not installed)
# Download from: https://nodejs.org
```

### 2. Clone and Setup

```bash
# Navigate to the project
cd file-manager-project

# Install server dependencies (downloads Rust crates)
cd server
cargo build

# Install client dependencies
cd ../client/angular-app
npm install

# Go back to root
cd ../..
```

### 3. Run the Application

**Open 3 terminals:**

**Terminal 1 - Server:**
```bash
cd server
cargo run
```
✅ Server running at http://localhost:3030

**Terminal 2 - Angular Dev Server:**
```bash
cd client/angular-app
npm start
```
✅ Angular dev server at http://localhost:4200

**Terminal 3 - Tauri App:**
```bash
cd client
npm install -g @tauri-apps/cli  # First time only
cd ..
cd client/angular-app
npm install
cd ..
# Note: Make sure both server and Angular are running first!
tauri dev
```
✅ Desktop app will open!

## 🎯 Usage

### Basic Operations

1. **Navigate Directories**
   - Double-click folders to open them
   - Click "⬆️ Up" to go to parent directory

2. **Select Files**
   - Single click to select
   - Multiple selections allowed

3. **Copy/Move Files**
   - Select files in left pane
   - Click "➡️ Copy →" or "➡️ Move →"
   - Files appear in right pane directory

4. **Delete Files**
   - Select files
   - Click "🗑️ Delete"
   - Confirm deletion

5. **Create Folders**
   - Click "➕ New Folder"
   - Enter folder name
   - Press OK

6. **Show Hidden Files**
   - Toggle "Show Hidden Files" button
   - Hidden files (starting with .) will appear/disappear

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port 3030 is available
lsof -i :3030  # macOS/Linux
netstat -ano | findstr :3030  # Windows

# Kill the process if needed
kill -9 <PID>  # macOS/Linux
taskkill /F /PID <PID>  # Windows
```

### Client can't connect
- Make sure server is running first
- Check server is on http://localhost:3030
- Open browser and visit http://localhost:3030/health
- Should return "OK"

### Tauri build errors
```bash
# Install system dependencies

# Ubuntu/Debian
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev

# Fedora
sudo dnf install webkit2gtk3-devel \
    openssl-devel \
    curl \
    wget \
    libappindicator-gtk3 \
    librsvg2-devel

# Arch Linux
sudo pacman -S webkit2gtk \
    base-devel \
    curl \
    wget \
    openssl \
    appmenu-gtk-module \
    gtk3 \
    libappindicator-gtk3 \
    librsvg

# macOS - Install Xcode Command Line Tools
xcode-select --install
```

### TypeScript errors
```bash
cd client/angular-app
# Delete and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📚 Next Steps

1. **Read the full README** - `README.md` in project root
2. **Explore the protocol** - `shared-types/protocol.ts`
3. **Check server API** - `server/README.md`
4. **Customize the UI** - Edit Angular components in `client/angular-app/src/app/components/`

## 🚀 Production Build

```bash
# Build server
cd server
cargo build --release
# Binary: target/release/file-manager-server

# Build client
cd ../client
npm run tauri build
# Installers: src-tauri/target/release/bundle/
```

## 💡 Tips

- Use **Ctrl+C** in terminals to stop servers
- Server auto-reloads on code changes
- Angular dev server auto-reloads on changes
- Tauri needs restart on Rust changes
- Check browser console (F12) for client errors
- Check terminal for server errors

## ⚙️ Configuration

### Change Server Port

Edit `server/src/main.rs`:
```rust
let addr = SocketAddr::from(([127, 0, 0, 1], 3030)); // Change 3030
```

Then update client config in `client/angular-app/src/app/services/api.service.ts`:
```typescript
private serverUrl = 'http://localhost:3030'; // Match server port
```

### Change Client Port

Edit `client/angular-app/angular.json`:
```json
"serve": {
  "options": {
    "port": 4200  // Change this
  }
}
```

---

**Happy file managing! 📁✨**
