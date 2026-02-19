use serde::{Deserialize, Serialize};

// ============================================================================
// OS Info
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsInfo {
    pub os: String,
    pub version: String,
    pub arch: String,
    pub hostname: String,
    pub system_drive: Option<String>,
}

// ============================================================================
// Drives
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveInfo {
    pub name: String,
    pub path: String,
    pub drive_type: String,
    pub total_space: u64,
    pub free_space: u64,
    pub file_system: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrivesList {
    pub drives: Vec<DriveInfo>,
}

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

    #[serde(rename = "GET_OS_INFO")]
    GetOsInfo {
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

    /// List the contents of an archive at `archive_path`, optionally under
    /// a sub-directory `inner_path` within the archive.
    #[serde(rename = "LIST_ARCHIVE")]
    ListArchive {
        id: String,
        timestamp: i64,
        /// Absolute path to the archive file on disk.
        archive_path: String,
        /// Path inside the archive to list (empty string = root).
        #[serde(default)]
        inner_path: String,
    },

    /// Extract a single file from an archive and return its contents.
    #[serde(rename = "READ_ARCHIVE_FILE")]
    ReadArchiveFile {
        id: String,
        timestamp: i64,
        archive_path: String,
        /// Path of the file inside the archive.
        inner_path: String,
        #[serde(default)]
        encoding: Option<String>,
    },

    /// Extract one or more entries from an archive to a destination directory.
    #[serde(rename = "EXTRACT_ARCHIVE")]
    ExtractArchive {
        id: String,
        timestamp: i64,
        archive_path: String,
        /// Destination directory on the filesystem.
        destination: String,
        /// Optional list of inner paths to extract; if empty, extract all.
        #[serde(default)]
        inner_paths: Vec<String>,
    },
}

impl Command {
    pub fn id(&self) -> &str {
        match self {
            Command::ListDirectory { id, .. } => id,
            Command::ListDrives { id, .. } => id,
            Command::GetOsInfo { id, .. } => id,
            Command::ReadFile { id, .. } => id,
            Command::WriteFile { id, .. } => id,
            Command::DeleteFile { id, .. } => id,
            Command::CreateDirectory { id, .. } => id,
            Command::MoveFile { id, .. } => id,
            Command::CopyFile { id, .. } => id,
            Command::GetFileInfo { id, .. } => id,
            Command::SearchFiles { id, .. } => id,
            Command::ListArchive { id, .. } => id,
            Command::ReadArchiveFile { id, .. } => id,
            Command::ExtractArchive { id, .. } => id,
        }
    }
}

// ============================================================================
// Responses (Server -> Client)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
#[serde(rename_all = "camelCase")]
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
    OsInfo(OsInfo),
    ArchiveListing(ArchiveListing),
}

// ============================================================================
// File-system Data Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FileType {
    File,
    Directory,
    Symlink,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
    pub path: String,
    pub entries: Vec<FileInfo>,
    pub total_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub matches: Vec<FileInfo>,
    pub total_matches: usize,
}

// ============================================================================
// Archive Data Types
// ============================================================================

/// A single entry inside an archive (file or directory).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveEntry {
    /// File/directory name (last component of `inner_path`).
    pub name: String,
    /// Full path inside the archive, using forward slashes.
    pub inner_path: String,
    /// `"FILE"` or `"DIRECTORY"`.
    #[serde(rename = "type")]
    pub entry_type: ArchiveEntryType,
    /// Uncompressed size in bytes (0 for directories).
    pub size: u64,
    /// Compressed size in bytes (0 for directories / unsupported formats).
    pub compressed_size: u64,
    /// Unix timestamp of the last-modified time (0 if unknown).
    pub modified: i64,
    /// Compression method string, e.g. `"Deflate"`, `"Stored"`, `"BZip2"`, etc.
    pub compression: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ArchiveEntryType {
    File,
    Directory,
}

/// Response for LIST_ARCHIVE.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveListing {
    /// Absolute path to the archive on disk.
    pub archive_path: String,
    /// The inner path that was listed (empty string = root).
    pub inner_path: String,
    /// Format detected: `"zip"`, `"tar"`, `"tar.gz"`, `"tar.bz2"`, `"tar.xz"`, `"tar.zst"`, `"gz"`, `"bz2"`, `"xz"`, `"zst"`.
    pub format: String,
    /// Direct children of `inner_path`.
    pub entries: Vec<ArchiveEntry>,
    /// Total uncompressed size of all entries in this listing level.
    pub total_size: u64,
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