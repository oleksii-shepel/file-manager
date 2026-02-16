import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { PathHistoryService, PathHistoryEntry } from '../services/path-history.service';

@Component({
  selector: 'app-path-history-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="path-history-overlay" *ngIf="isVisible" (click)="hide()">
      <div class="path-history-modal" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <h2>📂 Path History</h2>
          <button class="btn-close" (click)="hide()" title="Close (Esc)">✕</button>
        </div>

        <!-- Stats -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">Total Paths:</span>
            <span class="stat-value">{{ historyEntries.length }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Most Visited:</span>
            <span class="stat-value">{{ getMostVisited()?.path || 'None' }}</span>
          </div>
          <button (click)="clearHistory()" class="btn-clear-history">
            🗑️ Clear All
          </button>
        </div>

        <!-- Search Filter -->
        <div class="search-bar">
          <input
            type="text"
            [(ngModel)]="filterText"
            (ngModelChange)="applyFilter()"
            placeholder="Filter paths..."
            class="filter-input"
          />
        </div>

        <!-- History List -->
        <div class="history-list">
          <div *ngIf="filteredEntries.length === 0" class="empty-state">
            <span class="empty-icon">📭</span>
            <p>No history entries found</p>
            <p class="empty-hint">Navigate to some folders to build history</p>
          </div>

          <div
            *ngFor="let entry of filteredEntries; let i = index"
            class="history-entry"
            [class.recent]="isRecent(entry)"
            (click)="selectPath(entry)"
          >
            <div class="entry-icon">📁</div>
            <div class="entry-info">
              <div class="entry-path">{{ entry.path }}</div>
              <div class="entry-meta">
                <span class="entry-pane">{{ entry.paneId }} pane</span>
                <span class="entry-count">{{ entry.accessCount }} visit{{ entry.accessCount > 1 ? 's' : '' }}</span>
                <span class="entry-time">{{ formatTime(entry.timestamp) }}</span>
              </div>
            </div>
            <button
              (click)="removePath(entry, $event)"
              class="btn-remove"
              title="Remove from history"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-info">
            Showing {{ filteredEntries.length }} of {{ historyEntries.length }} paths
          </div>
          <div class="footer-actions">
            <button (click)="exportHistory()" class="btn-secondary">
              💾 Export
            </button>
            <button (click)="hide()" class="btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .path-history-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .path-history-modal {
      background: #2d2d30;
      border: 1px solid #3e3e42;
      border-radius: 12px;
      width: 90%;
      max-width: 800px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
      from {
        transform: translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #3e3e42;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.5rem;
      color: #d4d4d4;
    }

    .btn-close {
      padding: 0.5rem;
      background: transparent;
      border: none;
      color: #858585;
      cursor: pointer;
      font-size: 1.5rem;
      transition: all 0.2s;
      border-radius: 4px;
    }

    .btn-close:hover {
      background: #3e3e42;
      color: #d4d4d4;
    }

    .stats-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      background: #252526;
      border-bottom: 1px solid #3e3e42;
      gap: 1rem;
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .stat-label {
      font-size: 0.85rem;
      color: #858585;
    }

    .stat-value {
      font-size: 0.9rem;
      color: #4ec9b0;
      font-weight: 600;
      font-family: 'Courier New', monospace;
    }

    .btn-clear-history {
      padding: 0.4rem 0.75rem;
      background: #d32f2f;
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }

    .btn-clear-history:hover {
      background: #b71c1c;
    }

    .search-bar {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #3e3e42;
    }

    .filter-input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #1e1e1e;
      border: 1px solid #3e3e42;
      border-radius: 6px;
      color: #d4d4d4;
      font-size: 0.95rem;
    }

    .filter-input:focus {
      outline: none;
      border-color: #007acc;
    }

    .filter-input::placeholder {
      color: #858585;
    }

    .history-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem 0;
    }

    .history-list::-webkit-scrollbar {
      width: 10px;
    }

    .history-list::-webkit-scrollbar-track {
      background: #1e1e1e;
    }

    .history-list::-webkit-scrollbar-thumb {
      background: #424242;
      border-radius: 5px;
    }

    .history-list::-webkit-scrollbar-thumb:hover {
      background: #4e4e4e;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      text-align: center;
      color: #858585;
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .empty-state p {
      margin: 0.5rem 0;
      font-size: 1rem;
      color: #d4d4d4;
    }

    .empty-hint {
      font-size: 0.9rem;
      color: #858585 !important;
    }

    .history-entry {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      cursor: pointer;
      transition: all 0.15s;
      position: relative;
    }

    .history-entry:hover {
      background: #252526;
    }

    .history-entry.recent {
      border-left: 3px solid #4caf50;
    }

    .entry-icon {
      font-size: 1.5rem;
      flex-shrink: 0;
    }

    .entry-info {
      flex: 1;
      min-width: 0;
    }

    .entry-path {
      font-size: 0.95rem;
      color: #d4d4d4;
      font-family: 'Courier New', monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 0.25rem;
    }

    .entry-meta {
      display: flex;
      gap: 1rem;
      font-size: 0.8rem;
      color: #858585;
    }

    .entry-pane {
      text-transform: capitalize;
    }

    .entry-count {
      color: #4ec9b0;
      font-weight: 600;
    }

    .btn-remove {
      padding: 0.25rem 0.5rem;
      background: transparent;
      border: none;
      color: #858585;
      cursor: pointer;
      font-size: 1rem;
      opacity: 0;
      transition: all 0.2s;
      border-radius: 4px;
    }

    .history-entry:hover .btn-remove {
      opacity: 1;
    }

    .btn-remove:hover {
      background: #d32f2f;
      color: white;
    }

    .modal-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 1.5rem;
      border-top: 1px solid #3e3e42;
      background: #252526;
    }

    .footer-info {
      font-size: 0.85rem;
      color: #858585;
    }

    .footer-actions {
      display: flex;
      gap: 0.75rem;
    }

    .btn-primary,
    .btn-secondary {
      padding: 0.5rem 1rem;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #007acc;
      color: white;
      border-color: #007acc;
    }

    .btn-primary:hover {
      background: #005a9e;
      border-color: #005a9e;
    }

    .btn-secondary {
      background: #3c3c3c;
      color: #d4d4d4;
    }

    .btn-secondary:hover {
      background: #505050;
    }
  `]
})
export class PathHistoryViewerComponent implements OnInit, OnDestroy {
  isVisible = false;
  historyEntries: PathHistoryEntry[] = [];
  filteredEntries: PathHistoryEntry[] = [];
  filterText = '';

  private destroy$ = new Subject<void>();

  constructor(private pathHistoryService: PathHistoryService) {}

  ngOnInit(): void {
    // Subscribe to history changes
    this.pathHistoryService.history$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        this.historyEntries = entries;
        this.applyFilter();
      });

    // Load initial history
    this.historyEntries = this.pathHistoryService.getAllHistory();
    this.applyFilter();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  show(): void {
    this.isVisible = true;
    this.filterText = '';
    this.historyEntries = this.pathHistoryService.getAllHistory();
    this.applyFilter();
  }

  hide(): void {
    this.isVisible = false;
  }

  applyFilter(): void {
    if (!this.filterText || this.filterText.trim() === '') {
      this.filteredEntries = [...this.historyEntries];
    } else {
      const filter = this.filterText.toLowerCase();
      this.filteredEntries = this.historyEntries.filter(entry =>
        entry.path.toLowerCase().includes(filter)
      );
    }
  }

  selectPath(entry: PathHistoryEntry): void {
    console.log('Selected path:', entry.path);
    // Emit event to navigate to this path
    // This would need to be wired up to the main component
  }

  removePath(entry: PathHistoryEntry, event: Event): void {
    event.stopPropagation();
    if (confirm(`Remove "${entry.path}" from history?`)) {
      this.pathHistoryService.removePath(entry.path);
    }
  }

  clearHistory(): void {
    if (confirm('Clear all path history?')) {
      this.pathHistoryService.clearHistory();
    }
  }

  getMostVisited(): PathHistoryEntry | null {
    if (this.historyEntries.length === 0) return null;
    return this.historyEntries.reduce((max, entry) =>
      entry.accessCount > max.accessCount ? entry : max
    );
  }

  isRecent(entry: PathHistoryEntry): boolean {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return entry.timestamp > oneHourAgo;
  }

  formatTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  exportHistory(): void {
    const data = JSON.stringify(this.historyEntries, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `path-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}