import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { FileInfo, FileType } from '@shared/protocol';

interface BrowserPane {
  currentPath: string;
  entries: FileInfo[];
  selectedFiles: Set<string>;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.scss']
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  leftPane: BrowserPane = this.createEmptyPane();
  rightPane: BrowserPane = this.createEmptyPane();
  showHidden = false;
  searchQuery = '';
  FileType = FileType; // For template access

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    // Initialize with user's home directory or root
    const homePath = this.getHomePath();
    this.loadDirectory(this.leftPane, homePath);
    this.loadDirectory(this.rightPane, homePath);

    // Check server connection
    this.checkServerConnection();
  }

  ngOnDestroy(): void {
    this.apiService.disconnectWebSocket();
  }

  private createEmptyPane(): BrowserPane {
    return {
      currentPath: '',
      entries: [],
      selectedFiles: new Set(),
      loading: false,
      error: null,
    };
  }

  private getHomePath(): string {
    // Try to get home directory based on platform
    if (typeof window !== 'undefined') {
      // For demo purposes, use root
      return '/';
    }
    return '/';
  }

  async checkServerConnection(): Promise<void> {
    const isHealthy = await this.apiService.checkHealth();
    if (!isHealthy) {
      console.error('Server is not responding. Make sure the server is running on localhost:3030');
      this.leftPane.error = 'Cannot connect to server';
      this.rightPane.error = 'Cannot connect to server';
    }
  }

  async loadDirectory(pane: BrowserPane, path: string): Promise<void> {
    pane.loading = true;
    pane.error = null;

    try {
      const listing = await this.apiService.listDirectory(path, this.showHidden);
      pane.currentPath = listing.path;
      pane.entries = listing.entries;
      pane.selectedFiles.clear();
    } catch (error: any) {
      pane.error = error.message || 'Failed to load directory';
      console.error('Failed to load directory:', error);
    } finally {
      pane.loading = false;
    }
  }

  async navigateToParent(pane: BrowserPane): Promise<void> {
    const parentPath = this.getParentPath(pane.currentPath);
    if (parentPath !== pane.currentPath) {
      await this.loadDirectory(pane, parentPath);
    }
  }

  async navigateToPath(pane: BrowserPane, entry: FileInfo): Promise<void> {
    if (entry.type === FileType.DIRECTORY) {
      await this.loadDirectory(pane, entry.path);
    }
  }

  private getParentPath(path: string): string {
    if (path === '/' || path === '') {
      return '/';
    }
    
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length === 0) {
      return '/';
    }
    
    parts.pop();
    return '/' + parts.join('/');
  }

  toggleSelection(pane: BrowserPane, entry: FileInfo): void {
    if (pane.selectedFiles.has(entry.path)) {
      pane.selectedFiles.delete(entry.path);
    } else {
      pane.selectedFiles.add(entry.path);
    }
  }

  isSelected(pane: BrowserPane, entry: FileInfo): boolean {
    return pane.selectedFiles.has(entry.path);
  }

  async refresh(pane: BrowserPane): Promise<void> {
    await this.loadDirectory(pane, pane.currentPath);
  }

  async deleteSelected(pane: BrowserPane): Promise<void> {
    if (pane.selectedFiles.size === 0) {
      return;
    }

    if (!confirm(`Delete ${pane.selectedFiles.size} item(s)?`)) {
      return;
    }

    for (const path of Array.from(pane.selectedFiles)) {
      try {
        await this.apiService.deleteFile(path, true);
      } catch (error: any) {
        console.error(`Failed to delete ${path}:`, error);
        alert(`Failed to delete ${path}: ${error.message}`);
      }
    }

    await this.refresh(pane);
  }

  async createNewFolder(pane: BrowserPane): Promise<void> {
    const folderName = prompt('Enter folder name:');
    if (!folderName) {
      return;
    }

    const newPath = `${pane.currentPath}/${folderName}`.replace('//', '/');

    try {
      await this.apiService.createDirectory(newPath, false);
      await this.refresh(pane);
    } catch (error: any) {
      alert(`Failed to create folder: ${error.message}`);
    }
  }

  async copyToOtherPane(sourcePane: BrowserPane, targetPane: BrowserPane): Promise<void> {
    if (sourcePane.selectedFiles.size === 0) {
      alert('No files selected');
      return;
    }

    for (const sourcePath of Array.from(sourcePane.selectedFiles)) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');

      try {
        await this.apiService.copyFile(sourcePath, destPath, true);
      } catch (error: any) {
        console.error(`Failed to copy ${sourcePath}:`, error);
        alert(`Failed to copy ${sourcePath}: ${error.message}`);
      }
    }

    await this.refresh(targetPane);
  }

  async moveToOtherPane(sourcePane: BrowserPane, targetPane: BrowserPane): Promise<void> {
    if (sourcePane.selectedFiles.size === 0) {
      alert('No files selected');
      return;
    }

    for (const sourcePath of Array.from(sourcePane.selectedFiles)) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');

      try {
        await this.apiService.moveFile(sourcePath, destPath);
      } catch (error: any) {
        console.error(`Failed to move ${sourcePath}:`, error);
        alert(`Failed to move ${sourcePath}: ${error.message}`);
      }
    }

    await this.refresh(sourcePane);
    await this.refresh(targetPane);
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  getFileIcon(entry: FileInfo): string {
    if (entry.type === FileType.DIRECTORY) {
      return '📁';
    } else if (entry.type === FileType.SYMLINK) {
      return '🔗';
    }
    
    // Simple file type icons based on extension
    const ext = entry.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt':
      case 'md':
        return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️';
      case 'pdf':
        return '📕';
      case 'zip':
      case 'tar':
      case 'gz':
        return '📦';
      case 'mp3':
      case 'wav':
        return '🎵';
      case 'mp4':
      case 'avi':
        return '🎬';
      default:
        return '📄';
    }
  }

  async toggleShowHidden(): Promise<void> {
    this.showHidden = !this.showHidden;
    await this.refresh(this.leftPane);
    await this.refresh(this.rightPane);
  }
}
