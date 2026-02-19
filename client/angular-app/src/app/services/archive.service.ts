import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { 
  Command, 
  Response,
  ResponseStatus,
  SuccessResponse,
  ErrorResponse
} from '@shared/protocol';

// ============================================================================
// Archive Response Types (matching Rust protocol)
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
  format: string;      // Archive format as string
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
// Archive Format Detection (matching Rust ArchiveFormat)
// ============================================================================

export type ArchiveFormat = 
  // Common formats
  | 'zip' | 'tar' | 'tar.gz' | 'tar.bz2' | 'tar.xz' | 'tar.zst'
  | 'gz' | 'bz2' | 'xz' | 'zst'
  // Additional formats
  | '7z' | 'rar' | 'cab' | 'arj' | 'lzh' | 'ace';

// Complete list of archive extensions (updated with all supported formats)
const ARCHIVE_EXTENSIONS = [
  // ZIP and Office documents (all ZIP-based)
  '.zip', '.jar', '.war', '.ear', '.apk',
  '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp',
  
  // TAR variants
  '.tar', '.tar.gz', '.tgz', '.tar.bz2', '.tbz2', '.tbz',
  '.tar.xz', '.txz', '.tar.zst', '.tar.zstd', '.tzst',
  
  // Single-file compression
  '.gz', '.bz2', '.xz', '.zst', '.zstd',
  
  // Additional archive formats
  '.7z',           // 7-Zip
  '.rar',          // RAR Archive
  '.cab',          // CAB Archive
  '.arj',          // ARJ Archive
  '.lzh', '.lha',  // LZH Archive
  '.ace',          // ACE Archive
];

/**
 * Check if a file path has a supported archive extension
 * Matches the Rust ArchiveFormat::detect function
 */
export function isArchive(path: string): boolean {
  const lower = path.toLowerCase();
  return ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * Returns the format label for a file path.
 * Matches the Rust ArchiveFormat::as_str() and detection logic
 */
export function getArchiveFormat(path: string): ArchiveFormat | 'unknown' {
  const lower = path.toLowerCase();
  
  // TAR.GZ variants
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    return 'tar.gz';
  }
  
  // TAR.BZ2 variants
  if (lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.tbz')) {
    return 'tar.bz2';
  }
  
  // TAR.XZ variants
  if (lower.endsWith('.tar.xz') || lower.endsWith('.txz')) {
    return 'tar.xz';
  }
  
  // TAR.ZST variants
  if (lower.endsWith('.tar.zst') || lower.endsWith('.tar.zstd') || lower.endsWith('.tzst')) {
    return 'tar.zst';
  }
  
  // Plain TAR
  if (lower.endsWith('.tar')) {
    return 'tar';
  }
  
  // ZIP and ZIP-based formats (Office docs, JAR, etc.)
  if (lower.endsWith('.zip') || lower.endsWith('.jar') || lower.endsWith('.war') ||
      lower.endsWith('.ear') || lower.endsWith('.apk') || lower.endsWith('.docx') ||
      lower.endsWith('.xlsx') || lower.endsWith('.pptx') || lower.endsWith('.odt') ||
      lower.endsWith('.ods') || lower.endsWith('.odp')) {
    return 'zip';
  }
  
  // Single-file compression
  if (lower.endsWith('.gz')) {
    return 'gz';
  }
  if (lower.endsWith('.bz2')) {
    return 'bz2';
  }
  if (lower.endsWith('.xz')) {
    return 'xz';
  }
  if (lower.endsWith('.zst') || lower.endsWith('.zstd')) {
    return 'zst';
  }
  
  // Additional formats
  if (lower.endsWith('.7z')) {
    return '7z';
  }
  if (lower.endsWith('.rar')) {
    return 'rar';
  }
  if (lower.endsWith('.cab')) {
    return 'cab';
  }
  if (lower.endsWith('.arj')) {
    return 'arj';
  }
  if (lower.endsWith('.lzh') || lower.endsWith('.lha')) {
    return 'lzh';
  }
  if (lower.endsWith('.ace')) {
    return 'ace';
  }
  
  return 'unknown';
}

/**
 * Get a human-readable description of the archive format
 */
export function getFormatDescription(format: ArchiveFormat | string): string {
  const descriptions: Record<string, string> = {
    // Common formats
    'zip': 'ZIP Archive',
    'tar': 'TAR Archive',
    'tar.gz': 'GZIP-compressed TAR',
    'tar.bz2': 'BZIP2-compressed TAR',
    'tar.xz': 'XZ-compressed TAR',
    'tar.zst': 'Zstandard-compressed TAR',
    'gz': 'GZIP Compressed File',
    'bz2': 'BZIP2 Compressed File',
    'xz': 'XZ Compressed File',
    'zst': 'Zstandard Compressed File',
    
    // Additional formats
    '7z': '7-Zip Archive',
    'rar': 'RAR Archive',
    'cab': 'CAB Archive',
    'arj': 'ARJ Archive',
    'lzh': 'LZH Archive',
    'ace': 'ACE Archive',
  };
  return descriptions[format] || `Unknown (${format})`;
}

/**
 * Get the file extension for a format
 */
export function getFormatExtension(format: ArchiveFormat): string {
  const extensions: Record<ArchiveFormat, string> = {
    'zip': '.zip',
    'tar': '.tar',
    'tar.gz': '.tar.gz',
    'tar.bz2': '.tar.bz2',
    'tar.xz': '.tar.xz',
    'tar.zst': '.tar.zst',
    'gz': '.gz',
    'bz2': '.bz2',
    'xz': '.xz',
    'zst': '.zst',
    '7z': '.7z',
    'rar': '.rar',
    'cab': '.cab',
    'arj': '.arj',
    'lzh': '.lzh',
    'ace': '.ace',
  };
  return extensions[format] || '.unknown';
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

  private baseCommand(type: string, extra: Record<string, any> = {}) {
    return {
      type,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      ...extra,
    };
  }

  private isSuccessResponse<T>(response: Response<T>): response is SuccessResponse<T> {
    return response.status === ResponseStatus.SUCCESS;
  }

  private async sendCommand<T>(command: any): Promise<T> {
    // The command will match the Rust Command enum structure
    const response = await this.api['sendHttpCommand'](command as Command) as Response<T>;
    
    if (!this.isSuccessResponse(response)) {
      throw new Error(response.error.message);
    }
    
    return response.data;
  }

  /**
   * List entries inside an archive, optionally under a sub-directory.
   * 
   * @param archivePath  Absolute path to the archive file on disk.
   * @param innerPath    Inner directory to list (empty string = root).
   */
  async listArchive(archivePath: string, innerPath: string = ''): Promise<ArchiveListing> {
    const command = this.baseCommand('LIST_ARCHIVE', {
      archive_path: archivePath,
      inner_path: innerPath,
    });
    
    return this.sendCommand<ArchiveListing>(command);
  }

  /**
   * Read a single file from inside an archive.
   * Returns the file content as a string (text) or base64 (binary).
   * 
   * @param archivePath  Absolute path to the archive file on disk.
   * @param innerPath    Path of the file inside the archive.
   * @param encoding     'utf8' | 'base64' (defaults to 'utf8')
   */
  async readArchiveFile(
    archivePath: string, 
    innerPath: string, 
    encoding: 'utf8' | 'base64' = 'utf8'
  ): Promise<ReadArchiveFileResponse> {
    const command = this.baseCommand('READ_ARCHIVE_FILE', {
      archive_path: archivePath,
      inner_path: innerPath,
      encoding,
    });
    
    return this.sendCommand<ReadArchiveFileResponse>(command);
  }

  /**
   * Extract entries from an archive to a destination directory.
   * 
   * @param archivePath  Absolute path to the archive file on disk.
   * @param destination  Destination directory on the filesystem.
   * @param innerPaths   Specific inner paths to extract (empty = all).
   */
  async extractArchive(
    archivePath: string,
    destination: string,
    innerPaths: string[] = [],
  ): Promise<ExtractArchiveResponse> {
    const command = this.baseCommand('EXTRACT_ARCHIVE', {
      archive_path: archivePath,
      destination,
      inner_paths: innerPaths,
    });
    
    return this.sendCommand<ExtractArchiveResponse>(command);
  }

  /**
   * Get compression ratio as a percentage string
   */
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
  getArchiveFormat(path: string): ArchiveFormat | 'unknown' {
    return getArchiveFormat(path);
  }

  /**
   * Get a human-readable description of the archive format
   */
  getFormatDescription(format: ArchiveFormat | string): string {
    return getFormatDescription(format);
  }

  /**
   * Get the file extension for a format
   */
  getFormatExtension(format: ArchiveFormat): string {
    return getFormatExtension(format);
  }

  /**
   * Check if a format is supported
   */
  isFormatSupported(format: string): boolean {
    const supportedFormats: ArchiveFormat[] = [
      'zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst',
      'gz', 'bz2', 'xz', 'zst',
      '7z', 'rar', 'cab', 'arj', 'lzh', 'ace'
    ];
    return supportedFormats.includes(format as ArchiveFormat);
  }

  /**
   * Get all supported archive formats
   */
  getSupportedFormats(): ArchiveFormat[] {
    return [
      'zip', 'tar', 'tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst',
      'gz', 'bz2', 'xz', 'zst',
      '7z', 'rar', 'cab', 'arj', 'lzh', 'ace'
    ];
  }

  /**
   * Get file icon based on archive format
   */
  getArchiveIcon(format: ArchiveFormat | string): string {
    const icons: Record<string, string> = {
      'zip': '📦',
      'tar': '📦',
      'tar.gz': '📦',
      'tar.bz2': '📦',
      'tar.xz': '📦',
      'tar.zst': '📦',
      'gz': '🗜️',
      'bz2': '🗜️',
      'xz': '🗜️',
      'zst': '🗜️',
      '7z': '🗜️',
      'rar': '📚',
      'cab': '📦',
      'arj': '📦',
      'lzh': '📦',
      'ace': '📦',
    };
    return icons[format] || '📄';
  }
}

// Re-export utility functions for convenience
export {
  getArchiveFormat as archiveFormat,
};