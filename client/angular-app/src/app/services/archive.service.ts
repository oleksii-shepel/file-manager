import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { 
  Command, 
  CommandType,
  BaseCommand,
  Response,
  ResponseStatus,
  SuccessResponse,
  ErrorResponse
} from '@shared/protocol';

// ============================================================================
// Archive Command Types (using string literals instead of extending enum)
// ============================================================================

// Use string literals that match what the backend expects
export const ARCHIVE_COMMAND_TYPES = {
  LIST_ARCHIVE: 'LIST_ARCHIVE',
  READ_ARCHIVE_FILE: 'READ_ARCHIVE_FILE',
  EXTRACT_ARCHIVE: 'EXTRACT_ARCHIVE',
} as const;

export type ArchiveCommandType = typeof ARCHIVE_COMMAND_TYPES[keyof typeof ARCHIVE_COMMAND_TYPES];

// ============================================================================
// Archive Command Interfaces (don't extend BaseCommand directly)
// ============================================================================

// Create a base interface for archive commands that mimics BaseCommand structure
interface ArchiveBaseCommand {
  id: string;
  type: ArchiveCommandType;
  timestamp: number;
}

export interface ListArchiveCommand extends ArchiveBaseCommand {
  type: typeof ARCHIVE_COMMAND_TYPES.LIST_ARCHIVE;
  archivePath: string;
  innerPath: string;
}

export interface ReadArchiveFileCommand extends ArchiveBaseCommand {
  type: typeof ARCHIVE_COMMAND_TYPES.READ_ARCHIVE_FILE;
  archivePath: string;
  innerPath: string;
  encoding?: 'utf8' | 'base64';
}

export interface ExtractArchiveCommand extends ArchiveBaseCommand {
  type: typeof ARCHIVE_COMMAND_TYPES.EXTRACT_ARCHIVE;
  archivePath: string;
  destination: string;
  innerPaths: string[];
}

// Union type for all archive commands
export type ArchiveCommand = 
  | ListArchiveCommand
  | ReadArchiveFileCommand
  | ExtractArchiveCommand;

// ============================================================================
// Archive Response Types
// ============================================================================

export type ArchiveEntryType = 'FILE' | 'DIRECTORY';

export interface ArchiveEntry {
  name: string;
  innerPath: string;
  type: ArchiveEntryType;
  size: number;
  compressedSize: number;
  modified: number;   // Unix seconds (0 = unknown)
  compression: string;
}

export interface ArchiveListing {
  archivePath: string;
  innerPath: string;   // "" = root of archive
  format: string;      // "zip" | "tar" | "tar.gz" | "tar.bz2" | "tar.xz" | "tar.zst" | "gz" | "bz2" | "xz" | "zst"
  entries: ArchiveEntry[];
  totalSize: number;
}

export interface ReadArchiveFileResponse {
  path: string;
  content: string;
  encoding: 'utf8' | 'base64';
  size: number;
}

export interface ExtractArchiveResponse {
  success: boolean;
  message: string;
  affectedPaths: string[];
}

// ============================================================================
// Archive extensions (must match Rust ArchiveFormat::detect)
// ============================================================================

const ARCHIVE_EXTENSIONS = [
  '.tar.gz', '.tgz',
  '.tar.bz2', '.tbz2', '.tbz',
  '.tar.xz', '.txz',
  '.tar.zst', '.tar.zstd', '.tzst',
  '.tar',
  '.zip', '.jar', '.war', '.ear', '.apk',
  '.docx', '.xlsx', '.pptx',
  '.odt', '.ods', '.odp',
  '.gz', '.bz2', '.xz',
  '.zst', '.zstd',
];

export function isArchive(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/** Returns the human-friendly format label for a file path. */
export function archiveFormat(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tbz')) return 'tar.bz2';
  if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) return 'tar.xz';
  if (lower.endsWith('.tar.zst') || lower.endsWith('.tar.zstd') || lower.endsWith('.tzst')) return 'tar.zst';
  if (lower.endsWith('.tar')) return 'tar';
  if (lower.endsWith('.zip') || lower.endsWith('.jar') || lower.endsWith('.war') ||
      lower.endsWith('.ear') || lower.endsWith('.apk')) return 'zip';
  if (lower.endsWith('.docx') || lower.endsWith('.xlsx') || lower.endsWith('.pptx') ||
      lower.endsWith('.odt')  || lower.endsWith('.ods')  || lower.endsWith('.odp')) return 'zip (office)';
  if (lower.endsWith('.gz')) return 'gz';
  if (lower.endsWith('.bz2')) return 'bz2';
  if (lower.endsWith('.xz')) return 'xz';
  if (lower.endsWith('.zst') || lower.endsWith('.zstd')) return 'zst';
  return 'unknown';
}

// ============================================================================
// Service
// ============================================================================

@Injectable({ providedIn: 'root' })
export class ArchiveService {

  constructor(private api: ApiService) {}

  private generateCommandId(): string {
    return `archive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private baseCommand<T extends ArchiveCommandType>(type: T) {
    return {
      type,
      id: this.generateCommandId(),
      timestamp: Date.now(),
    } as const;
  }

  private isSuccessResponse<T>(response: Response<T>): response is SuccessResponse<T> {
    return response.status === ResponseStatus.SUCCESS;
  }

  private async sendCommand<T>(command: ArchiveCommand): Promise<T> {
    // Since ApiService.sendHttpCommand expects Command type, we need to cast
    // This is safe because the backend will understand the archive commands
    const response = await this.api['sendHttpCommand'](command as unknown as Command) as Response<T>;
    
    if (!this.isSuccessResponse(response)) {
      throw new Error(response.error.message);
    }
    
    return response.data;
  }

  /**
   * List entries inside an archive, optionally under a sub-directory.
   *
   * @param archivePath  Absolute path to the archive on disk.
   * @param innerPath    Inner directory to list (empty string = root).
   */
  async listArchive(archivePath: string, innerPath: string = ''): Promise<ArchiveListing> {
    const command: ListArchiveCommand = {
      ...this.baseCommand(ARCHIVE_COMMAND_TYPES.LIST_ARCHIVE),
      archivePath,
      innerPath,
    };
    
    return this.sendCommand<ArchiveListing>(command);
  }

  /**
   * Read a single file from inside an archive.
   * Returns the file content as a string (text) or base64 (binary).
   *
   * @param archivePath  Absolute path to the archive on disk.
   * @param innerPath    Path of the file inside the archive.
   * @param encoding     'utf8' | 'base64' (defaults to 'utf8')
   */
  async readArchiveFile(
    archivePath: string, 
    innerPath: string, 
    encoding: 'utf8' | 'base64' = 'utf8'
  ): Promise<ReadArchiveFileResponse> {
    const command: ReadArchiveFileCommand = {
      ...this.baseCommand(ARCHIVE_COMMAND_TYPES.READ_ARCHIVE_FILE),
      archivePath,
      innerPath,
      encoding,
    };
    
    return this.sendCommand<ReadArchiveFileResponse>(command);
  }

  /**
   * Extract entries from an archive to a destination directory.
   *
   * @param archivePath  Absolute path to the archive on disk.
   * @param destination  Destination directory on the filesystem.
   * @param innerPaths   Specific inner paths to extract (empty = all).
   */
  async extractArchive(
    archivePath: string,
    destination: string,
    innerPaths: string[] = [],
  ): Promise<ExtractArchiveResponse> {
    const command: ExtractArchiveCommand = {
      ...this.baseCommand(ARCHIVE_COMMAND_TYPES.EXTRACT_ARCHIVE),
      archivePath,
      destination,
      innerPaths,
    };
    
    return this.sendCommand<ExtractArchiveResponse>(command);
  }

  /** Convenience: compress ratio as a percentage string */
  compressionRatio(entry: ArchiveEntry): string {
    if (entry.size === 0 || entry.compressedSize === 0) return '—';
    const ratio = Math.round((1 - entry.compressedSize / entry.size) * 100);
    return `${ratio}%`;
  }

  /**
   * Check if a path is an archive based on its extension
   */
  isArchivePath(path: string): boolean {
    return isArchive(path);
  }

  /**
   * Get the format of an archive file
   */
  getArchiveFormat(path: string): string {
    return archiveFormat(path);
  }
}