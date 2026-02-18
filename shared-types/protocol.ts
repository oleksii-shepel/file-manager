/**
 * Shared protocol definitions between client and server
 * These types define the command structure and responses
 */

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
}

export interface BaseCommand {
  id: string; // Unique command ID for tracking
  type: CommandType;
  timestamp: number;
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
  recursive?: boolean; // For directories
}

export interface CreateDirectoryCommand extends BaseCommand {
  type: CommandType.CREATE_DIRECTORY;
  path: string;
  recursive?: boolean; // Create parent directories
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
  recursive?: boolean; // For directories
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

// DriveInfo type
export interface DriveInfo {
  name: string; // e.g. 'C:'
  path: string; // e.g. 'C:\\'
  type: 'fixed' | 'removable' | 'network' | 'cdrom' | 'ramdisk' | 'unknown';
  totalSpace?: number; // bytes
  freeSpace?: number; // bytes
  fileSystem?: string; // e.g. 'NTFS'
  isReady?: boolean;
}

export type Command =
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
  commandId: string; // References the command ID
  status: ResponseStatus;
  timestamp: number;
}

export interface SuccessResponse<T = any> extends BaseResponse {
  status: ResponseStatus.SUCCESS;
  data: T;
}

export interface ErrorResponse extends BaseResponse {
  status: ResponseStatus.ERROR;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

export type Response<T = any> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// Data Types
// ============================================================================

export enum FileType {
  FILE = 'FILE',
  DIRECTORY = 'DIRECTORY',
  SYMLINK = 'SYMLINK',
}

export interface FileInfo {
  name: string;
  path: string;
  type: FileType;
  size: number; // In bytes
  created: number; // Unix timestamp
  modified: number; // Unix timestamp
  accessed: number; // Unix timestamp
  permissions: string; // e.g., "rwxr-xr-x"
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
  payload: any;
}

export interface AuthPayload {
  token: string;
}
