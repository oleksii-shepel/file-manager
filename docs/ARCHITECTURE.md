# Architecture Documentation

## System Overview

The File Manager is a client-server application designed to provide full filesystem access through a secure, well-defined protocol.

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Tauri + Angular)                │
│                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Angular UI   │  │   API Service   │  │ Tauri Native │ │
│  │  (Components)  │──│  (HTTP/WS)      │──│   (Rust)     │ │
│  └────────────────┘  └─────────────────┘  └──────────────┘ │
│                              │                               │
└──────────────────────────────┼───────────────────────────────┘
                               │
                    HTTP/WebSocket (JSON)
                               │
┌──────────────────────────────┼───────────────────────────────┐
│                              ▼                                │
│                    SERVER (Rust - Axum)                       │
│                                                               │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │   HTTP API   │  │  WebSocket API  │  │  Command       │  │
│  │  (REST)      │──│   (Real-time)   │──│  Executor      │  │
│  └──────────────┘  └─────────────────┘  └────────────────┘  │
│                                                 │             │
│                                                 ▼             │
│                                    ┌────────────────────┐    │
│                                    │   File System      │    │
│                                    │  (Full Access)     │    │
│                                    └────────────────────┘    │
└───────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Client Side

**Tauri** (Rust-based desktop framework)
- Native desktop application wrapper
- Small bundle size (~5MB)
- Memory efficient
- Cross-platform (Windows, macOS, Linux)
- Secure by default

**Angular** (TypeScript framework)
- Reactive UI with RxJS
- Component-based architecture
- Strong typing with TypeScript
- Dependency injection
- Modular and scalable

**Communication Layer**
- HTTP (fetch API) for request/response
- WebSocket for real-time updates
- JSON serialization
- Type-safe with shared protocol

### Server Side

**Axum** (Rust web framework)
- High-performance async runtime (Tokio)
- Type-safe routing
- Middleware support
- WebSocket support
- Zero-cost abstractions

**File System Operations**
- Native Rust `std::fs`
- Cross-platform path handling
- Async I/O where beneficial
- Error handling with Result types

## Protocol Design

### Command Pattern

All operations follow a command/response pattern:

```typescript
// Command sent from client to server
{
  "type": "COMMAND_TYPE",
  "id": "unique-id",
  "timestamp": 1234567890,
  ...parameters
}

// Response sent from server to client
{
  "status": "SUCCESS" | "ERROR",
  "command_id": "unique-id",
  "timestamp": 1234567890,
  "data": {...} | "error": {...}
}
```

### Type Safety

The protocol is defined in both TypeScript and Rust:

**TypeScript** (`shared-types/protocol.ts`)
- Enum-based command types
- Interface definitions
- Type unions for responses
- Client-side validation

**Rust** (`server/src/protocol.rs`)
- Enum-based command types
- Serde serialization
- Pattern matching
- Server-side validation

Both definitions are kept in sync manually to ensure type safety across the network boundary.

## Communication Flows

### HTTP REST API Flow

```
┌────────┐                ┌────────┐
│ Client │                │ Server │
└───┬────┘                └───┬────┘
    │                         │
    │  POST /api/command      │
    │  {command}              │
    │────────────────────────>│
    │                         │
    │                    [Execute]
    │                         │
    │      Response {result}  │
    │<────────────────────────│
    │                         │
```

**Use Cases:**
- Single command execution
- File listing
- File operations (read, write, delete)
- Synchronous operations

### WebSocket Flow

```
┌────────┐                ┌────────┐
│ Client │                │ Server │
└───┬────┘                └───┬────┘
    │                         │
    │  WS Connect             │
    │<───────────────────────>│
    │                         │
    │  {type: COMMAND}        │
    │────────────────────────>│
    │                         │
    │                    [Execute]
    │                         │
    │  {type: RESPONSE}       │
    │<────────────────────────│
    │                         │
    │  {type: COMMAND}        │
    │────────────────────────>│
    │                         │
```

**Use Cases:**
- Real-time file monitoring
- Progress updates for long operations
- Multiple rapid commands
- Bidirectional communication

## Security Model

### Current Implementation

The current implementation prioritizes development speed and local-only usage:

- **Network Binding:** Localhost only (127.0.0.1)
- **Authentication:** None (trust localhost)
- **Authorization:** Full filesystem access
- **Encryption:** None (local traffic)

### Production Security Roadmap

For production deployment, implement these layers:

#### 1. Authentication Layer
```rust
// Token-based authentication
pub struct AuthMiddleware;

impl AuthMiddleware {
    fn verify_token(token: &str) -> Result<UserId> {
        // Verify JWT or session token
    }
}
```

#### 2. Authorization Layer
```rust
// Path-based access control
pub struct PathAuthorizer {
    allowed_paths: Vec<PathBuf>,
    forbidden_paths: Vec<PathBuf>,
}

impl PathAuthorizer {
    fn can_access(&self, user: &User, path: &Path) -> bool {
        // Check if user can access path
    }
}
```

#### 3. Audit Logging
```rust
pub struct AuditLogger;

impl AuditLogger {
    fn log_operation(&self, user: &User, operation: &Command) {
        // Log all file operations with timestamp
    }
}
```

#### 4. Rate Limiting
```rust
pub struct RateLimiter;

impl RateLimiter {
    fn check_limit(&self, user: &User) -> Result<()> {
        // Prevent abuse
    }
}
```

## File System Access

### Privilege Model

The server requires elevated privileges for full filesystem access:

**Development:**
- Run as regular user
- Access user-owned files
- Prompt for admin when needed

**Production (System Service):**
- Install as system service
- Run with elevated privileges
- Configure allowed paths

### Cross-Platform Considerations

**Windows:**
- Drive letters (C:\, D:\, etc.)
- Backslash path separators
- Case-insensitive filesystem
- Windows Service installation

**macOS:**
- Single root (/)
- Forward slash separators
- Case-insensitive (HFS+) or case-sensitive (APFS)
- launchd for services

**Linux:**
- Single root (/)
- Forward slash separators
- Case-sensitive filesystem
- systemd for services

The server handles these differences using Rust's `std::path` abstractions.

## Performance Characteristics

### Server Performance

**Async I/O:**
- Tokio runtime for concurrent operations
- Non-blocking file operations where beneficial
- Connection pooling for multiple clients

**Memory Usage:**
- Streaming for large files
- Chunked directory listings
- Lazy loading of file metadata

**Scalability:**
- Single server instance: 100+ concurrent clients
- Stateless design allows horizontal scaling
- WebSocket connections: ~10MB per 1000 connections

### Client Performance

**UI Responsiveness:**
- Async operations don't block UI
- Loading indicators for long operations
- Debounced user input
- Virtual scrolling for large directories

**Memory Usage:**
- Tauri overhead: ~50MB base
- Angular app: ~20-30MB
- WebSocket: ~1MB per connection

## Error Handling

### Error Flow

```
Operation Failed
     │
     ├─> Rust Error (anyhow::Error)
     │   └─> Convert to ErrorInfo
     │       └─> Serialize to JSON
     │
     ├─> Network Transport
     │
     └─> TypeScript Error
         └─> Display to User
```

### Error Categories

1. **File System Errors**
   - File not found
   - Permission denied
   - Disk full
   - Path too long

2. **Protocol Errors**
   - Invalid command
   - Malformed JSON
   - Type mismatch

3. **Network Errors**
   - Connection refused
   - Timeout
   - Disconnected

4. **Application Errors**
   - Invalid state
   - Concurrent modification
   - Resource busy

## Future Enhancements

### Short Term
- [ ] File preview (images, text)
- [ ] Search functionality
- [ ] Keyboard shortcuts
- [ ] Drag and drop
- [ ] Context menus

### Medium Term
- [ ] Archive support (zip, tar)
- [ ] Cloud storage integration
- [ ] File sharing
- [ ] Built-in editor
- [ ] Tabbed interface

### Long Term
- [ ] Plugin system
- [ ] Scripting support
- [ ] Remote server access
- [ ] Multi-user support
- [ ] Advanced ACLs

## Development Guidelines

### Adding New Commands

1. **Define in TypeScript:**
```typescript
// shared-types/protocol.ts
export interface NewCommand extends BaseCommand {
  type: CommandType.NEW_OPERATION;
  param1: string;
  param2: number;
}
```

2. **Define in Rust:**
```rust
// server/src/protocol.rs
#[serde(rename = "NEW_OPERATION")]
NewOperation {
    id: String,
    timestamp: i64,
    param1: String,
    param2: i64,
}
```

3. **Implement Executor:**
```rust
// server/src/commands.rs
fn execute_new_operation(param1: &str, param2: i64) -> Result<ResponseData> {
    // Implementation
}
```

4. **Add Client Method:**
```typescript
// client/angular-app/src/app/services/api.service.ts
async newOperation(param1: string, param2: number): Promise<Result> {
    const command: NewCommand = {
        type: CommandType.NEW_OPERATION,
        id: this.generateCommandId(),
        timestamp: Date.now(),
        param1,
        param2,
    };
    return await this.sendHttpCommand(command);
}
```

### Testing Strategy

**Unit Tests:**
- Rust: `cargo test`
- TypeScript: `npm test`

**Integration Tests:**
- End-to-end command flow
- Error handling scenarios
- Network failure simulation

**Performance Tests:**
- Large directory listings
- Large file operations
- Concurrent clients

## Deployment

### Development
```bash
# Terminal 1: Server
cd server && cargo run

# Terminal 2: Client
cd client/angular-app && npm start

# Terminal 3: Tauri
cd client && tauri dev
```

### Production
```bash
# Build server
cd server && cargo build --release

# Install as service
# See installation guides in README.md

# Build client
cd client && npm run tauri build

# Distribute installers from:
# client/src-tauri/target/release/bundle/
```

---

**Last Updated:** February 2026
**Version:** 0.1.0
