import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  Command,
  CommandType,
  Response,
  ResponseStatus,
  MessageType,
  WebSocketMessage,
  // Command shapes
  GetOSInfoCommand,
  ListDrivesCommand,
  ListDirectoryCommand,
  ReadFileCommand,
  WriteFileCommand,
  DeleteFileCommand,
  CreateDirectoryCommand,
  MoveFileCommand,
  CopyFileCommand,
  GetFileInfoCommand,
  SearchFilesCommand,
  // Response data shapes
  OSInfoResponse,
  DrivesList,
  DriveInfo,
  DirectoryListing,
  FileContent,
  FileInfo,
  OperationResult,
  SearchResult,
} from '@shared/protocol';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly serverUrl = 'http://localhost:3030';
  private readonly wsUrl = 'ws://localhost:3030/ws';

  private ws: WebSocket | null = null;
  private readonly wsMessages$ = new Subject<Response>();
  private commandCounter = 0;

  // -------------------------------------------------------------------------
  // WebSocket
  // -------------------------------------------------------------------------

  /** Open (or reuse) a WebSocket connection and stream incoming responses. */
  connectWebSocket(): Observable<Response> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return this.wsMessages$.asObservable();
    }

    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => console.log('WebSocket connected');

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        if (message.type === MessageType.RESPONSE) {
          this.wsMessages$.next(message.payload as Response);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => console.error('WebSocket error:', error);

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.ws = null;
    };

    return this.wsMessages$.asObservable();
  }

  /** Close the WebSocket connection. */
  disconnectWebSocket(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Send a command over the open WebSocket. */
  private sendWebSocketCommand(command: Command): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const message: WebSocketMessage = {
      type: MessageType.COMMAND,
      payload: command,
    };

    this.ws.send(JSON.stringify(message));
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  /** Send a command via HTTP POST and return the parsed response. */
  private async sendHttpCommand<T = unknown>(command: Command): Promise<Response<T>> {
    const res = await fetch(`${this.serverUrl}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    return res.json() as Promise<Response<T>>;
  }

  /** Throw if the response carries an error, otherwise return the data payload. */
  private unwrap<T>(response: Response<T>): T {
    if (response.status === ResponseStatus.ERROR) {
      throw new Error(response.error.message);
    }
    return response.data;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private generateCommandId(): string {
    return `cmd-${Date.now()}-${++this.commandCounter}`;
  }

  private baseCommand<T extends CommandType>(type: T) {
    return {
      type,
      id: this.generateCommandId(),
      timestamp: Date.now(),
    } as const;
  }

  // -------------------------------------------------------------------------
  // API Methods
  // -------------------------------------------------------------------------

  /** Retrieve host OS details (OS name, version, arch, hostname, system drive). */
  async getOSInfo(): Promise<OSInfoResponse> {
    const command: GetOSInfoCommand = this.baseCommand(CommandType.GET_OS_INFO);
    const response = await this.sendHttpCommand<OSInfoResponse>(command);
    return this.unwrap(response);
  }

  /** List available drives. Returns all mounts on Linux/macOS, lettered drives on Windows. */
  async listDrives(): Promise<DriveInfo[]> {
    const command: ListDrivesCommand = this.baseCommand(CommandType.LIST_DRIVES);
    const response = await this.sendHttpCommand<DrivesList>(command);
    return this.unwrap(response).drives;
  }

  /** List the contents of a directory. */
  async listDirectory(
    path: string,
    showHidden = false,
  ): Promise<DirectoryListing> {
    const command: ListDirectoryCommand = {
      ...this.baseCommand(CommandType.LIST_DIRECTORY),
      path,
      showHidden,
    };
    const response = await this.sendHttpCommand<DirectoryListing>(command);
    return this.unwrap(response);
  }

  /** Read a file's contents, optionally as base64. */
  async readFile(
    path: string,
    encoding: 'utf8' | 'base64' = 'utf8',
  ): Promise<FileContent> {
    const command: ReadFileCommand = {
      ...this.baseCommand(CommandType.READ_FILE),
      path,
      encoding,
    };
    const response = await this.sendHttpCommand<FileContent>(command);
    return this.unwrap(response);
  }

  /** Write content to a file. */
  async writeFile(
    path: string,
    content: string,
    encoding: 'utf8' | 'base64' = 'utf8',
  ): Promise<OperationResult> {
    const command: WriteFileCommand = {
      ...this.baseCommand(CommandType.WRITE_FILE),
      path,
      content,
      encoding,
    };
    const response = await this.sendHttpCommand<OperationResult>(command);
    return this.unwrap(response);
  }

  /** Delete a file or directory. Pass `recursive: true` for non-empty directories. */
  async deleteFile(path: string, recursive = false): Promise<OperationResult> {
    const command: DeleteFileCommand = {
      ...this.baseCommand(CommandType.DELETE_FILE),
      path,
      recursive,
    };
    const response = await this.sendHttpCommand<OperationResult>(command);
    return this.unwrap(response);
  }

  /** Create a directory, optionally creating all parent directories. */
  async createDirectory(path: string, recursive = true): Promise<OperationResult> {
    const command: CreateDirectoryCommand = {
      ...this.baseCommand(CommandType.CREATE_DIRECTORY),
      path,
      recursive,
    };
    const response = await this.sendHttpCommand<OperationResult>(command);
    return this.unwrap(response);
  }

  /** Move (rename) a file or directory. */
  async moveFile(source: string, destination: string): Promise<OperationResult> {
    const command: MoveFileCommand = {
      ...this.baseCommand(CommandType.MOVE_FILE),
      source,
      destination,
    };
    const response = await this.sendHttpCommand<OperationResult>(command);
    return this.unwrap(response);
  }

  /** Copy a file or directory. Pass `recursive: true` for directories. */
  async copyFile(
    source: string,
    destination: string,
    recursive = false,
  ): Promise<OperationResult> {
    const command: CopyFileCommand = {
      ...this.baseCommand(CommandType.COPY_FILE),
      source,
      destination,
      recursive,
    };
    const response = await this.sendHttpCommand<OperationResult>(command);
    return this.unwrap(response);
  }

  /** Retrieve metadata for a single file or directory. */
  async getFileInfo(path: string): Promise<FileInfo> {
    const command: GetFileInfoCommand = {
      ...this.baseCommand(CommandType.GET_FILE_INFO),
      path,
    };
    const response = await this.sendHttpCommand<FileInfo>(command);
    return this.unwrap(response);
  }

  /** Search for files matching a pattern within a directory. */
  async searchFiles(
    path: string,
    pattern: string,
    recursive = true,
  ): Promise<SearchResult> {
    const command: SearchFilesCommand = {
      ...this.baseCommand(CommandType.SEARCH_FILES),
      path,
      pattern,
      recursive,
    };
    const response = await this.sendHttpCommand<SearchResult>(command);
    return this.unwrap(response);
  }

  /** Ping the server health endpoint. */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}