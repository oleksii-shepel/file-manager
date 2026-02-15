# File Manager Client

Tauri + Angular desktop application for the File Manager.

## Structure

```
client/
├── src-tauri/              # Tauri (Rust) backend
│   ├── src/
│   │   └── main.rs        # Tauri app entry
│   ├── Cargo.toml         # Rust dependencies
│   ├── tauri.conf.json    # Tauri configuration
│   └── build.rs           # Build script
│
└── angular-app/            # Angular frontend
    ├── src/
    │   ├── app/
    │   │   ├── components/
    │   │   │   └── file-browser.component.*
    │   │   └── services/
    │   │       └── api.service.ts
    │   ├── main.ts
    │   ├── index.html
    │   └── styles.scss
    ├── package.json
    ├── angular.json
    └── tsconfig.json
```

## Development

### Prerequisites

- Node.js 18+
- Rust (for Tauri)
- System dependencies (see below)

### Install Dependencies

```bash
cd angular-app
npm install
```

### Run Development Server

**Option 1: Angular only (web browser)**
```bash
cd angular-app
npm start
```
Open http://localhost:4200

**Option 2: Tauri (desktop app)**

First, make sure the server is running on localhost:3030

```bash
# From client directory
npm run tauri dev
```

## Building

### Development Build
```bash
npm run tauri dev
```

### Production Build
```bash
npm run tauri build
```

Outputs:
- **macOS**: `.app`, `.dmg` in `src-tauri/target/release/bundle/macos/`
- **Windows**: `.exe`, `.msi` in `src-tauri/target/release/bundle/`
- **Linux**: `.deb`, `.AppImage` in `src-tauri/target/release/bundle/`

## Configuration

### Tauri Configuration

Edit `src-tauri/tauri.conf.json`:

```json
{
  "build": {
    "devPath": "http://localhost:4200",
    "distDir": "../angular-app/dist/file-manager-client"
  },
  "package": {
    "productName": "File Manager",
    "version": "0.1.0"
  },
  "tauri": {
    "windows": [
      {
        "title": "File Manager",
        "width": 1200,
        "height": 800
      }
    ]
  }
}
```

### Angular Configuration

Edit `angular-app/angular.json` for build settings.

### API Endpoint

Change server URL in `angular-app/src/app/services/api.service.ts`:

```typescript
private serverUrl = 'http://localhost:3030';
private wsUrl = 'ws://localhost:3030/ws';
```

## System Dependencies

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

### Fedora
```bash
sudo dnf install webkit2gtk3-devel \
    openssl-devel \
    curl \
    wget \
    libappindicator-gtk3 \
    librsvg2-devel
```

### Arch Linux
```bash
sudo pacman -S webkit2gtk \
    base-devel \
    curl \
    wget \
    openssl \
    appmenu-gtk-module \
    gtk3 \
    libappindicator-gtk3 \
    librsvg
```

### macOS
```bash
xcode-select --install
```

### Windows
No additional dependencies needed (WebView2 comes with Windows 10+)

## Features

### Current Features
- ✅ Dual-pane file browser
- ✅ File/folder operations (copy, move, delete)
- ✅ Directory navigation
- ✅ Multi-file selection
- ✅ Show/hide hidden files

### Planned Features
- 🔄 File search
- 🔄 Drag and drop
- 🔄 Context menus
- 🔄 Keyboard shortcuts
- 🔄 File preview
- 🔄 Built-in editor

## Troubleshooting

### Tauri won't start
```bash
# Check Rust installation
rustc --version

# Reinstall Tauri CLI
npm install -g @tauri-apps/cli
```

### Build fails on Linux
```bash
# Install missing dependencies
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Can't connect to server
- Ensure server is running on localhost:3030
- Check server health: http://localhost:3030/health
- Verify CORS settings allow localhost

## Scripts

```json
{
  "start": "ng serve",
  "build": "ng build",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "tauri:build": "tauri build"
}
```

## License

MIT
