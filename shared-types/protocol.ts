/**
 * Shared protocol definitions between client and server.
 * These types define the command structure and responses.
 */

// ============================================================================
// OS Info
// ============================================================================

export enum OSType {
  WINDOWS = 'windows',
  LINUX = 'linux',
  MACOS = 'macos',
  UNKNOWN = 'unknown',
}

export interface OSInfoResponse {
  /** e.g. "windows", "linux", "macos" */
  os: OSType;
  /** e.g. "10.0.22621", "22.04 LTS", "14.3" */
  version: string;
  /** e.g. "x86_64", "aarch64" */
  arch: string;
  /** Machine hostname */
  hostname: string;
  /**
   * On Windows: the system drive root that all absolute paths are
   * relative to (e.g. "C:\\").  null on non-Windows platforms.
   */
  systemDrive: string | null;
}

// ============================================================================
// Drives
// ============================================================================

export interface DriveInfo {
  /** Short label, e.g. "C:" on Windows or "sda1" on Linux */
  name: string;
  /** Mount/root path — always includes drive letter on Windows, e.g. "C:\\" */
  path: string;
  /** "fixed" | "removable" | "network" | "cdrom" | "ramdisk" | "unknown" */
  driveType: 'fixed' | 'removable' | 'network' | 'cdrom' | 'ramdisk' | 'unknown';
  /** Total capacity in bytes */
  totalSpace: number;
  /** Free space in bytes */
  freeSpace: number;
  /** e.g. "NTFS", "ext4" */
  fileSystem: string | null;
}

export interface DrivesList {
  drives: DriveInfo[];
}

// ============================================================================
// Commands (Client -> Server)
// ============================================================================

export enum CommandType {
  LIST_DRIVES = 'LIST_DRIVES',
  LIST_DIRECTORY = 'LIST_DIRECTORY',
  READ_FILE = 'READ_FILE',
  WRITE_FILE = 'WRITE_FILE',
  DELETE_FILE = 'DELETE_FILE',
  CREATE_DIRECTORY = 'CREATE_DIRECTORY',
  MOVE_FILE = 'MOVE_FILE',
  COPY_FILE = 'COPY_FILE',
  GET_FILE_INFO = 'GET_FILE_INFO',
  SEARCH_FILES = 'SEARCH_FILES',
  GET_OS_INFO = 'GET_OS_INFO',
}

export interface BaseCommand {
  /** Unique command ID for tracking */
  id: string;
  type: CommandType;
  timestamp: number;
}

export interface GetOSInfoCommand extends BaseCommand {
  type: CommandType.GET_OS_INFO;
}

export interface ListDrivesCommand extends BaseCommand {
  type: CommandType.LIST_DRIVES;
}

export interface ListDirectoryCommand extends BaseCommand {
  type: CommandType.LIST_DIRECTORY;
  path: string;
  showHidden?: boolean;
}

export interface ReadFileCommand extends BaseCommand {
  type: CommandType.READ_FILE;
  path: string;
  encoding?: 'utf8' | 'base64';
}

export interface WriteFileCommand extends BaseCommand {
  type: CommandType.WRITE_FILE;
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
}

export interface DeleteFileCommand extends BaseCommand {
  type: CommandType.DELETE_FILE;
  path: string;
  /** Required when deleting a directory */
  recursive?: boolean;
}

export interface CreateDirectoryCommand extends BaseCommand {
  type: CommandType.CREATE_DIRECTORY;
  path: string;
  /** Create parent directories as needed */
  recursive?: boolean;
}

export interface MoveFileCommand extends BaseCommand {
  type: CommandType.MOVE_FILE;
  source: string;
  destination: string;
}

export interface CopyFileCommand extends BaseCommand {
  type: CommandType.COPY_FILE;
  source: string;
  destination: string;
  /** Required when copying a directory */
  recursive?: boolean;
}

export interface GetFileInfoCommand extends BaseCommand {
  type: CommandType.GET_FILE_INFO;
  path: string;
}

export interface SearchFilesCommand extends BaseCommand {
  type: CommandType.SEARCH_FILES;
  path: string;
  pattern: string;
  recursive?: boolean;
}

export type Command =
  | GetOSInfoCommand
  | ListDrivesCommand
  | ListDirectoryCommand
  | ReadFileCommand
  | WriteFileCommand
  | DeleteFileCommand
  | CreateDirectoryCommand
  | MoveFileCommand
  | CopyFileCommand
  | GetFileInfoCommand
  | SearchFilesCommand;

// ============================================================================
// Responses (Server -> Client)
// ============================================================================

export enum ResponseStatus {
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface BaseResponse {
  /** References the originating command ID */
  commandId: string;
  status: ResponseStatus;
  timestamp: number;
}

export interface SuccessResponse<T = unknown> extends BaseResponse {
  status: ResponseStatus.SUCCESS;
  data: T;
}

export interface ErrorResponse extends BaseResponse {
  status: ResponseStatus.ERROR;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type Response<T = unknown> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// File-system Data Types
// ============================================================================

export enum FileType {
  FILE = 'FILE',
  DIRECTORY = 'DIRECTORY',
  SYMLINK = 'SYMLINK',
}

export interface FileInfo {
  name: string;
  /** Absolute path — always includes drive letter on Windows */
  path: string;
  type: FileType;
  /** Size in bytes */
  size: number;
  /** Unix timestamp */
  created: number;
  /** Unix timestamp */
  modified: number;
  /** Unix timestamp */
  accessed: number;
  /** e.g. "rwxr-xr-x" on Unix, "rw-" / "r--" on Windows */
  permissions: string;
  isHidden: boolean;
}

export interface DirectoryListing {
  path: string;
  entries: FileInfo[];
  totalSize: number;
}

export interface FileContent {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  size: number;
}

export interface OperationResult {
  success: boolean;
  message?: string;
  affectedPaths?: string[];
}

export interface SearchResult {
  path: string;
  matches: FileInfo[];
  totalMatches: number;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

export enum MessageType {
  COMMAND = 'COMMAND',
  RESPONSE = 'RESPONSE',
  PING = 'PING',
  PONG = 'PONG',
  AUTH = 'AUTH',
}

export interface WebSocketMessage {
  type: MessageType;
  payload: unknown;
}

export interface AuthPayload {
  token: string;
}