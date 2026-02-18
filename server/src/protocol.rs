use serde::{Deserialize, Serialize};

// ============================================================================
// Commands (Client -> Server)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Command {
    #[serde(rename = "LIST_DIRECTORY")]
    ListDirectory {
        id: String,
        timestamp: i64,
        path: String,
        #[serde(default)]
        show_hidden: bool,
    },
    #[serde(rename = "LIST_DRIVES")]
    ListDrives {
        id: String,
        timestamp: i64,
    },
    
    #[serde(rename = "READ_FILE")]
    ReadFile {
        id: String,
        timestamp: i64,
        path: String,
        #[serde(default)]
        encoding: Option<String>,
    },
    
    #[serde(rename = "WRITE_FILE")]
    WriteFile {
        id: String,
        timestamp: i64,
        path: String,
        content: String,
        #[serde(default)]
        encoding: Option<String>,
    },
    
    #[serde(rename = "DELETE_FILE")]
    DeleteFile {
        id: String,
        timestamp: i64,
        path: String,
        #[serde(default)]
        recursive: bool,
    },
    
    #[serde(rename = "CREATE_DIRECTORY")]
    CreateDirectory {
        id: String,
        timestamp: i64,
        path: String,
        #[serde(default)]
        recursive: bool,
    },
    
    #[serde(rename = "MOVE_FILE")]
    MoveFile {
        id: String,
        timestamp: i64,
        source: String,
        destination: String,
    },
    
    #[serde(rename = "COPY_FILE")]
    CopyFile {
        id: String,
        timestamp: i64,
        source: String,
        destination: String,
        #[serde(default)]
        recursive: bool,
    },
    
    #[serde(rename = "GET_FILE_INFO")]
    GetFileInfo {
        id: String,
        timestamp: i64,
        path: String,
    },
    
    #[serde(rename = "SEARCH_FILES")]
    SearchFiles {
        id: String,
        timestamp: i64,
        path: String,
        pattern: String,
        #[serde(default)]
        recursive: bool,
    },
}

impl Command {
    pub fn id(&self) -> &str {
        match self {
            Command::ListDirectory { id, .. } => id,
            Command::ReadFile { id, .. } => id,
            Command::WriteFile { id, .. } => id,
            Command::DeleteFile { id, .. } => id,
            Command::CreateDirectory { id, .. } => id,
            Command::MoveFile { id, .. } => id,
            Command::CopyFile { id, .. } => id,
            Command::GetFileInfo { id, .. } => id,
            Command::SearchFiles { id, .. } => id,
            Command::ListDrives { id, .. } => id,
            Command::ListDirectory { id, .. } => id,
            Command::ReadFile { id, .. } => id,
            Command::WriteFile { id, .. } => id,
            Command::DeleteFile { id, .. } => id,
            Command::CreateDirectory { id, .. } => id,
            Command::MoveFile { id, .. } => id,
            Command::CopyFile { id, .. } => id,
            Command::GetFileInfo { id, .. } => id,
            Command::SearchFiles { id, .. } => id,
    }
}

// ============================================================================
// Responses (Server -> Client)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum Response {
    #[serde(rename = "SUCCESS")]
    Success {
        command_id: String,
        timestamp: i64,
        data: ResponseData,
    },
    
    #[serde(rename = "ERROR")]
    Error {
        command_id: String,
        timestamp: i64,
        error: ErrorInfo,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorInfo {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ResponseData {
    DirectoryListing(DirectoryListing),
    FileContent(FileContent),
    FileInfo(FileInfo),
    OperationResult(OperationResult),
    SearchResult(SearchResult),
    DrivesList(DrivesList),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveInfo {
    pub name: String, // e.g. 'C:'
    pub path: String, // e.g. 'C:\\'
    pub drive_type: String, // e.g. 'fixed', 'removable', etc.
    pub total_space: u64,
    pub free_space: u64,
    pub file_system: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrivesList {
    pub drives: Vec<DriveInfo>,
}

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FileType {
    File,
    Directory,
    Symlink,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub file_type: FileType,
    pub size: u64,
    pub created: i64,
    pub modified: i64,
    pub accessed: i64,
    pub permissions: String,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub path: String,
    pub entries: Vec<FileInfo>,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub matches: Vec<FileInfo>,
    pub total_matches: usize,
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub enum WebSocketMessage {
    #[serde(rename = "COMMAND")]
    Command { payload: Command },
    
    #[serde(rename = "RESPONSE")]
    Response { payload: Response },
    
    #[serde(rename = "PING")]
    Ping,
    
    #[serde(rename = "PONG")]
    Pong,
    
    #[serde(rename = "AUTH")]
    Auth { payload: AuthPayload },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AuthPayload {
    pub token: String,
}
