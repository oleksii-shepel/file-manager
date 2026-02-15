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
        #[serde(default, alias = "showHidden")]
        show_hidden: bool,
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
        #[serde(default, alias = "maxResults")]
        max_results: Option<usize>,
    },

    #[serde(rename = "SUGGEST_PATHS")]
    SuggestPaths {
        id: String,
        timestamp: i64,
        input: String,
        #[serde(alias = "currentPath")]
        current_path: String,
        #[serde(default)]
        limit: Option<usize>,
    },

    #[serde(rename = "PROTECT_PATH")]
    ProtectPath {
        id: String,
        timestamp: i64,
        path: String,
    },

    #[serde(rename = "UNPROTECT_PATH")]
    UnprotectPath {
        id: String,
        timestamp: i64,
        path: String,
    },

    #[serde(rename = "LIST_PROTECTED")]
    ListProtected {
        id: String,
        timestamp: i64,
    },

    #[serde(rename = "START_SHARE")]
    StartShare {
        id: String,
        timestamp: i64,
        path: String,
        #[serde(default, alias = "expiresMinutes")]
        expires_minutes: Option<i64>,
    },

    #[serde(rename = "STOP_SHARE")]
    StopShare {
        id: String,
        timestamp: i64,
        #[serde(alias = "shareId")]
        share_id: String,
    },

    #[serde(rename = "LIST_SHARES")]
    ListShares {
        id: String,
        timestamp: i64,
    },

    #[serde(rename = "CREATE_ARCHIVE")]
    CreateArchive {
        id: String,
        timestamp: i64,
        sources: Vec<String>,
        #[serde(alias = "archivePath")]
        archive_path: String,
    },

    #[serde(rename = "EXTRACT_ARCHIVE")]
    ExtractArchive {
        id: String,
        timestamp: i64,
        #[serde(alias = "archivePath")]
        archive_path: String,
        #[serde(alias = "destinationPath")]
        destination_path: String,
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
            Command::SuggestPaths { id, .. } => id,
            Command::ProtectPath { id, .. } => id,
            Command::UnprotectPath { id, .. } => id,
            Command::ListProtected { id, .. } => id,
            Command::StartShare { id, .. } => id,
            Command::StopShare { id, .. } => id,
            Command::ListShares { id, .. } => id,
            Command::CreateArchive { id, .. } => id,
            Command::ExtractArchive { id, .. } => id,
        }
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
    PathSuggestions(PathSuggestions),
    ProtectedPaths(ProtectedPaths),
    ShareList(ShareList),
    ShareInfo(ShareInfo),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathSuggestions {
    pub input: String,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtectedPaths {
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareInfo {
    pub id: String,
    pub path: String,
    pub is_directory: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareList {
    pub items: Vec<ShareInfo>,
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
