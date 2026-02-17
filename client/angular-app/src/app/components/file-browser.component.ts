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
import { GlobalSearchComponent } from './global-search.component';
import { PathHistoryService } from '../services/path-history.service';
import { ThemeService } from '../services/theme.service';
import { PathHistoryViewerComponent } from './path-history-viewer.component';
import { AddressBarComponent } from './address-bar.component';
import { ActiveFilterState, FilterBarComponent, FilterPreset } from './filter-bar.component';

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
  activeFilterState: ActiveFilterState | null;
}

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    KeyboardHelpComponent,
    GlobalSearchComponent,
    PathHistoryViewerComponent,
    AddressBarComponent,
    FilterBarComponent
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
    private shortcutRegistry: ShortcutRegistryService,
    private pathHistoryService: PathHistoryService,
    public theme: ThemeService
  ) {}

  ngOnInit(): void {
    this.workspaceService.activeWorkspace$
      .pipe(takeUntil(this.destroy$))
      .subscribe(workspace => {
        this.activeWorkspace = workspace;
        if (workspace) this.loadWorkspaceState(workspace);
      });

    this.workspaceService.workspaces$
      .pipe(takeUntil(this.destroy$))
      .subscribe(workspaces => { this.workspaceList = workspaces.workspaces; });

    this.checkServerConnection();
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

    const leftActiveTab = this.workspaceService.getActiveTab('left');
    if (leftActiveTab) {
      this.leftPane.currentPath = leftActiveTab.path;
      this.leftPane.currentTabId = leftActiveTab.id;
      this.loadDirectory(this.leftPane, leftActiveTab.path);
    }

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
    if (event) event.stopPropagation();
    this.showWorkspaceMenu = !this.showWorkspaceMenu;
  }

  closeWorkspaceMenu(): void { this.showWorkspaceMenu = false; }

  deleteCurrentWorkspace(): void {
    if (!this.activeWorkspace) return;
    if (!confirm(`Delete workspace "${this.activeWorkspace.name}"?`)) return;
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
    const success = this.workspaceService.closeTab(pane.id, tabId);
    if (!success) { alert('Failed to close tab'); return; }
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
      activeFilterState: null,
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
      this.applyFilter(pane);
      this.workspaceService.updateTabPath(pane.id, pane.currentTabId, path);
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
    if (parentPath !== pane.currentPath) await this.loadDirectory(pane, parentPath);
  }

  async navigateToPath(pane: BrowserPane, entry: FileInfo): Promise<void> {
    if (entry.type === FileType.DIRECTORY) await this.loadDirectory(pane, entry.path);
  }

  async navigateFromAddressBar(pane: BrowserPane, path: string): Promise<void> {
    if (path && path !== pane.currentPath) await this.loadDirectory(pane, path);
  }

  private getParentPath(path: string): string {
    if (path === '/' || path === '') return '/';
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length === 0) return '/';
    parts.pop();
    return '/' + parts.join('/');
  }

  // ============================================================================
  // Filter System - FIXED LOGIC
  // ============================================================================

  /** Handle filter changes from the filter bar component */
  onPresetFilterChange(pane: BrowserPane, state: ActiveFilterState): void {
    pane.activeFilterState = state;
    this.applyFilter(pane);
  }

  /** Handle filter clear from the filter bar component */
  onPresetFilterClear(pane: BrowserPane): void {
    pane.activeFilterState = null;
    this.applyFilter(pane);
  }

  /** Handle text filter input changes */
  onFilterChange(pane: BrowserPane): void {
    pane.filterQuery = this.filterService.parseFilterText(pane.filterText);
    this.applyFilter(pane);
  }

  /** Clear all filters (both preset and text) */
  clearFilter(pane: BrowserPane): void {
    pane.filterText = '';
    pane.filterQuery = { text: '', criteria: [] };
    pane.activeFilterState = null;
    this.applyFilter(pane);
  }

  /** Apply both preset filters and text filter to the entries */
  private applyFilter(pane: BrowserPane): void {
    let entries = pane.entries;

    // Step 1 — Apply preset filters if any are active
    if (pane.activeFilterState && pane.activeFilterState.presets.length > 0) {
      const { presets, combined } = pane.activeFilterState;
      
      // Determine if we're in OR mode by checking the combined string
      // The filter bar component uses ' OR ' for OR mode and space for AND mode
      const isOrMode = combined.includes(' OR ');
      
      if (isOrMode) {
        // OR mode: entry matches if it matches ANY selected preset
        entries = entries.filter(entry => 
          presets.some(preset => this.matchesPreset(entry, preset))
        );
      } else {
        // AND mode: entry matches if it matches ALL selected presets
        entries = entries.filter(entry => 
          presets.every(preset => this.matchesPreset(entry, preset))
        );
      }
    }

    // Step 2 — Apply text filter on top of preset filters
    if (pane.filterText && pane.filterText.trim() !== '') {
      // Ensure filter query is up to date
      if (!pane.filterQuery || pane.filterQuery.text !== pane.filterText) {
        pane.filterQuery = this.filterService.parseFilterText(pane.filterText);
      }
      entries = this.filterService.filterEntries(entries, pane.filterQuery);
    }

    pane.filteredEntries = entries;
  }

  /** Match one entry against one preset's filter string */
  private matchesPreset(entry: FileInfo, preset: FilterPreset): boolean {
    const filter = preset.filter;
    if (!filter || filter.trim() === '') return true; // Empty filter (like "All Files") always matches

    // Split into tokens - within a single preset, tokens are OR'd
    // e.g. "ext:jpg ext:png ext:gif" → matches any of those extensions
    const tokens = filter.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    return tokens.some(token => {
      if (token === 'type:dir') {
        return entry.type === FileType.DIRECTORY;
      }
      
      if (token === 'type:file') {
        return entry.type !== FileType.DIRECTORY;
      }

      if (token.startsWith('ext:')) {
        const ext = token.slice(4).toLowerCase();
        const fileExt = entry.name.split('.').pop()?.toLowerCase() ?? '';
        return fileExt === ext;
      }

      if (token.startsWith('size>')) {
        const bytes = this.parseSize(token.slice(5));
        return bytes !== null && (entry.size ?? 0) > bytes;
      }

      if (token.startsWith('size<')) {
        const bytes = this.parseSize(token.slice(5));
        return bytes !== null && (entry.size ?? 0) < bytes;
      }

      if (token.startsWith('modified:')) {
        return this.matchesModified(entry, token.slice(9));
      }

      return false;
    });
  }

  private parseSize(raw: string): number | null {
    const match = raw.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/);
    if (!match) return null;
    const multipliers: Record<string, number> = { 
      b: 1, 
      kb: 1024, 
      mb: 1024 ** 2, 
      gb: 1024 ** 3 
    };
    return parseFloat(match[1]) * (multipliers[match[2] ?? 'b'] ?? 1);
  }

  private matchesModified(entry: FileInfo, period: string): boolean {
    const diff = Date.now() - (entry.modified ?? 0) * 1000;
    const day = 86_400_000; // milliseconds in a day
    if (period === 'today') return diff < day;
    if (period === 'week')  return diff < day * 7;
    if (period === 'month') return diff < day * 30;
    return false;
  }

  // ============================================================================
  // Selection and Actions
  // ============================================================================

  toggleSelection(pane: BrowserPane, entry: FileInfo): void {
    if (pane.selectedFiles.has(entry.path)) pane.selectedFiles.delete(entry.path);
    else pane.selectedFiles.add(entry.path);
  }

  isSelected(pane: BrowserPane, entry: FileInfo): boolean {
    return pane.selectedFiles.has(entry.path);
  }

  async refresh(pane: BrowserPane): Promise<void> {
    await this.loadDirectory(pane, pane.currentPath);
  }

  async deleteSelected(pane: BrowserPane): Promise<void> {
    if (pane.selectedFiles.size === 0) return;
    if (!confirm(`Delete ${pane.selectedFiles.size} item(s)?`)) return;
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
    if (sourcePane.selectedFiles.size === 0) { alert('No files selected'); return; }
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
    if (sourcePane.selectedFiles.size === 0) { alert('No files selected'); return; }
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
    if (entry.type === FileType.DIRECTORY) return '📁';
    if (entry.type === FileType.SYMLINK)   return '🔗';
    const ext = entry.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt': case 'md':                           return '📄';
      case 'jpg': case 'jpeg': case 'png': case 'gif': return '🖼️';
      case 'pdf':                                       return '📕';
      case 'zip': case 'tar': case 'gz':                return '📦';
      case 'mp3': case 'wav':                           return '🎵';
      case 'mp4': case 'avi':                           return '🎬';
      default:                                          return '📄';
    }
  }

  async toggleShowHidden(): Promise<void> {
    this.showHidden = !this.showHidden;
    if (this.activeWorkspace) {
      this.workspaceService.updateWorkspace(this.activeWorkspace.id, { showHidden: this.showHidden });
    }
    await this.refresh(this.leftPane);
    await this.refresh(this.rightPane);
  }

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  private activePaneId: 'left' | 'right' = 'left';

  private getActivePane() {
    return this.activePaneId === 'left' ? this.leftPane : this.rightPane;
  }

  private registerKeyboardShortcuts(): void {
    const callbacks: ShortcutCallbacks = {
      openGlobalSearch:      () => this.openGlobalSearch(),
      showPathHistory:       () => this.showPathHistory(),
      quickPathJump:         () => this.quickPathJump(),
      navigateUp:            () => this.navigateUpCurrent(),
      refresh:               () => this.refreshCurrent(),
      showKeyboardHelp:      () => this.keyboardHelp?.show(),
      newTab:                () => this.addTabCurrent(),
      closeTab:              () => this.closeTabCurrent(),
      nextTab:               () => this.nextTabCurrent(),
      previousTab:           () => this.previousTabCurrent(),
      jumpToTab:             (index) => this.jumpToTabCurrent(index),
      togglePinTab:          () => this.togglePinCurrentTab(),
      quickView:             () => this.quickViewSelected(),
      openItem:              () => this.openSelectedItem(),
      deleteSelected:        () => this.deleteSelectedCurrent(),
      copySelected:          () => this.copySelectedToClipboard(),
      cutSelected:           () => this.cutSelectedToClipboard(),
      paste:                 () => this.pasteFromClipboard(),
      selectAll:             () => this.selectAllCurrent(),
      deselectAll:           () => this.deselectAllCurrent(),
      newFolder:             () => this.createNewFolderCurrent(),
      renameSelected:        () => this.renameSelectedCurrent(),
      focusFilter:           () => this.focusFilterCurrent(),
      advancedFilter:        () => this.showAdvancedFilter(),
      clearFilter:           () => this.clearFilterCurrent(),
      showWorkspaceSwitcher: () => this.toggleWorkspaceMenu(),
      newWorkspace:          () => this.createNewWorkspace(),
      toggleHiddenFiles:     () => this.toggleShowHidden(),
      switchPane:            () => this.switchActivePaneInternal(),
      copyToOtherPane:       () => this.copyToOtherPaneCurrent(),
      moveToOtherPane:       () => this.moveToOtherPaneCurrent(),
      focusAddressBar:       () => this.focusAddressBarCurrent(),
    };
    this.shortcutRegistry.registerAllShortcuts(callbacks);
  }

  private switchActivePaneInternal(): void {
    this.activePaneId = this.activePaneId === 'left' ? 'right' : 'left';
    console.log('Active pane:', this.activePaneId);
  }

  private openGlobalSearch(): void { this.globalSearch?.show(); }

  onGlobalSearchResult(result: any): void {
    const pane = this.getActivePane();
    if (result.file.type === FileType.DIRECTORY) {
      this.loadDirectory(pane, result.file.path);
    } else {
      const parentPath = this.getParentPath(result.file.path);
      this.loadDirectory(pane, parentPath).then(() => {
        pane.selectedFiles.clear();
        pane.selectedFiles.add(result.file.path);
      });
    }
  }

  private showPathHistory(): void { this.pathHistoryViewer?.show(); }
  private quickPathJump():   void { console.log('Quick path jump - coming in Phase 2'); }
  private navigateUpCurrent(): void { this.navigateToParent(this.getActivePane()); }
  private refreshCurrent():    void { this.refresh(this.getActivePane()); }
  private addTabCurrent():     void { this.addTab(this.getActivePane()); }

  private closeTabCurrent(): void {
    const pane = this.getActivePane();
    const activeTab = this.getTabs(pane.id).find(t => t.isActive);
    if (activeTab) this.closeTab(pane, activeTab.id);
  }

  private nextTabCurrent(): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    const i = tabs.findIndex(t => t.isActive);
    this.switchTab(pane, tabs[(i + 1) % tabs.length].id);
  }

  private previousTabCurrent(): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    const i = tabs.findIndex(t => t.isActive);
    this.switchTab(pane, tabs[i === 0 ? tabs.length - 1 : i - 1].id);
  }

  private jumpToTabCurrent(index: number): void {
    const pane = this.getActivePane();
    const tabs = this.getTabs(pane.id);
    if (index > 0 && index <= tabs.length) this.switchTab(pane, tabs[index - 1].id);
  }

  private togglePinCurrentTab(): void {
    const pane = this.getActivePane();
    const activeTab = this.getTabs(pane.id).find(t => t.isActive);
    if (activeTab) this.toggleTabPin(pane, activeTab.id, new Event('click'));
  }

  private quickViewSelected(): void { console.log('Quick view - coming in Phase 3'); }

  private openSelectedItem(): void {
    const pane = this.getActivePane();
    const selected = Array.from(pane.selectedFiles);
    if (selected.length === 1) {
      const entry = pane.entries.find(e => e.path === selected[0]);
      if (entry) this.navigateToPath(pane, entry);
    }
  }

  private deleteSelectedCurrent(): void { this.deleteSelected(this.getActivePane()); }

  private clipboard: { operation: 'copy' | 'cut', paths: string[] } | null = null;

  private copySelectedToClipboard(): void {
    const pane = this.getActivePane();
    if (pane.selectedFiles.size > 0) {
      this.clipboard = { operation: 'copy', paths: Array.from(pane.selectedFiles) };
      console.log('Copied to clipboard:', this.clipboard.paths.length, 'items');
    }
  }

  private cutSelectedToClipboard(): void {
    const pane = this.getActivePane();
    if (pane.selectedFiles.size > 0) {
      this.clipboard = { operation: 'cut', paths: Array.from(pane.selectedFiles) };
      console.log('Cut to clipboard:', this.clipboard.paths.length, 'items');
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    if (!this.clipboard) { console.log('Clipboard is empty'); return; }
    const targetPane = this.getActivePane();
    const operation = this.clipboard.operation;
    for (const sourcePath of this.clipboard.paths) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');
      try {
        if (operation === 'copy') await this.apiService.copyFile(sourcePath, destPath, true);
        else                      await this.apiService.moveFile(sourcePath, destPath);
      } catch (error: any) {
        console.error(`Failed to ${operation} ${sourcePath}:`, error);
        alert(`Failed to ${operation}: ${error.message}`);
      }
    }
    if (operation === 'cut') this.clipboard = null;
    await this.refresh(targetPane);
  }

  private selectAllCurrent(): void {
    const pane = this.getActivePane();
    pane.selectedFiles.clear();
    pane.filteredEntries.forEach(e => pane.selectedFiles.add(e.path));
  }

  private deselectAllCurrent():    void { this.getActivePane().selectedFiles.clear(); }
  private createNewFolderCurrent(): void { this.createNewFolder(this.getActivePane()); }
  private renameSelectedCurrent():  void { console.log('Rename - to be implemented'); }

  private focusFilterCurrent(): void {
    const filterInput = document.querySelector(
      `.pane:nth-child(${this.activePaneId === 'left' ? 1 : 2}) .filter-input`
    ) as HTMLInputElement;
    filterInput?.focus();
  }

  private showAdvancedFilter(): void { console.log('Advanced filter - to be implemented'); }
  private clearFilterCurrent(): void { this.clearFilter(this.getActivePane()); }

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