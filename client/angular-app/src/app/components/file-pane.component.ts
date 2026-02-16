import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabBarComponent } from '../tab-bar/tab-bar.component';
import { AddressBarAutocompleteComponent } from '../address-bar-autocomplete.component';
import { FilterBarComponent } from '../filter-bar/filter-bar.component';
import { ActionBarComponent } from '../action-bar/action-bar.component';
import { FileListComponent } from '../file-list/file-list.component';
import { FileInfo, FileType } from '@shared/protocol';
import { TabInfo, WorkspaceConfig, FilterQuery } from '@shared/protocol-enhanced';
import { ApiService } from '../../services/api.service';
import { WorkspaceService } from '../../services/workspace.service';
import { FilterService } from '../../services/filter.service';
import { PathHistoryService } from '../../services/path-history.service';

/**
 * File Pane Component
 * Complete reusable file browser pane
 * Combines tabs, address bar, filter, actions, and file list
 */
@Component({
  selector: 'app-file-pane',
  standalone: true,
  imports: [
    CommonModule,
    TabBarComponent,
    AddressBarAutocompleteComponent,
    FilterBarComponent,
    ActionBarComponent,
    FileListComponent
  ],
  template: `
    <div class="pane">
      <app-tab-bar
        [tabs]="tabs"
        [activeTabId]="currentTabId"
        (tabChange)="onTabChange($event)"
        (tabClose)="onTabClose($event)"
        (tabPin)="onTabPin($event)"
        (newTab)="onNewTab()">
      </app-tab-bar>

      <app-address-bar-autocomplete
        [initialPath]="currentPath"
        [paneId]="paneId"
        (pathChange)="onPathChange($event)"
        (navigateUpClicked)="onNavigateUp()"
        (refreshClicked)="onRefresh()">
      </app-address-bar-autocomplete>

      <app-filter-bar
        [filterText]="filterText"
        [totalCount]="entries.length"
        [filteredCount]="filteredEntries.length"
        (filterChange)="onFilterChange($event)"
        (clear)="onClearFilter()">
      </app-filter-bar>

      <app-action-bar
        [selectedCount]="selectedFiles.size"
        [panePosition]="paneId"
        (createFolder)="onCreateFolder()"
        (deleteSelected)="onDeleteSelected()"
        (copyToOther)="onCopyToOther()"
        (moveToOther)="onMoveToOther()">
      </app-action-bar>

      <app-file-list
        [entries]="filteredEntries"
        [selectedFiles]="selectedFiles"
        [loading]="loading"
        [error]="error"
        (selectionChange)="onSelectionChange($event)"
        (navigate)="onNavigate($event)">
      </app-file-list>
    </div>
  `,
  styles: [`
    .pane {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: var(--vsc-editor-background);
      overflow: hidden;
      min-height: 0;
      min-width: 0;
    }
  `]
})
export class FilePaneComponent implements OnInit {
  @Input() paneId: 'left' | 'right' = 'left';
  @Input() workspace: WorkspaceConfig | null = null;
  @Input() showHidden = false;
  
  @Output() pathChange = new EventEmitter<string>();
  @Output() copyToOther = new EventEmitter<string[]>();
  @Output() moveToOther = new EventEmitter<string[]>();

  // State
  currentPath = '';
  currentTabId = '';
  tabs: TabInfo[] = [];
  entries: FileInfo[] = [];
  filteredEntries: FileInfo[] = [];
  selectedFiles: Set<string> = new Set();
  loading = false;
  error: string | null = null;
  filterText = '';
  filterQuery: FilterQuery = { text: '', criteria: [] };

  constructor(
    private apiService: ApiService,
    private workspaceService: WorkspaceService,
    private filterService: FilterService,
    private pathHistoryService: PathHistoryService
  ) {}

  ngOnInit(): void {
    this.loadPaneState();
  }

  ngOnChanges(): void {
    if (this.workspace) {
      this.loadPaneState();
    }
  }

  private loadPaneState(): void {
    if (!this.workspace) return;

    this.tabs = this.workspaceService.getTabs(this.paneId);
    const activeTab = this.workspaceService.getActiveTab(this.paneId);
    
    if (activeTab) {
      this.currentTabId = activeTab.id;
      this.currentPath = activeTab.path;
      this.loadDirectory(activeTab.path);
    }
  }

  private async loadDirectory(path: string): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      const listing = await this.apiService.listDirectory(path, this.showHidden);
      this.currentPath = listing.path;
      this.entries = listing.entries;
      this.selectedFiles.clear();
      
      this.applyFilter();
      this.workspaceService.updateTabPath(this.paneId, this.currentTabId, path);
      this.pathHistoryService.addPath(path, this.paneId);
      this.pathChange.emit(path);
    } catch (error: any) {
      this.error = error.message || 'Failed to load directory';
      console.error('Failed to load directory:', error);
    } finally {
      this.loading = false;
    }
  }

  // Tab management
  onTabChange(tab: TabInfo): void {
    this.workspaceService.switchTab(this.paneId, tab.id);
    this.currentTabId = tab.id;
    this.currentPath = tab.path;
    this.loadDirectory(tab.path);
  }

  onTabClose(tab: TabInfo): void {
    this.workspaceService.closeTab(this.paneId, tab.id);
    this.loadPaneState();
  }

  onTabPin(tab: TabInfo): void {
    this.workspaceService.toggleTabPin(this.paneId, tab.id);
    this.loadPaneState();
  }

  onNewTab(): void {
    const newTab = this.workspaceService.addTab(this.paneId, this.currentPath, true);
    if (newTab) {
      this.loadPaneState();
    }
  }

  // Navigation
  onPathChange(path: string): void {
    if (path && path !== this.currentPath) {
      this.loadDirectory(path);
    }
  }

  onNavigateUp(): void {
    const parentPath = this.getParentPath(this.currentPath);
    if (parentPath !== this.currentPath) {
      this.loadDirectory(parentPath);
    }
  }

  onRefresh(): void {
    this.loadDirectory(this.currentPath);
  }

  onNavigate(entry: FileInfo): void {
    if (entry.type === FileType.DIRECTORY) {
      this.loadDirectory(entry.path);
    }
  }

  private getParentPath(path: string): string {
    if (path === '/' || path === '') return '/';
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length === 0) return '/';
    parts.pop();
    return '/' + parts.join('/');
  }

  // Filtering
  onFilterChange(text: string): void {
    this.filterText = text;
    this.filterQuery = this.filterService.parseFilterText(text);
    this.applyFilter();
  }

  onClearFilter(): void {
    this.filterText = '';
    this.filterQuery = { text: '', criteria: [] };
    this.applyFilter();
  }

  private applyFilter(): void {
    if (!this.filterText || this.filterText.trim() === '') {
      this.filteredEntries = this.entries;
    } else {
      this.filteredEntries = this.filterService.filterEntries(this.entries, this.filterQuery);
    }
  }

  // Selection
  onSelectionChange(entry: FileInfo): void {
    if (this.selectedFiles.has(entry.path)) {
      this.selectedFiles.delete(entry.path);
    } else {
      this.selectedFiles.add(entry.path);
    }
    this.selectedFiles = new Set(this.selectedFiles); // Trigger change detection
  }

  // File operations
  async onCreateFolder(): Promise<void> {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    const newPath = `${this.currentPath}/${folderName}`.replace('//', '/');

    try {
      await this.apiService.createDirectory(newPath, false);
      await this.loadDirectory(this.currentPath);
    } catch (error: any) {
      alert(`Failed to create folder: ${error.message}`);
    }
  }

  async onDeleteSelected(): Promise<void> {
    if (this.selectedFiles.size === 0) return;

    if (!confirm(`Delete ${this.selectedFiles.size} item(s)?`)) {
      return;
    }

    for (const path of Array.from(this.selectedFiles)) {
      try {
        await this.apiService.deleteFile(path, true);
      } catch (error: any) {
        console.error(`Failed to delete ${path}:`, error);
        alert(`Failed to delete ${path}: ${error.message}`);
      }
    }

    await this.loadDirectory(this.currentPath);
  }

  onCopyToOther(): void {
    if (this.selectedFiles.size > 0) {
      this.copyToOther.emit(Array.from(this.selectedFiles));
    }
  }

  onMoveToOther(): void {
    if (this.selectedFiles.size > 0) {
      this.moveToOther.emit(Array.from(this.selectedFiles));
    }
  }
}
