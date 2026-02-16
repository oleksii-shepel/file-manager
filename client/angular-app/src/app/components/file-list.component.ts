import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileEntryComponent } from '../file-entry/file-entry.component';
import { FileInfo } from '@shared/protocol';

/**
 * File List Component
 * Displays a list of files and directories
 */
@Component({
  selector: 'app-file-list',
  standalone: true,
  imports: [CommonModule, FileEntryComponent],
  template: `
    <div class="pane-content">
      <div *ngIf="loading" class="loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
      
      <div *ngIf="error" class="error">
        {{ error }}
      </div>
      
      <div *ngIf="!loading && !error" class="file-list">
        <app-file-entry
          *ngFor="let entry of entries"
          [entry]="entry"
          [selected]="isSelected(entry)"
          (select)="onSelect($event)"
          (navigate)="onNavigate($event)">
        </app-file-entry>
      </div>
    </div>
  `,
  styles: [`
    .pane-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--vsc-padding-sm);
      background: var(--vsc-editor-background);
      min-height: 0;

      &::-webkit-scrollbar {
        width: 10px;
      }

      &::-webkit-scrollbar-track {
        background: var(--vsc-scrollbar-track);
      }

      &::-webkit-scrollbar-thumb {
        background: var(--vsc-scrollbar-thumb);
        border-radius: 5px;

        &:hover {
          background: var(--vsc-scrollbar-thumb-hover);
        }
      }
    }

    .loading,
    .error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: var(--vsc-padding-md);
      font-size: var(--vsc-font-size);
      color: var(--vsc-foreground-dim);

      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--vsc-border);
        border-top-color: var(--vsc-accent-blue);
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }

      p {
        margin: 0;
      }
    }

    .error {
      color: var(--vsc-error);
      font-weight: 500;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .file-list {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
  `]
})
export class FileListComponent {
  @Input() entries: FileInfo[] = [];
  @Input() selectedFiles: Set<string> = new Set();
  @Input() loading = false;
  @Input() error: string | null = null;
  
  @Output() selectionChange = new EventEmitter<FileInfo>();
  @Output() navigate = new EventEmitter<FileInfo>();

  isSelected(entry: FileInfo): boolean {
    return this.selectedFiles.has(entry.path);
  }

  onSelect(entry: FileInfo): void {
    this.selectionChange.emit(entry);
  }

  onNavigate(entry: FileInfo): void {
    this.navigate.emit(entry);
  }
}
