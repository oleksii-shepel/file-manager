import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileInfo, FileType } from '@shared/protocol';

/**
 * File Entry Component
 * Displays a single file or directory entry
 */
@Component({
  selector: 'app-file-entry',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="file-entry"
      [class.selected]="selected"
      [class.directory]="entry.type === FileType.DIRECTORY"
      (click)="onClick()"
      (dblclick)="onDoubleClick()">
      
      <span class="file-icon">{{ getIcon() }}</span>
      
      <div class="file-info">
        <div class="file-name">{{ entry.name }}</div>
        <div class="file-details">
          <span class="file-size">{{ formatSize(entry.size) }}</span>
          <span class="file-date">{{ formatDate(entry.modified) }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .file-entry {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-md);
      padding: var(--vsc-padding-sm) var(--vsc-padding-md);
      border-radius: var(--vsc-border-radius-sm);
      cursor: pointer;
      transition: all var(--vsc-transition-fast);
      user-select: none;
      min-height: 28px;
      border-left: 3px solid transparent;

      &:hover {
        background: var(--vsc-list-hover-background);
        border-left-color: var(--vsc-border-bright);
      }

      &.selected {
        background: var(--vsc-list-active-background);
        color: var(--vsc-foreground-bright);
        border-left-color: var(--vsc-accent-blue);

        &:hover {
          background: var(--vsc-list-focus-background);
        }

        .file-name {
          font-weight: 500;
        }
      }

      &.directory {
        .file-name {
          font-weight: 500;
        }

        .file-icon {
          opacity: 1;
        }
      }

      .file-icon {
        font-size: 16px;
        flex-shrink: 0;
        line-height: 1;
        opacity: 0.9;
      }

      .file-info {
        flex: 1;
        min-width: 0;
      }

      .file-name {
        font-size: var(--vsc-font-size);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.4;
      }

      .file-details {
        display: flex;
        gap: var(--vsc-padding-lg);
        font-size: var(--vsc-font-size-small);
        color: var(--vsc-foreground-dim);
        margin-top: 2px;

        .file-size,
        .file-date {
          white-space: nowrap;
        }
      }
    }

    :host-context(.compact-mode) .file-entry {
      min-height: 24px;
      padding: var(--vsc-padding-xs) var(--vsc-padding-sm);
      gap: var(--vsc-padding-sm);

      .file-icon {
        font-size: 14px;
      }

      .file-name {
        font-size: var(--vsc-font-size-small);
      }
    }
  `]
})
export class FileEntryComponent {
  @Input() entry!: FileInfo;
  @Input() selected = false;
  
  @Output() select = new EventEmitter<FileInfo>();
  @Output() navigate = new EventEmitter<FileInfo>();

  FileType = FileType;

  onClick(): void {
    this.select.emit(this.entry);
  }

  onDoubleClick(): void {
    this.navigate.emit(this.entry);
  }

  getIcon(): string {
    if (this.entry.type === FileType.DIRECTORY) {
      return '📁';
    } else if (this.entry.type === FileType.SYMLINK) {
      return '🔗';
    }
    
    const ext = this.entry.name.split('.').pop()?.toLowerCase();
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
      case 'js':
      case 'ts':
        return '📝';
      default:
        return '📄';
    }
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
}
