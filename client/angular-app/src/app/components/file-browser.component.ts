import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

import { ApiService } from '../services/api.service';
import { WorkspaceService } from '../services/workspace.service';
import { FilterService } from '../services/filter.service';
import { FileInfo, FileType } from '@shared/protocol';
import { WorkspaceConfig, TabInfo, FilterQuery } from '@shared/protocol-enhanced';
import { KeyboardHelpComponent } from './keyboard-help.component';
import { KeyboardService } from '../services/keyboard.service';
import { ShortcutCallbacks, ShortcutRegistryService } from '../services/shortcut-registry.service';
// PHASE 2 IMPORTS - NEW
import { GlobalSearchComponent } from './global-search.component';
import { PathHistoryService } from '../services/path-history.service';
import { PathHistoryViewerComponent } from './path-history-viewer.component';

interface BrowserPane {
  id: string;
  currentPath: string;
  currentTabId: string;
  entries: FileInfo[];
  filteredEntries: FileInfo[];
  selectedFiles: Set<string>;
  loading: boolean;
  error: string | null;
  filterText: string;
  filterQuery: FilterQuery;
}

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    KeyboardHelpComponent,
    GlobalSearchComponent,
    PathHistoryViewerComponent
  ],
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.scss']
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  @ViewChild(KeyboardHelpComponent) keyboardHelp?: KeyboardHelpComponent;
  @ViewChild(GlobalSearchComponent) globalSearch?: GlobalSearchComponent;
  @ViewChild(PathHistoryViewerComponent) pathHistoryViewer?: PathHistoryViewerComponent;

  leftPane: BrowserPane = this.createEmptyPane('left');
  rightPane: BrowserPane = this.createEmptyPane('right');
  
  activeWorkspace: WorkspaceConfig | null = null;
  workspaceList: WorkspaceConfig[] = [];
  showWorkspaceMenu = false;
  showHidden = false;
  
  FileType = FileType;
  
  private destroy$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private workspaceService: WorkspaceService,
    private filterService: FilterService,
    private keyboardService: KeyboardService,
    private shortcutRegistry: ShortcutRegistryService,
    private pathHistoryService: PathHistoryService // PHASE 2: Added PathHistoryService
  ) {}

  ngOnInit(): void {
    // Subscribe to workspace changes
    this.workspaceService.activeWorkspace$
      .pipe(takeUntil(this.destroy$))
      .subscribe(workspace => {
        this.activeWorkspace = workspace;
        if (workspace) {
          this.loadWorkspaceState(workspace);
        }
      });

    this.workspaceService.workspaces$
      .pipe(takeUntil(this.destroy$))
      .subscribe(workspaces => {
        this.workspaceList = workspaces.workspaces;
      });

    // Check server connection
    this.checkServerConnection();

    // Register keyboard shortcuts
    this.registerKeyboardShortcuts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.apiService.disconnectWebSocket();
  }

  // ============================================================================
  // Workspace Management
  // ============================================================================

  loadWorkspaceState(workspace: WorkspaceConfig): void {
    this.showHidden = workspace.showHidden;

    // Load left pane
    const leftActiveTab = this.workspaceService.getActiveTab('left');
    if (leftActiveTab) {
      this.leftPane.currentPath = leftActiveTab.path;
      this.leftPane.currentTabId = leftActiveTab.id;
      this.loadDirectory(this.leftPane, leftActiveTab.path);
    }

    // Load right pane
    const rightActiveTab = this.workspaceService.getActiveTab('right');
    if (rightActiveTab) {
      this.rightPane.currentPath = rightActiveTab.path;
      this.rightPane.currentTabId = rightActiveTab.id;
      this.loadDirectory(this.rightPane, rightActiveTab.path);
    }
  }

  createNewWorkspace(): void {
    const name = prompt('Enter workspace name:');
    if (!name) return;

    const workspace = this.workspaceService.createWorkspace(name);
    this.workspaceService.switchWorkspace(workspace.id);
    this.showWorkspaceMenu = false;
  }

  switchWorkspace(workspaceId: string): void {
    this.workspaceService.switchWorkspace(workspaceId);
    this.showWorkspaceMenu = false;
  }

  toggleWorkspaceMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showWorkspaceMenu = !this.showWorkspaceMenu;
  }

  closeWorkspaceMenu(): void {
    this.showWorkspaceMenu = false;
  }

  deleteCurrentWorkspace(): void {
    if (!this.activeWorkspace) return;
    
    if (!confirm(`Delete workspace "${this.activeWorkspace.name}"?`)) {
      return;
    }

    this.workspaceService.deleteWorkspace(this.activeWorkspace.id);
  }

  renameCurrentWorkspace(): void {
    if (!this.activeWorkspace) return;

    const name = prompt('Enter new workspace name:', this.activeWorkspace.name);
    if (!name) return;

    this.workspaceService.updateWorkspace(this.activeWorkspace.id, { name });
  }

  // ============================================================================
  // Tab Management
  // ============================================================================

  getTabs(paneId: string): TabInfo[] {
    return this.workspaceService.getTabs(paneId);
  }

  addTab(pane: BrowserPane): void {
    const newTab = this.workspaceService.addTab(pane.id, pane.currentPath, true);
    if (newTab) {
      pane.currentTabId = newTab.id;
      this.loadDirectory(pane, newTab.path);
    }
  }

  closeTab(pane: BrowserPane, tabId: string): void {
    const tabs = this.getTabs(pane.id);
    if (tabs.length <= 1) {
      alert('Cannot close the last tab');
      return;
    }

    this.workspaceService.closeTab(pane.id, tabId);
    
    // Load the new active tab
    const activeTab = this.workspaceService.getActiveTab(pane.id);
    if (activeTab) {
      pane.currentTabId = activeTab.id;
      pane.currentPath = activeTab.path;
      this.loadDirectory(pane, activeTab.path);
    }
  }

  switchTab(pane: BrowserPane, tabId: string): void {
    this.workspaceService.switchTab(pane.id, tabId);
    
    const tab = this.getTabs(pane.id).find(t => t.id === tabId);
    if (tab) {
      pane.currentTabId = tabId;
      pane.currentPath = tab.path;
      this.loadDirectory(pane, tab.path);
    }
  }

  toggleTabPin(pane: BrowserPane, tabId: string, event: Event): void {
    event.stopPropagation();
    this.workspaceService.toggleTabPin(pane.id, tabId);
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  private createEmptyPane(id: string): BrowserPane {
    return {
      id,
      currentPath: '',
      currentTabId: '',
      entries: [],
      filteredEntries: [],
      selectedFiles: new Set(),
      loading: false,
      error: null,
      filterText: '',
      filterQuery: { text: '', criteria: [] },
    };
  }

  async checkServerConnection(): Promise<void> {
    const isHealthy = await this.apiService.checkHealth();
    if (!isHealthy) {
      console.error('Server is not responding');
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
      
      // Apply current filter
      this.applyFilter(pane);

      // Update tab path (now uses silent mode to prevent reload loop)
      this.workspaceService.updateTabPath(pane.id, pane.currentTabId, path);
      
      // PHASE 2: Track in path history
      this.pathHistoryService.addPath(path, pane.id);
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

  async navigateFromAddressBar(pane: BrowserPane, path: string): Promise<void> {
    if (path && path !== pane.currentPath) {
      await this.loadDirectory(pane, path);
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

  // ============================================================================
  // Filter System
  // ============================================================================

  onFilterChange(pane: BrowserPane): void {
    pane.filterQuery = this.filterService.parseFilterText(pane.filterText);
    this.applyFilter(pane);
  }

  clearFilter(pane: BrowserPane): void {
    pane.filterText = '';
    pane.filterQuery = { text: '', criteria: [] };
    this.applyFilter(pane);
  }

  private applyFilter(pane: BrowserPane): void {
    if (!pane.filterText || pane.filterText.trim() === '') {
      pane.filteredEntries = pane.entries;
    } else {
      pane.filteredEntries = this.filterService.filterEntries(pane.entries, pane.filterQuery);
    }
  }

  // ============================================================================
  // Selection and Actions
  // ============================================================================

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
    if (pane.selectedFiles.size === 0) return;

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
    if (!folderName) return;

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

  // ============================================================================
  // Display Helpers
  // ============================================================================

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
    
    // Update workspace
    if (this.activeWorkspace) {
      this.workspaceService.updateWorkspace(this.activeWorkspace.id, {
        showHidden: this.showHidden
      });
    }

    await this.refresh(this.leftPane);
    await this.refresh(this.rightPane);
  }

  /**
   * Register all keyboard shortcuts
   */
  private registerKeyboardShortcuts(): void {
    const callbacks: ShortcutCallbacks = {
      // Navigation
      openGlobalSearch: () => this.openGlobalSearch(),
      showPathHistory: () => this.showPathHistory(),
      quickPathJump: () => this.quickPathJump(),
      navigateUp: () => this.navigateUpCurrent(),
      refresh: () => this.refreshCurrent(),
      showKeyboardHelp: () => this.keyboardHelp?.show(),

      // Tabs
      newTab: () => this.addTabCurrent(),
      closeTab: () => this.closeTabCurrent(),
      nextTab: () => this.nextTabCurrent(),
      previousTab: () => this.previousTabCurrent(),
      jumpToTab: (index) => this.jumpToTabCurrent(index),
      togglePinTab: () => this.togglePinCurrentTab(),

      // File operations
      quickView: () => this.quickViewSelected(),
      openItem: () => this.openSelectedItem(),
      deleteSelected: () => this.deleteSelectedCurrent(),
      copySelected: () => this.copySelectedToClipboard(),
      cutSelected: () => this.cutSelectedToClipboard(),
      paste: () => this.pasteFromClipboard(),
      selectAll: () => this.selectAllCurrent(),
      deselectAll: () => this.deselectAllCurrent(),
      newFolder: () => this.createNewFolderCurrent(),
      renameSelected: () => this.renameSelectedCurrent(),

      // Search
      focusFilter: () => this.focusFilterCurrent(),
      advancedFilter: () => this.showAdvancedFilter(),
      clearFilter: () => this.clearFilterCurrent(),

      // Workspace
      showWorkspaceSwitcher: () => this.toggleWorkspaceMenu(),
      newWorkspace: () => this.createNewWorkspace(),
      toggleHiddenFiles: () => this.toggleShowHidden(),

      // Pane
      switchPane: () => this.switchActivePaneInternal(),
      copyToOtherPane: () => this.copyToOtherPaneCurrent(),
      moveToOtherPane: () => this.moveToOtherPaneCurrent(),
      focusAddressBar: () => this.focusAddressBarCurrent(),
    };

    this.shortcutRegistry.registerAllShortcuts(callbacks);
  }

  // ============================================================================
  // Keyboard Shortcut Implementations
  // ============================================================================

  private activePaneId: 'left' | 'right' = 'left';

  private getActivePane() {
    return this.activePaneId === 'left' ? this.leftPane : this.rightPane;
  }

  private switchActivePaneInternal(): void {
    this.activePaneId = this.activePaneId === 'left' ? 'right' : 'left';
    // Add visual feedback (optional)
    console.log('Active pane:', this.activePaneId);
  }

  // Navigation shortcuts
  private openGlobalSearch(): void {
    // PHASE 2: Updated to show global search modal
    this.globalSearch?.show();
  }

  // PHASE 2: Added handler for global search results
  onGlobalSearchResult(result: any): void {
    const pane = this.getActivePane();
    
    if (result.file.type === FileType.DIRECTORY) {
      this.loadDirectory(pane, result.file.path);
    } else {
      // Navigate to parent directory and select file
      const parentPath = this.getParentPath(result.file.path);
      this.loadDirectory(pane, parentPath).then(() => {
        pane.selectedFiles.clear();
        pane.selectedFiles.add(result.file.path);
      });
    }
  }

  private showPathHistory(): void {
    this.pathHistoryViewer?.show();
  }

  private quickPathJump(): void {
    // TODO: Implement quick path jump (Phase 2)
    console.log('Quick path jump - coming in Phase 2');
  }

  private navigateUpCurrent(): void {
    const pane = this.getActivePane();
    this.navigateToParent(pane);
  }

  private refreshCurrent(): void {
    const pane = this.getActivePane();
    this.refresh(pane);
  }

  // Tab shortcuts
  private addTabCurrent(): void {
    const pane = this.getActivePane();
    this.addTab(pane);
  }

  private closeTabCurrent(): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    const activeTab = tabs.find(t => t.isActive);
    if (activeTab) {
      this.closeTab(pane, activeTab.id);
    }
  }

  private nextTabCurrent(): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    const currentIndex = tabs.findIndex(t => t.isActive);
    const nextIndex = (currentIndex + 1) % tabs.length;
    this.switchTab(pane, tabs[nextIndex].id);
  }

  private previousTabCurrent(): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    const currentIndex = tabs.findIndex(t => t.isActive);
    const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
    this.switchTab(pane, tabs[prevIndex].id);
  }

  private jumpToTabCurrent(index: number): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    if (index > 0 && index <= tabs.length) {
      this.switchTab(pane, tabs[index - 1].id);
    }
  }

  private togglePinCurrentTab(): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    const activeTab = tabs.find(t => t.isActive);
    if (activeTab) {
      this.toggleTabPin(pane, activeTab.id, new Event('click'));
    }
  }

  // File operation shortcuts
  private quickViewSelected(): void {
    // TODO: Implement quick view (Phase 3)
    console.log('Quick view - coming in Phase 3');
  }

  private openSelectedItem(): void {
    const pane = this.getActivePane();
    const selected = Array.from(pane.selectedFiles);
    if (selected.length === 1) {
      const entry = pane.entries.find(e => e.path === selected[0]);
      if (entry) {
        this.navigateToPath(pane, entry);
      }
    }
  }

  private deleteSelectedCurrent(): void {
    const pane = this.getActivePane();
    this.deleteSelected(pane);
  }

  private clipboard: { operation: 'copy' | 'cut', paths: string[] } | null = null;

  private copySelectedToClipboard(): void {
    const pane = this.getActivePane();
    if (pane.selectedFiles.size > 0) {
      this.clipboard = {
        operation: 'copy',
        paths: Array.from(pane.selectedFiles),
      };
      console.log('Copied to clipboard:', this.clipboard.paths.length, 'items');
    }
  }

  private cutSelectedToClipboard(): void {
    const pane = this.getActivePane();
    if (pane.selectedFiles.size > 0) {
      this.clipboard = {
        operation: 'cut',
        paths: Array.from(pane.selectedFiles),
      };
      console.log('Cut to clipboard:', this.clipboard.paths.length, 'items');
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    if (!this.clipboard) {
      console.log('Clipboard is empty');
      return;
    }

    const targetPane = this.getActivePane();
    const operation = this.clipboard.operation;

    for (const sourcePath of this.clipboard.paths) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');

      try {
        if (operation === 'copy') {
          await this.apiService.copyFile(sourcePath, destPath, true);
        } else {
          await this.apiService.moveFile(sourcePath, destPath);
        }
      } catch (error: any) {
        console.error(`Failed to ${operation} ${sourcePath}:`, error);
        alert(`Failed to ${operation}: ${error.message}`);
      }
    }

    if (operation === 'cut') {
      this.clipboard = null; // Clear after cut+paste
    }

    await this.refresh(targetPane);
  }

  private selectAllCurrent(): void {
    const pane = this.getActivePane();
    pane.selectedFiles.clear();
    pane.filteredEntries.forEach(entry => {
      pane.selectedFiles.add(entry.path);
    });
  }

  private deselectAllCurrent(): void {
    const pane = this.getActivePane();
    pane.selectedFiles.clear();
  }

  private createNewFolderCurrent(): void {
    const pane = this.getActivePane();
    this.createNewFolder(pane);
  }

  private renameSelectedCurrent(): void {
    // TODO: Implement rename functionality
    console.log('Rename - to be implemented');
  }

  // Search shortcuts
  private focusFilterCurrent(): void {
    const pane = this.getActivePane();
    const filterInput = document.querySelector(
      `.pane:nth-child(${this.activePaneId === 'left' ? 1 : 2}) .filter-input`
    ) as HTMLInputElement;
    filterInput?.focus();
  }

  private showAdvancedFilter(): void {
    // TODO: Implement advanced filter dialog
    console.log('Advanced filter - to be implemented');
  }

  private clearFilterCurrent(): void {
    const pane = this.getActivePane();
    this.clearFilter(pane);
  }

  // Pane shortcuts
  private copyToOtherPaneCurrent(): void {
    const sourcePane = this.getActivePane();
    const targetPane = this.activePaneId === 'left' ? this.rightPane : this.leftPane;
    this.copyToOtherPane(sourcePane, targetPane);
  }

  private moveToOtherPaneCurrent(): void {
    const sourcePane = this.getActivePane();
    const targetPane = this.activePaneId === 'left' ? this.rightPane : this.leftPane;
    this.moveToOtherPane(sourcePane, targetPane);
  }

  private focusAddressBarCurrent(): void {
    const addressInput = document.querySelector(
      `.pane:nth-child(${this.activePaneId === 'left' ? 1 : 2}) .address-input`
    ) as HTMLInputElement;
    addressInput?.focus();
    addressInput?.select();
  }
}
