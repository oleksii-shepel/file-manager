import { Injectable } from '@angular/core';
import { Observable, Subject, from } from 'rxjs';
import {
  Command,
  Response,
  CommandType,
  ListDirectoryCommand,
  ReadFileCommand,
  WriteFileCommand,
  DeleteFileCommand,
  CreateDirectoryCommand,
  MoveFileCommand,
  CopyFileCommand,
  GetFileInfoCommand,
  SearchFilesCommand,
  SuggestPathsCommand,
  ProtectPathCommand,
  UnprotectPathCommand,
  ListProtectedCommand,
  StartShareCommand,
  StopShareCommand,
  ListSharesCommand,
  CreateArchiveCommand,
  ExtractArchiveCommand,
  DirectoryListing,
  FileContent,
  FileInfo,
  OperationResult,
  PathSuggestions,
  ProtectedPaths,
  ShareInfo,
  ShareList,
  SearchResult,
  WebSocketMessage,
  MessageType,
} from '@shared/protocol';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private serverUrl = 'http://localhost:3030';
  private wsUrl = 'ws://localhost:3030/ws';
  private ws: WebSocket | null = null;
  private wsMessages$ = new Subject<Response>();
  private commandCounter = 0;

  constructor() {}

  /**
   * Initialize WebSocket connection for real-time communication
   */
  connectWebSocket(): Observable<Response> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.wsMessages$.asObservable();
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.type === MessageType.RESPONSE) {
          this.wsMessages$.next(message.payload as Response);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.ws = null;
    };

    return this.wsMessages$.asObservable();
  }

  /**
   * Send command via WebSocket
   */
  private sendWebSocketCommand(command: Command): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const message: WebSocketMessage = {
      type: MessageType.COMMAND,
      payload: command,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Send command via HTTP POST
   */
  private async sendHttpCommand(command: Command): Promise<Response> {
    const response = await fetch(`${this.serverUrl}/api/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Generate unique command ID
   */
  private generateCommandId(): string {
    return `cmd-${Date.now()}-${++this.commandCounter}`;
  }

  /**
   * List directory contents
   */
  async listDirectory(path: string, showHidden: boolean = false): Promise<DirectoryListing> {
    const command: ListDirectoryCommand = {
      type: CommandType.LIST_DIRECTORY,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
      showHidden,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as DirectoryListing;
  }

  /**
   * Read file contents
   */
  async readFile(path: string, encoding: 'utf8' | 'base64' = 'utf8'): Promise<FileContent> {
    const command: ReadFileCommand = {
      type: CommandType.READ_FILE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
      encoding,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as FileContent;
  }

  /**
   * Write file contents
   */
  async writeFile(
    path: string,
    content: string,
    encoding: 'utf8' | 'base64' = 'utf8'
  ): Promise<OperationResult> {
    const command: WriteFileCommand = {
      type: CommandType.WRITE_FILE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
      content,
      encoding,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as OperationResult;
  }

  /**
   * Delete file or directory
   */
  async deleteFile(path: string, recursive: boolean = false): Promise<OperationResult> {
    const command: DeleteFileCommand = {
      type: CommandType.DELETE_FILE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
      recursive,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as OperationResult;
  }

  /**
   * Create directory
   */
  async createDirectory(path: string, recursive: boolean = true): Promise<OperationResult> {
    const command: CreateDirectoryCommand = {
      type: CommandType.CREATE_DIRECTORY,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
      recursive,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as OperationResult;
  }

  /**
   * Move file or directory
   */
  async moveFile(source: string, destination: string): Promise<OperationResult> {
    const command: MoveFileCommand = {
      type: CommandType.MOVE_FILE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      source,
      destination,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as OperationResult;
  }

  /**
   * Copy file or directory
   */
  async copyFile(
    source: string,
    destination: string,
    recursive: boolean = false
  ): Promise<OperationResult> {
    const command: CopyFileCommand = {
      type: CommandType.COPY_FILE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      source,
      destination,
      recursive,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as OperationResult;
  }

  /**
   * Get file information
   */
  async getFileInfo(path: string): Promise<FileInfo> {
    const command: GetFileInfoCommand = {
      type: CommandType.GET_FILE_INFO,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as FileInfo;
  }

  /**
   * Search for files
   */
  async searchFiles(
    path: string,
    pattern: string,
    recursive: boolean = true,
    maxResults?: number
  ): Promise<SearchResult> {
    const command: SearchFilesCommand = {
      type: CommandType.SEARCH_FILES,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
      pattern,
      recursive,
      maxResults,
    };

    const response = await this.sendHttpCommand(command);
    
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }

    return response.data as SearchResult;
  }

  async smartGlobalSearch(query: string, maxResults: number = 200): Promise<SearchResult> {
    return this.searchFiles('__global__', query, true, maxResults);
  }

  async suggestPaths(input: string, currentPath: string, limit: number = 20): Promise<PathSuggestions> {
    const command: SuggestPathsCommand = {
      type: CommandType.SUGGEST_PATHS,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      input,
      currentPath,
      limit,
    };

    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as PathSuggestions;
  }

  async protectPath(path: string): Promise<OperationResult> {
    const command: ProtectPathCommand = {
      type: CommandType.PROTECT_PATH,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as OperationResult;
  }

  async unprotectPath(path: string): Promise<OperationResult> {
    const command: UnprotectPathCommand = {
      type: CommandType.UNPROTECT_PATH,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as OperationResult;
  }

  async listProtectedPaths(): Promise<ProtectedPaths> {
    const command: ListProtectedCommand = {
      type: CommandType.LIST_PROTECTED,
      id: this.generateCommandId(),
      timestamp: Date.now(),
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as ProtectedPaths;
  }

  async startShare(path: string, expiresMinutes?: number): Promise<ShareInfo> {
    const command: StartShareCommand = {
      type: CommandType.START_SHARE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      path,
      expiresMinutes,
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as ShareInfo;
  }

  async stopShare(shareId: string): Promise<OperationResult> {
    const command: StopShareCommand = {
      type: CommandType.STOP_SHARE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      shareId,
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as OperationResult;
  }

  async listShares(): Promise<ShareList> {
    const command: ListSharesCommand = {
      type: CommandType.LIST_SHARES,
      id: this.generateCommandId(),
      timestamp: Date.now(),
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as ShareList;
  }

  async createArchive(sources: string[], archivePath: string): Promise<OperationResult> {
    const command: CreateArchiveCommand = {
      type: CommandType.CREATE_ARCHIVE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      sources,
      archivePath,
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as OperationResult;
  }

  async extractArchive(archivePath: string, destinationPath: string): Promise<OperationResult> {
    const command: ExtractArchiveCommand = {
      type: CommandType.EXTRACT_ARCHIVE,
      id: this.generateCommandId(),
      timestamp: Date.now(),
      archivePath,
      destinationPath,
    };
    const response = await this.sendHttpCommand(command);
    if (response.status === 'ERROR') {
      throw new Error(response.error.message);
    }
    return response.data as OperationResult;
  }

  /**
   * Check server health
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
