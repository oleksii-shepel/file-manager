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
import { ShortcutCallbacks, ShortcutRegistryService } from '../services/shortcut-registry.service';
import { GlobalSearchComponent } from './global-search.component';
import { PathHistoryService } from '../services/path-history.service';
import { ThemeService } from '../services/theme.service';
import { PathHistoryViewerComponent } from './path-history-viewer.component';
import { AddressBarComponent } from './address-bar.component';
import { ActiveFilterState, FilterBarComponent, FilterPreset } from './filter-bar.component';
import { TabBarComponent } from './tab-bar.component';

// Archive types (from archive.service.ts)
import { ArchiveService, ArchiveEntry, ArchiveListing, isArchive, archiveFormat } from '../services/archive.service';

// ============================================================================
// Archive Navigation Types
// ============================================================================

/** One level in the archive navigation stack. */
interface ArchiveStackFrame {
  /** Absolute filesystem path to the archive file. */
  archivePath: string;
  /** Inner path listed at this level ('' = root). */
  innerPath: string;
  /** Listing returned from the server. */
  listing: ArchiveListing;
}

// ============================================================================
// Pane
// ============================================================================

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

  // ── Archive state ──────────────────────────────────────────────────────────
  /** Non-empty while the user is browsing inside an archive. */
  archiveStack: ArchiveStackFrame[];
  /** Derived from the top of archiveStack; null when in normal filesystem mode. */
  currentArchiveListing: ArchiveListing | null;
}

// ============================================================================
// Component
// ============================================================================

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
    FilterBarComponent,
    TabBarComponent,
  ],
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.scss'],
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  @ViewChild(KeyboardHelpComponent)    keyboardHelp?:      KeyboardHelpComponent;
  @ViewChild(GlobalSearchComponent)    globalSearch?:      GlobalSearchComponent;
  @ViewChild(PathHistoryViewerComponent) pathHistoryViewer?: PathHistoryViewerComponent;
  @ViewChild(TabBarComponent)          tabBar?:            TabBarComponent;

  leftPane:  BrowserPane = this.createEmptyPane('left');
  rightPane: BrowserPane = this.createEmptyPane('right');

  activeWorkspace:   WorkspaceConfig | null = null;
  workspaceList:     WorkspaceConfig[]      = [];
  showWorkspaceMenu  = false;
  showHidden         = false;

  // Expose to template
  FileType    = FileType;
  isArchive   = isArchive;
  archiveFormat = archiveFormat;

  private destroy$ = new Subject<void>();

  constructor(
    private apiService:       ApiService,
    private workspaceService: WorkspaceService,
    private filterService:    FilterService,
    private shortcutRegistry: ShortcutRegistryService,
    private pathHistoryService: PathHistoryService,
    private archiveService:   ArchiveService,
    public  theme:            ThemeService,
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
      this.leftPane.currentPath   = leftActiveTab.path;
      this.leftPane.currentTabId  = leftActiveTab.id;
      this.loadDirectory(this.leftPane, leftActiveTab.path);
    }

    const rightActiveTab = this.workspaceService.getActiveTab('right');
    if (rightActiveTab) {
      this.rightPane.currentPath  = rightActiveTab.path;
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

  getTabs(paneId: string): TabInfo[] { return this.workspaceService.getTabs(paneId); }

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
      pane.currentPath  = activeTab.path;
      this.loadDirectory(pane, activeTab.path);
    }
  }

  switchTab(pane: BrowserPane, tabId: string): void {
    this.workspaceService.switchTab(pane.id, tabId);
    const tab = this.getTabs(pane.id).find(t => t.id === tabId);
    if (tab) {
      pane.currentTabId = tabId;
      pane.currentPath  = tab.path;
      // Exit any archive navigation when switching tabs
      this.exitArchive(pane);
      this.loadDirectory(pane, tab.path);
    }
  }

  toggleTabPin(pane: BrowserPane, tabId: string): void {
    this.workspaceService.toggleTabPin(pane.id, tabId);
  }

  // ============================================================================
  // Pane Factory
  // ============================================================================

  private createEmptyPane(id: string): BrowserPane {
    return {
      id,
      currentPath:           '',
      currentTabId:          '',
      entries:               [],
      filteredEntries:       [],
      selectedFiles:         new Set(),
      loading:               false,
      error:                 null,
      filterText:            '',
      filterQuery:           { text: '', criteria: [] },
      activeFilterState:     null,
      archiveStack:          [],
      currentArchiveListing: null,
    };
  }

  // ============================================================================
  // Server Connection
  // ============================================================================

  async checkServerConnection(): Promise<void> {
    const isHealthy = await this.apiService.checkHealth();
    if (!isHealthy) {
      this.leftPane.error  = 'Cannot connect to server';
      this.rightPane.error = 'Cannot connect to server';
    }
  }

  // ============================================================================
  // Filesystem Navigation
  // ============================================================================

  async loadDirectory(pane: BrowserPane, path: string): Promise<void> {
    // Entering a real directory always exits any archive context
    this.exitArchive(pane);

    pane.loading = true;
    pane.error   = null;
    try {
      const listing = await this.apiService.listDirectory(path, this.showHidden);
      pane.currentPath = listing.path;

      let entries = [...listing.entries];
      if (this.canGoUp(listing.path)) {
        entries = [this.makeParentEntry(listing.path), ...entries];
      }

      pane.entries = entries;
      pane.selectedFiles.clear();
      this.applyFilter(pane);
      this.workspaceService.updateTabPath(pane.id, pane.currentTabId, path);
      this.pathHistoryService.addPath(path, pane.id);
    } catch (error: any) {
      pane.error = error.message || 'Failed to load directory';
    } finally {
      pane.loading = false;
    }
  }

  async navigateToParent(pane: BrowserPane): Promise<void> {
    if (this.isInArchive(pane)) {
      await this.navigateArchiveUp(pane);
    } else {
      const parent = this.getParentPath(pane.currentPath);
      if (parent !== pane.currentPath) await this.loadDirectory(pane, parent);
    }
  }

  // ============================================================================
  // Archive Navigation
  // ============================================================================

  /** True when the pane is currently browsing inside an archive. */
  isInArchive(pane: BrowserPane): boolean {
    return pane.archiveStack.length > 0;
  }

  /**
   * Navigate into an archive (or a subdirectory inside an archive).
   * Pushes a new frame onto the stack and renders archive entries as FileInfo.
   */
  async loadArchive(pane: BrowserPane, archivePath: string, innerPath = ''): Promise<void> {
    pane.loading = true;
    pane.error   = null;
    try {
      const listing = await this.archiveService.listArchive(archivePath, innerPath);
      if (!listing) throw new Error('Empty response from server');

      const frame: ArchiveStackFrame = { archivePath, innerPath, listing };
      pane.archiveStack.push(frame);
      pane.currentArchiveListing = listing;

      pane.entries = this.archiveListingToFileInfos(pane, listing);
      pane.selectedFiles.clear();
      this.applyFilter(pane);
    } catch (error: any) {
      pane.error = error.message || 'Failed to open archive';
    } finally {
      pane.loading = false;
    }
  }

  /**
   * Go up one level inside an archive.
   * If already at the archive root, exits the archive entirely.
   */
  async navigateArchiveUp(pane: BrowserPane): Promise<void> {
    pane.archiveStack.pop();

    if (pane.archiveStack.length === 0) {
      // Back on the real filesystem — reload the directory containing the archive
      pane.currentArchiveListing = null;
      await this.loadDirectory(pane, pane.currentPath);
      return;
    }

    const frame = pane.archiveStack[pane.archiveStack.length - 1];
    pane.currentArchiveListing = frame.listing;
    pane.entries = this.archiveListingToFileInfos(pane, frame.listing);
    pane.selectedFiles.clear();
    this.applyFilter(pane);
  }

  /** Completely exits archive mode, resetting all archive state. */
  exitArchive(pane: BrowserPane): void {
    pane.archiveStack          = [];
    pane.currentArchiveListing = null;
  }

  /**
   * Extract selected archive entries to a user-chosen destination.
   * Falls back to prompting for a path.
   */
  async extractSelected(pane: BrowserPane): Promise<void> {
    if (!this.isInArchive(pane)) return;

    const frame = pane.archiveStack[pane.archiveStack.length - 1];
    const destination = prompt('Extract to directory:', pane.currentPath);
    if (!destination) return;

    const selected = Array.from(pane.selectedFiles);
    // selectedFiles contains the synthetic "inner_path" values we stored as paths
    const innerPaths = selected.length > 0 ? selected : [];

    pane.loading = true;
    try {
      await this.archiveService.extractArchive(frame.archivePath, destination, innerPaths);
      alert(`Extracted successfully to ${destination}`);
    } catch (error: any) {
      alert(`Extraction failed: ${error.message}`);
    } finally {
      pane.loading = false;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Converts ArchiveListing entries → FileInfo[] (adds '..' entry at the top)
  // ────────────────────────────────────────────────────────────────────────────
  private archiveListingToFileInfos(pane: BrowserPane, listing: ArchiveListing): FileInfo[] {
    const entries: FileInfo[] = listing.entries.map(e => this.archiveEntryToFileInfo(e));

    // Always show '..' inside an archive so user can go back
    const parentEntry: FileInfo = {
      name:        '..',
      // We repurpose `path` to carry a special sentinel for the handler
      path:        '__archive_parent__',
      type:        FileType.DIRECTORY,
      size:        0,
      modified:    0,
      permissions: 'drwxr-xr-x',
      isHidden:    false,
      created:     0,
      accessed:    0,
    };

    return [parentEntry, ...entries];
  }

  private archiveEntryToFileInfo(entry: ArchiveEntry): FileInfo {
    return {
      name:        entry.name,
      // Store the inner path so selection / extraction works correctly
      path:        entry.innerPath,
      type:        entry.type === 'DIRECTORY' ? FileType.DIRECTORY : FileType.FILE,
      size:        entry.size,
      modified:    entry.modified,
      permissions: entry.type === 'DIRECTORY' ? 'drwxr-xr-x' : '-rw-r--r--',
      isHidden:    entry.name.startsWith('.'),
      created:     entry.modified,
      accessed:    entry.modified,
    };
  }

  // ============================================================================
  // Unified Navigation Entry Point (used by template click handler)
  // ============================================================================

  async navigateToPath(pane: BrowserPane, entry: FileInfo): Promise<void> {
    // ── Special sentinel: '..' inside an archive ──────────────────────────────
    if (entry.path === '__archive_parent__') {
      await this.navigateArchiveUp(pane);
      return;
    }

    // ── Inside an archive: drill into subdirectory or read file ───────────────
    if (this.isInArchive(pane)) {
      const frame = pane.archiveStack[pane.archiveStack.length - 1];
      if (entry.type === FileType.DIRECTORY) {
        await this.loadArchive(pane, frame.archivePath, entry.path);
      }
      // Files inside archives are read-only view — no action for now
      return;
    }

    // ── Normal filesystem: directory ──────────────────────────────────────────
    if (entry.type === FileType.DIRECTORY) {
      if (entry.name === '..') {
        await this.navigateToParent(pane);
      } else {
        await this.loadDirectory(pane, entry.path);
      }
      return;
    }

    // ── Normal filesystem: archive file → open as folder ─────────────────────
    if (entry.type === FileType.FILE && isArchive(entry.name)) {
      await this.loadArchive(pane, entry.path);
      return;
    }

    // Other file types: no action (future: preview)
  }

  async navigateFromAddressBar(pane: BrowserPane, path: string): Promise<void> {
    if (path && path !== pane.currentPath) {
      this.exitArchive(pane);
      await this.loadDirectory(pane, path);
    }
  }

  // ============================================================================
  // Archive Display Helpers (used in template)
  // ============================================================================

  /** Breadcrumb segments for archive navigation, e.g. ['archive.zip', 'src', 'utils'] */
  getArchiveBreadcrumb(pane: BrowserPane): { label: string; frameIndex: number }[] {
    return pane.archiveStack.map((frame, i) => {
      const archiveName = frame.archivePath.split(/[\\/]/).pop() ?? frame.archivePath;
      if (i === 0) {
        // Root frame: show archive filename
        return { label: archiveName, frameIndex: i };
      }
      // Deeper frame: show the last segment of the inner path
      const segment = frame.innerPath.split('/').pop() ?? frame.innerPath;
      return { label: segment, frameIndex: i };
    });
  }

  /** Navigate to a specific breadcrumb depth. */
  async jumpToArchiveFrame(pane: BrowserPane, frameIndex: number): Promise<void> {
    // Pop frames down to frameIndex
    pane.archiveStack = pane.archiveStack.slice(0, frameIndex + 1);
    const frame = pane.archiveStack[pane.archiveStack.length - 1];
    pane.currentArchiveListing = frame.listing;
    pane.entries = this.archiveListingToFileInfos(pane, frame.listing);
    pane.selectedFiles.clear();
    this.applyFilter(pane);
  }

  /** Compression ratio string for an archive entry, e.g. '42%'. */
  getCompressionRatio(entry: FileInfo, pane: BrowserPane): string | null {
    if (!this.isInArchive(pane)) return null;
    const listing = pane.currentArchiveListing;
    if (!listing) return null;
    const archiveEntry = listing.entries.find(e => e.innerPath === entry.path);
    if (!archiveEntry || archiveEntry.size === 0 || archiveEntry.compressedSize === 0) return null;
    const ratio = Math.round((1 - archiveEntry.compressedSize / archiveEntry.size) * 100);
    if (ratio <= 0) return null;
    return `${ratio}%`;
  }

  /** Compression method string for an archive entry, e.g. 'Deflate'. */
  getCompressionMethod(entry: FileInfo, pane: BrowserPane): string | null {
    if (!this.isInArchive(pane)) return null;
    const listing = pane.currentArchiveListing;
    if (!listing) return null;
    const archiveEntry = listing.entries.find(e => e.innerPath === entry.path);
    return archiveEntry?.compression ?? null;
  }

  /** Format label for the current archive, e.g. 'tar.gz'. */
  getCurrentArchiveFormat(pane: BrowserPane): string | null {
    return pane.currentArchiveListing?.format ?? null;
  }

  // ============================================================================
  // Filter System
  // ============================================================================

  onPresetFilterChange(pane: BrowserPane, state: ActiveFilterState): void {
    pane.activeFilterState = state;
    this.applyFilter(pane);
  }

  onPresetFilterClear(pane: BrowserPane): void {
    pane.activeFilterState = null;
    this.applyFilter(pane);
  }

  onFilterChange(pane: BrowserPane): void {
    pane.filterQuery = this.filterService.parseFilterText(pane.filterText);
    this.applyFilter(pane);
  }

  clearFilter(pane: BrowserPane): void {
    pane.filterText        = '';
    pane.filterQuery       = { text: '', criteria: [] };
    pane.activeFilterState = null;
    this.applyFilter(pane);
  }

  private applyFilter(pane: BrowserPane): void {
    let entries = pane.entries;

    if (pane.activeFilterState && pane.activeFilterState.presets.length > 0) {
      const { presets, combined } = pane.activeFilterState;
      const isOrMode = combined.includes(' OR ');
      entries = isOrMode
        ? entries.filter(e => presets.some(p  => this.matchesPreset(e, p)))
        : entries.filter(e => presets.every(p => this.matchesPreset(e, p)));
    }

    if (pane.filterText && pane.filterText.trim() !== '') {
      if (!pane.filterQuery || pane.filterQuery.text !== pane.filterText) {
        pane.filterQuery = this.filterService.parseFilterText(pane.filterText);
      }
      entries = this.filterService.filterEntries(entries, pane.filterQuery);
    }

    pane.filteredEntries = entries;
  }

  private matchesPreset(entry: FileInfo, preset: FilterPreset): boolean {
    const filter = preset.filter;
    if (!filter || filter.trim() === '') return true;

    const tokens = filter.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    return tokens.some(token => {
      if (token === 'type:dir')  return entry.type === FileType.DIRECTORY;
      if (token === 'type:file') return entry.type !== FileType.DIRECTORY;
      if (token === 'type:archive') return isArchive(entry.name);

      if (token.startsWith('ext:')) {
        const ext    = token.slice(4).toLowerCase();
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
      if (token.startsWith('modified:')) return this.matchesModified(entry, token.slice(9));
      return false;
    });
  }

  private parseSize(raw: string): number | null {
    const match = raw.toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/);
    if (!match) return null;
    const multipliers: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
    return parseFloat(match[1]) * (multipliers[match[2] ?? 'b'] ?? 1);
  }

  private matchesModified(entry: FileInfo, period: string): boolean {
    const diff = Date.now() - (entry.modified ?? 0) * 1000;
    const day  = 86_400_000;
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
    else                                    pane.selectedFiles.add(entry.path);
  }

  isSelected(pane: BrowserPane, entry: FileInfo): boolean {
    return pane.selectedFiles.has(entry.path);
  }

  async refresh(pane: BrowserPane): Promise<void> {
    if (this.isInArchive(pane)) {
      // Re-fetch the current archive listing
      const frame = pane.archiveStack[pane.archiveStack.length - 1];
      pane.archiveStack.pop();
      await this.loadArchive(pane, frame.archivePath, frame.innerPath);
    } else {
      await this.loadDirectory(pane, pane.currentPath);
    }
  }

  async deleteSelected(pane: BrowserPane): Promise<void> {
    if (this.isInArchive(pane)) { alert('Cannot delete files inside an archive.'); return; }
    if (pane.selectedFiles.size === 0) return;
    if (!confirm(`Delete ${pane.selectedFiles.size} item(s)?`)) return;
    for (const path of Array.from(pane.selectedFiles)) {
      try {
        await this.apiService.deleteFile(path, true);
      } catch (error: any) {
        alert(`Failed to delete ${path}: ${error.message}`);
      }
    }
    await this.refresh(pane);
  }

  async createNewFolder(pane: BrowserPane): Promise<void> {
    if (this.isInArchive(pane)) { alert('Cannot create folders inside an archive.'); return; }
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
    if (this.isInArchive(sourcePane)) {
      await this.extractSelected(sourcePane);
      return;
    }
    if (sourcePane.selectedFiles.size === 0) { alert('No files selected'); return; }
    for (const sourcePath of Array.from(sourcePane.selectedFiles)) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');
      try {
        await this.apiService.copyFile(sourcePath, destPath, true);
      } catch (error: any) {
        alert(`Failed to copy ${sourcePath}: ${error.message}`);
      }
    }
    await this.refresh(targetPane);
  }

  async moveToOtherPane(sourcePane: BrowserPane, targetPane: BrowserPane): Promise<void> {
    if (this.isInArchive(sourcePane)) { alert('Cannot move files from inside an archive.'); return; }
    if (sourcePane.selectedFiles.size === 0) { alert('No files selected'); return; }
    for (const sourcePath of Array.from(sourcePane.selectedFiles)) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');
      try {
        await this.apiService.moveFile(sourcePath, destPath);
      } catch (error: any) {
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
    if (bytes === 0) return '—';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  formatDate(timestamp: number): string {
    if (!timestamp) return '—';
    return new Date(timestamp * 1000).toLocaleString();
  }

  getFileIcon(entry: FileInfo, pane?: BrowserPane): string {
    if (entry.name === '..') return '↑';
    if (entry.type === FileType.DIRECTORY) return '📁';
    if (entry.type === FileType.SYMLINK)   return '🔗';

    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';

    // Archives — more specific matching
    if (['zip','jar','war','ear','apk'].includes(ext))         return '📦';
    if (ext === 'tar' || entry.name.includes('.tar.'))         return '📦';
    if (['gz','bz2','xz','zst','zstd','7z','rar'].includes(ext)) return '📦';
    if (['docx','xlsx','pptx','odt','ods','odp'].includes(ext)) return '📦';

    // Documents
    if (['txt','md','rst','log'].includes(ext))                return '📄';
    if (ext === 'pdf')                                         return '📕';
    if (['doc','rtf'].includes(ext))                           return '📝';
    if (['xls','csv','tsv'].includes(ext))                     return '📊';
    if (['ppt'].includes(ext))                                 return '📊';

    // Code
    if (['js','ts','jsx','tsx','mjs','cjs'].includes(ext))     return '⚙️';
    if (['py','rb','go','rs','java','c','cpp','cs'].includes(ext)) return '⚙️';
    if (['html','htm','css','scss','sass','less'].includes(ext)) return '🌐';
    if (['json','yaml','yml','toml','ini','env'].includes(ext)) return '⚙️';
    if (['sh','bash','zsh','fish','ps1'].includes(ext))        return '💻';

    // Images
    if (['jpg','jpeg','png','gif','webp','svg','ico','bmp','tiff'].includes(ext)) return '🖼️';

    // Media
    if (['mp3','wav','flac','aac','ogg','m4a'].includes(ext))  return '🎵';
    if (['mp4','mkv','avi','mov','webm','flv'].includes(ext))  return '🎬';

    // Executables
    if (['exe','dmg','deb','rpm','appimage'].includes(ext))    return '⚡';

    return '📄';
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
  // Helpers
  // ============================================================================

  private canGoUp(path: string): boolean {
    return path !== '/' && !path.match(/^[A-Za-z]:(\\|\/)?$/);
  }

  private makeParentEntry(currentPath: string): FileInfo {
    return {
      name:        '..',
      path:        this.getParentPath(currentPath),
      type:        FileType.DIRECTORY,
      size:        0,
      modified:    Date.now() / 1000,
      permissions: 'drwxr-xr-x',
      isHidden:    false,
      created:     Date.now() / 1000,
      accessed:    Date.now() / 1000,
    };
  }

  private getParentPath(path: string): string {
    if (!path || path === '/') return '/';
    const winMatch    = path.match(/^([A-Za-z]:)([\\/].*)?$/);
    const hasBackslash = path.includes('\\');
    if (winMatch) {
      const parts = path.split(/[\\/]+/).filter(Boolean);
      if (parts.length <= 1) return winMatch[1] + (hasBackslash ? '\\' : '/');
      parts.pop();
      return parts.join(hasBackslash ? '\\' : '/');
    }
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length <= 1) return '/';
    parts.pop();
    return '/' + parts.join('/');
  }

  // ============================================================================
  // Keyboard Shortcuts
  // ============================================================================

  private activePaneId: 'left' | 'right' = 'left';
  private getActivePane() { return this.activePaneId === 'left' ? this.leftPane : this.rightPane; }

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
  }

  private openGlobalSearch(): void { this.globalSearch?.show(); }

  onGlobalSearchResult(result: any): void {
    const pane = this.getActivePane();
    this.exitArchive(pane);
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

  private showPathHistory():       void { this.pathHistoryViewer?.show(); }
  private quickPathJump():         void { console.log('Quick path jump - Phase 2'); }
  private navigateUpCurrent():     void { this.navigateToParent(this.getActivePane()); }
  private refreshCurrent():        void { this.refresh(this.getActivePane()); }
  private addTabCurrent():         void { this.addTab(this.getActivePane()); }

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
    if (activeTab) this.toggleTabPin(pane, activeTab.id);
  }

  private quickViewSelected(): void { console.log('Quick view - Phase 3'); }

  private openSelectedItem(): void {
    const pane    = this.getActivePane();
    const selected = Array.from(pane.selectedFiles);
    if (selected.length === 1) {
      const entry = pane.entries.find(e => e.path === selected[0]);
      if (entry) this.navigateToPath(pane, entry);
    }
  }

  private deleteSelectedCurrent(): void { this.deleteSelected(this.getActivePane()); }

  private clipboard: { operation: 'copy' | 'cut'; paths: string[] } | null = null;

  private copySelectedToClipboard(): void {
    const pane = this.getActivePane();
    if (pane.selectedFiles.size > 0) {
      this.clipboard = { operation: 'copy', paths: Array.from(pane.selectedFiles) };
    }
  }

  private cutSelectedToClipboard(): void {
    const pane = this.getActivePane();
    if (pane.selectedFiles.size > 0) {
      this.clipboard = { operation: 'cut', paths: Array.from(pane.selectedFiles) };
    }
  }

  private async pasteFromClipboard(): Promise<void> {
    if (!this.clipboard || this.isInArchive(this.getActivePane())) return;
    const targetPane  = this.getActivePane();
    const { operation, paths } = this.clipboard;
    for (const sourcePath of paths) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');
      try {
        if (operation === 'copy') await this.apiService.copyFile(sourcePath, destPath, true);
        else                      await this.apiService.moveFile(sourcePath, destPath);
      } catch (error: any) {
        alert(`Failed to ${operation}: ${error.message}`);
      }
    }
    if (operation === 'cut') this.clipboard = null;
    await this.refresh(targetPane);
  }

  private selectAllCurrent():      void { const p = this.getActivePane(); p.filteredEntries.forEach(e => p.selectedFiles.add(e.path)); }
  private deselectAllCurrent():    void { this.getActivePane().selectedFiles.clear(); }
  private createNewFolderCurrent(): void { this.createNewFolder(this.getActivePane()); }
  private renameSelectedCurrent(): void { console.log('Rename - to be implemented'); }

  private focusFilterCurrent(): void {
    const n = this.activePaneId === 'left' ? 1 : 2;
    (document.querySelector(`.pane:nth-child(${n}) .filter-input`) as HTMLInputElement)?.focus();
  }

  private showAdvancedFilter():  void { console.log('Advanced filter - to be implemented'); }
  private clearFilterCurrent():  void { this.clearFilter(this.getActivePane()); }

  private copyToOtherPaneCurrent(): void {
    const src = this.getActivePane();
    const tgt = this.activePaneId === 'left' ? this.rightPane : this.leftPane;
    this.copyToOtherPane(src, tgt);
  }

  private moveToOtherPaneCurrent(): void {
    const src = this.getActivePane();
    const tgt = this.activePaneId === 'left' ? this.rightPane : this.leftPane;
    this.moveToOtherPane(src, tgt);
  }

  private focusAddressBarCurrent(): void {
    const n = this.activePaneId === 'left' ? 1 : 2;
    const el = document.querySelector(`.pane:nth-child(${n}) .address-input`) as HTMLInputElement;
    el?.focus();
    el?.select();
  }
}