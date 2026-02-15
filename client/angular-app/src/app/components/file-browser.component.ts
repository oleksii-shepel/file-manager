import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../services/api.service';
import { FileInfo, FileType, ShareInfo } from '@shared/protocol';

type PaneSide = 'left' | 'right';

interface PaneTab {
  id: string;
  title: string;
  currentPath: string;
  pathInput: string;
  entries: FileInfo[];
  selectedFiles: Set<string>;
  loading: boolean;
  error: string | null;
}

type WorkspaceActionType = 'open_url' | 'navigate_path' | 'run_global_search';

interface WorkspaceAction {
  id: string;
  name: string;
  type: WorkspaceActionType;
  target: string;
}

interface Workspace {
  id: string;
  name: string;
  leftTabs: PaneTab[];
  rightTabs: PaneTab[];
  activeLeftTabId: string;
  activeRightTabId: string;
  showHidden: boolean;
  pathHistory: string[];
  actions: WorkspaceAction[];
}

interface TabSnapshot {
  id: string;
  title: string;
  currentPath: string;
}

interface WorkspaceSnapshot {
  id: string;
  name: string;
  leftTabs: TabSnapshot[];
  rightTabs: TabSnapshot[];
  activeLeftTabId: string;
  activeRightTabId: string;
  showHidden: boolean;
  pathHistory: string[];
  actions: WorkspaceAction[];
}

type QuickViewKind = 'none' | 'text' | 'image' | 'audio' | 'video' | 'pdf';
type PanelMode = 'dashboard' | 'notes';

interface NoteItem {
  id: string;
  title: string;
  body: string;
  tags: string[];
  linkedPath?: string;
  pinned: boolean;
  protected: boolean;
  createdAt: number;
  updatedAt: number;
}

interface ActivityItem {
  id: string;
  timestamp: number;
  action: string;
  details: string;
}

type DownloadStatus = 'queued' | 'running' | 'done' | 'error';

interface DownloadTask {
  id: string;
  url: string;
  fileName: string;
  status: DownloadStatus;
  progress: number;
  error?: string;
}

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.scss']
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  private readonly storageKey = 'file-manager-workspaces-v1';
  private readonly notesStorageKey = 'file-manager-notes-v1';
  private readonly activityStorageKey = 'file-manager-activity-v1';

  workspaces: Workspace[] = [];
  currentWorkspaceId = '';
  searchQuery = '';
  globalSearchMode = false;
  globalSearchLoading = false;
  globalSearchError: string | null = null;
  globalSearchResults: FileInfo[] = [];
  protectedPaths = new Set<string>();
  infoPanelError: string | null = null;
  quickViewOpen = false;
  quickViewLoading = false;
  quickViewError: string | null = null;
  quickViewKind: QuickViewKind = 'none';
  quickViewText = '';
  quickViewDataUrl: string | null = null;
  quickViewTitle = '';
  panelMode: PanelMode = 'dashboard';
  notes: NoteItem[] = [];
  activityLog: ActivityItem[] = [];
  selectedNoteId: string | null = null;
  noteDraftTitle = '';
  noteDraftBody = '';
  noteDraftTags = '';
  noteDraftLinkedPath = '';
  actionDraftName = '';
  actionDraftType: WorkspaceActionType = 'open_url';
  actionDraftTarget = '';
  activeShares: ShareInfo[] = [];
  shareExpiresMinutes = 60;
  downloaderUrlInput = '';
  downloadTasks: DownloadTask[] = [];
  isDownloadWorkerRunning = false;
  dropActive = false;
  leftPathSuggestions: string[] = [];
  rightPathSuggestions: string[] = [];
  leftSuggestionIndex = -1;
  rightSuggestionIndex = -1;
  private leftSuggestRequestId = 0;
  private rightSuggestRequestId = 0;
  activePaneSide: PaneSide = 'left';
  FileType = FileType;

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.initializeState();
    this.ensureWorkspaceLoaded();
    this.checkServerConnection();
    this.loadProtectedPaths();
    this.loadNotes();
    this.loadActivityLog();
    this.loadShares();
  }

  ngOnDestroy(): void {
    this.apiService.disconnectWebSocket();
  }

  get activeWorkspace(): Workspace {
    const existing = this.workspaces.find((ws) => ws.id === this.currentWorkspaceId);
    if (existing) {
      return existing;
    }

    if (this.workspaces.length === 0) {
      const created = this.createWorkspaceState('Default', this.getHomePath());
      this.workspaces = [created];
      this.currentWorkspaceId = created.id;
      return created;
    }

    this.currentWorkspaceId = this.workspaces[0].id;
    return this.workspaces[0];
  }

  get leftPane(): PaneTab {
    return this.getActiveTab('left');
  }

  get rightPane(): PaneTab {
    return this.getActiveTab('right');
  }

  get showHidden(): boolean {
    return this.activeWorkspace.showHidden;
  }

  selectWorkspace(id: string): void {
    this.currentWorkspaceId = id;
    this.ensureWorkspaceLoaded();
    this.saveWorkspaces();
    this.recordActivity('Workspace', `Switched to ${this.activeWorkspace.name}`);
  }

  createWorkspace(): void {
    const name = prompt('Workspace name:');
    if (!name?.trim()) {
      return;
    }

    const ws = this.createWorkspaceState(name.trim(), this.getHomePath());
    this.workspaces.push(ws);
    this.currentWorkspaceId = ws.id;
    this.ensureWorkspaceLoaded();
    this.saveWorkspaces();
    this.recordActivity('Workspace', `Created ${ws.name}`);
  }

  deleteCurrentWorkspace(): void {
    if (this.workspaces.length <= 1) {
      return;
    }

    if (!confirm(`Delete workspace "${this.activeWorkspace.name}"?`)) {
      return;
    }

    this.workspaces = this.workspaces.filter((ws) => ws.id !== this.currentWorkspaceId);
    this.currentWorkspaceId = this.workspaces[0].id;
    this.ensureWorkspaceLoaded();
    this.saveWorkspaces();
  }

  createWorkspaceAction(): void {
    const name = this.actionDraftName.trim();
    const target = this.actionDraftTarget.trim();
    if (!name || !target) {
      return;
    }

    const action: WorkspaceAction = {
      id: this.nextId('actn'),
      name,
      type: this.actionDraftType,
      target,
    };

    this.activeWorkspace.actions.push(action);
    this.saveWorkspaces();
    this.recordActivity('Action', `Created action: ${name}`);
    this.actionDraftName = '';
    this.actionDraftTarget = '';
  }

  deleteWorkspaceAction(action: WorkspaceAction): void {
    this.activeWorkspace.actions = this.activeWorkspace.actions.filter((a) => a.id !== action.id);
    this.saveWorkspaces();
    this.recordActivity('Action', `Deleted action: ${action.name}`);
  }

  async runWorkspaceAction(action: WorkspaceAction): Promise<void> {
    try {
      if (action.type === 'open_url') {
        window.open(action.target, '_blank', 'noopener,noreferrer');
        this.recordActivity('Action', `Open URL: ${action.target}`);
        return;
      }

      if (action.type === 'navigate_path') {
        const pane = this.getActiveTab(this.activePaneSide);
        await this.loadDirectory(pane, action.target);
        this.recordActivity('Action', `Navigate: ${action.target}`);
        return;
      }

      if (action.type === 'run_global_search') {
        this.setGlobalSearchMode(true);
        this.searchQuery = action.target;
        await this.runGlobalSearch();
        this.recordActivity('Action', `Global search: ${action.target}`);
      }
    } catch (error: any) {
      alert(`Action failed: ${error?.message || 'Unknown error'}`);
    }
  }

  queueDownloadFromInput(): void {
    const url = this.downloaderUrlInput.trim();
    if (!url) {
      return;
    }
    this.queueDownload(url);
    this.downloaderUrlInput = '';
  }

  queueDownload(url: string): void {
    const normalized = url.trim();
    if (!normalized) {
      return;
    }
    const task: DownloadTask = {
      id: this.nextId('dl'),
      url: normalized,
      fileName: this.inferFileNameFromUrl(normalized),
      status: 'queued',
      progress: 0,
    };
    this.downloadTasks.unshift(task);
    this.recordActivity('Download', `Queued: ${normalized}`);
    void this.processDownloadQueue();
  }

  private async processDownloadQueue(): Promise<void> {
    if (this.isDownloadWorkerRunning) {
      return;
    }
    this.isDownloadWorkerRunning = true;
    try {
      while (true) {
        const next = this.downloadTasks.find((t) => t.status === 'queued');
        if (!next) {
          break;
        }
        await this.runDownloadTask(next);
      }
    } finally {
      this.isDownloadWorkerRunning = false;
    }
  }

  private async runDownloadTask(task: DownloadTask): Promise<void> {
    task.status = 'running';
    task.progress = 5;
    try {
      const response = await fetch(task.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      task.progress = 80;
      this.triggerBrowserDownload(blob, task.fileName);
      task.progress = 100;
      task.status = 'done';
      this.recordActivity('Download', `Completed: ${task.fileName}`);
    } catch (error: any) {
      task.status = 'error';
      task.error = error?.message || 'Download failed';
      this.recordActivity('Download', `Failed: ${task.fileName}`);
    }
  }

  private triggerBrowserDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download.bin';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private inferFileNameFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const last = parsed.pathname.split('/').filter(Boolean).pop();
      return last || `download-${Date.now()}.bin`;
    } catch {
      return `download-${Date.now()}.bin`;
    }
  }

  async shareSelectedFromActivePane(): Promise<void> {
    const entry = this.getActiveSelectedEntry();
    if (!entry) {
      alert('Select a file or directory to share.');
      return;
    }
    try {
      const info = await this.apiService.startShare(entry.path, this.shareExpiresMinutes);
      await this.loadShares();
      this.recordActivity('Share', `Started: ${info.url}`);
    } catch (error: any) {
      alert(`Failed to start share: ${error?.message || 'Unknown error'}`);
    }
  }

  async stopShare(shareId: string): Promise<void> {
    try {
      await this.apiService.stopShare(shareId);
      await this.loadShares();
      this.recordActivity('Share', `Stopped: ${shareId}`);
    } catch (error: any) {
      alert(`Failed to stop share: ${error?.message || 'Unknown error'}`);
    }
  }

  openShareUrl(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dropActive = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dropActive = false;
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dropActive = false;
    const dataTransfer = event.dataTransfer;
    if (!dataTransfer) {
      return;
    }

    const urlText = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain');
    if (urlText && /^https?:\/\//i.test(urlText.trim())) {
      this.queueDownload(urlText.trim());
      return;
    }

    if (dataTransfer.files && dataTransfer.files.length > 0) {
      const pane = this.getActiveTab(this.activePaneSide);
      for (const file of Array.from(dataTransfer.files)) {
        // MVP: write only text-like files via UTF-8 content.
        if (!this.isLikelyTextFile(file.name)) {
          this.recordActivity('Drop', `Skipped non-text file: ${file.name}`);
          continue;
        }
        try {
          const content = await file.text();
          const targetPath = this.joinPath(pane.currentPath, file.name);
          await this.apiService.writeFile(targetPath, content, 'utf8');
          this.recordActivity('Drop', `Imported: ${file.name}`);
        } catch (error: any) {
          this.recordActivity('Drop', `Import failed: ${file.name}`);
        }
      }
      await this.refresh(pane);
    }
  }

  createTab(side: PaneSide): void {
    const tabs = this.getTabs(side);
    const source = this.getActiveTab(side);
    const next = this.createPaneTab(source.currentPath);
    tabs.push(next);
    this.setActiveTabId(side, next.id);
    this.loadDirectory(next, next.currentPath);
    this.saveWorkspaces();
  }

  closeTab(side: PaneSide, tabId: string): void {
    const tabs = this.getTabs(side);
    if (tabs.length <= 1) {
      return;
    }

    const idx = tabs.findIndex((tab) => tab.id === tabId);
    if (idx < 0) {
      return;
    }

    tabs.splice(idx, 1);

    if (this.getActiveTabId(side) === tabId) {
      const fallback = tabs[Math.max(0, idx - 1)];
      this.setActiveTabId(side, fallback.id);
    }

    this.saveWorkspaces();
  }

  setActivePane(side: PaneSide): void {
    this.activePaneSide = side;
    this.infoPanelError = null;
  }

  selectTab(side: PaneSide, tabId: string): void {
    this.setActiveTabId(side, tabId);
    const tab = this.getTabs(side).find((item) => item.id === tabId);
    if (tab && tab.entries.length === 0) {
      this.loadDirectory(tab, tab.currentPath);
    }
    this.saveWorkspaces();
  }

  onPathEnter(tab: PaneTab): void {
    const side: PaneSide = tab === this.leftPane ? 'left' : 'right';
    const selected = this.getSelectedSuggestion(side);
    if (selected) {
      tab.pathInput = selected;
      this.clearSuggestions(side);
    }

    const nextPath = (tab.pathInput || '').trim();
    if (!nextPath) {
      tab.pathInput = tab.currentPath;
      return;
    }

    this.loadDirectory(tab, nextPath);
  }

  onPathInput(side: PaneSide, pane: PaneTab): void {
    this.setSuggestionIndex(side, -1);
    const local = this.buildLocalPathSuggestions(pane);
    this.setSuggestions(side, local);
    this.fetchRemoteSuggestions(side, pane, pane.pathInput);
  }

  onPathKeydown(event: KeyboardEvent, side: PaneSide, pane: PaneTab): void {
    const suggestions = this.getSuggestions(side);
    if (suggestions.length === 0) {
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      pane.pathInput = suggestions[0];
      this.clearSuggestions(side);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(this.getSuggestionIndex(side) + 1, suggestions.length - 1);
      this.setSuggestionIndex(side, next);
      pane.pathInput = suggestions[next];
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.max(this.getSuggestionIndex(side) - 1, 0);
      this.setSuggestionIndex(side, next);
      pane.pathInput = suggestions[next];
    }
  }

  applySuggestion(side: PaneSide, pane: PaneTab, suggestion: string): void {
    pane.pathInput = suggestion;
    this.clearSuggestions(side);
  }

  onSearchEnter(): void {
    if (this.globalSearchMode) {
      this.runGlobalSearch();
    }
  }

  async runGlobalSearch(): Promise<void> {
    const query = this.searchQuery.trim();
    this.globalSearchError = null;

    if (!query) {
      this.globalSearchResults = [];
      return;
    }

    this.globalSearchLoading = true;
    try {
      const result = await this.apiService.searchFiles('__global__', query, true, 250);
      this.globalSearchResults = result.matches;
    } catch (error: any) {
      this.globalSearchError = error?.message || 'Global search failed';
      this.globalSearchResults = [];
    } finally {
      this.globalSearchLoading = false;
    }
  }

  openGlobalResult(entry: FileInfo): void {
    const targetPane = this.getActiveTab(this.activePaneSide);
    if (entry.type === FileType.DIRECTORY) {
      this.loadDirectory(targetPane, entry.path);
      return;
    }

    const parent = this.getParentPath(entry.path);
    this.loadDirectory(targetPane, parent);
  }

  async checkServerConnection(): Promise<void> {
    const isHealthy = await this.apiService.checkHealth();
    if (!isHealthy) {
      this.leftPane.error = 'Cannot connect to server';
      this.rightPane.error = 'Cannot connect to server';
    }
  }

  async loadDirectory(pane: PaneTab, path: string): Promise<void> {
    pane.loading = true;
    pane.error = null;

    try {
      const listing = await this.apiService.listDirectory(path, this.showHidden);
      pane.currentPath = listing.path;
      pane.pathInput = listing.path;
      pane.title = this.pathToTabTitle(listing.path);
      pane.entries = listing.entries;
      pane.selectedFiles.clear();
      this.rememberPath(listing.path);
      if (pane === this.leftPane) {
        this.clearSuggestions('left');
      } else if (pane === this.rightPane) {
        this.clearSuggestions('right');
      }
      this.recordActivity('Navigate', listing.path);
      this.saveWorkspaces();
    } catch (error: any) {
      pane.error = error.message || 'Failed to load directory';
    } finally {
      pane.loading = false;
    }
  }

  async navigateToParent(pane: PaneTab): Promise<void> {
    const parentPath = this.getParentPath(pane.currentPath);
    if (parentPath !== pane.currentPath) {
      await this.loadDirectory(pane, parentPath);
    }
  }

  async navigateToPath(pane: PaneTab, entry: FileInfo): Promise<void> {
    if (entry.type === FileType.DIRECTORY) {
      await this.loadDirectory(pane, entry.path);
    }
  }

  toggleSelection(pane: PaneTab, entry: FileInfo): void {
    if (pane.selectedFiles.has(entry.path)) {
      pane.selectedFiles.delete(entry.path);
    } else {
      pane.selectedFiles.add(entry.path);
    }
    this.infoPanelError = null;
  }

  isSelected(pane: PaneTab, entry: FileInfo): boolean {
    return pane.selectedFiles.has(entry.path);
  }

  getVisibleEntries(pane: PaneTab): FileInfo[] {
    const query = this.searchQuery.trim();
    if (!query) {
      return pane.entries;
    }

    const tokens = query.split(/\s+/).filter(Boolean);
    return pane.entries.filter((entry) => this.matchesAllTokens(entry, tokens));
  }

  async refresh(pane: PaneTab): Promise<void> {
    await this.loadDirectory(pane, pane.currentPath);
  }

  async deleteSelected(pane: PaneTab): Promise<void> {
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
        alert(`Failed to delete ${path}: ${error.message}`);
      }
    }

    await this.refresh(pane);
    await this.loadProtectedPaths();
  }

  async createNewFolder(pane: PaneTab): Promise<void> {
    const folderName = prompt('Enter folder name:');
    if (!folderName) {
      return;
    }

    const newPath = `${pane.currentPath}/${folderName}`.replace('//', '/');

    try {
      await this.apiService.createDirectory(newPath, false);
      await this.refresh(pane);
      await this.loadProtectedPaths();
      this.recordActivity('Create Folder', newPath);
    } catch (error: any) {
      alert(`Failed to create folder: ${error.message}`);
    }
  }

  async copyToOtherPane(sourcePane: PaneTab, targetPane: PaneTab): Promise<void> {
    if (sourcePane.selectedFiles.size === 0) {
      alert('No files selected');
      return;
    }

    for (const sourcePath of Array.from(sourcePane.selectedFiles)) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');

      try {
        await this.apiService.copyFile(sourcePath, destPath, true);
        this.recordActivity('Copy', `${sourcePath} -> ${destPath}`);
      } catch (error: any) {
        alert(`Failed to copy ${sourcePath}: ${error.message}`);
      }
    }

    await this.refresh(targetPane);
    await this.loadProtectedPaths();
  }

  async moveToOtherPane(sourcePane: PaneTab, targetPane: PaneTab): Promise<void> {
    if (sourcePane.selectedFiles.size === 0) {
      alert('No files selected');
      return;
    }

    for (const sourcePath of Array.from(sourcePane.selectedFiles)) {
      const fileName = sourcePath.split('/').pop() || 'file';
      const destPath = `${targetPane.currentPath}/${fileName}`.replace('//', '/');

      try {
        await this.apiService.moveFile(sourcePath, destPath);
        this.recordActivity('Move', `${sourcePath} -> ${destPath}`);
      } catch (error: any) {
        alert(`Failed to move ${sourcePath}: ${error.message}`);
      }
    }

    await this.refresh(sourcePane);
    await this.refresh(targetPane);
    await this.loadProtectedPaths();
  }

  async archiveSelected(pane: PaneTab): Promise<void> {
    if (pane.selectedFiles.size === 0) {
      alert('Select files or folders to archive.');
      return;
    }
    const defaultName = `archive-${Date.now()}.zip`;
    const defaultPath = this.joinPath(pane.currentPath, defaultName);
    const archivePath = prompt('Archive output path:', defaultPath);
    if (!archivePath) {
      return;
    }
    try {
      await this.apiService.createArchive(Array.from(pane.selectedFiles), archivePath);
      this.recordActivity('Archive', `Created: ${archivePath}`);
      await this.refresh(pane);
    } catch (error: any) {
      alert(`Archive creation failed: ${error?.message || 'Unknown error'}`);
    }
  }

  async extractSelectedArchive(pane: PaneTab): Promise<void> {
    if (pane.selectedFiles.size !== 1) {
      alert('Select exactly one archive file to extract.');
      return;
    }
    const archivePath = Array.from(pane.selectedFiles)[0];
    const defaultDest = this.joinPath(pane.currentPath, 'extracted');
    const destinationPath = prompt('Extract destination path:', defaultDest);
    if (!destinationPath) {
      return;
    }
    try {
      await this.apiService.extractArchive(archivePath, destinationPath);
      this.recordActivity('Archive', `Extracted: ${archivePath} -> ${destinationPath}`);
      await this.refresh(pane);
    } catch (error: any) {
      alert(`Archive extraction failed: ${error?.message || 'Unknown error'}`);
    }
  }

  async protectSelected(pane: PaneTab): Promise<void> {
    if (pane.selectedFiles.size === 0) {
      return;
    }

    for (const path of Array.from(pane.selectedFiles)) {
      try {
        await this.apiService.protectPath(path);
        this.recordActivity('Protect', path);
      } catch (error: any) {
        alert(`Failed to protect ${path}: ${error.message}`);
      }
    }

    await this.loadProtectedPaths();
  }

  async unprotectSelected(pane: PaneTab): Promise<void> {
    if (pane.selectedFiles.size === 0) {
      return;
    }

    for (const path of Array.from(pane.selectedFiles)) {
      try {
        await this.apiService.unprotectPath(path);
        this.recordActivity('Unprotect', path);
      } catch (error: any) {
        alert(`Failed to unprotect ${path}: ${error.message}`);
      }
    }

    await this.loadProtectedPaths();
  }

  isProtectedEntry(entry: FileInfo): boolean {
    const entryPath = this.normalizePathForCompare(entry.path);
    for (const protectedPath of this.protectedPaths) {
      const p = this.normalizePathForCompare(protectedPath);
      if (entryPath === p || entryPath.startsWith(`${p}/`) || entryPath.startsWith(`${p}\\`)) {
        return true;
      }
    }
    return false;
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
      return 'DIR';
    }

    if (entry.type === FileType.SYMLINK) {
      return 'LNK';
    }

    const ext = entry.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt':
      case 'md':
        return 'TXT';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'IMG';
      case 'pdf':
        return 'PDF';
      case 'zip':
      case 'tar':
      case 'gz':
        return 'ZIP';
      case 'mp3':
      case 'wav':
        return 'AUD';
      case 'mp4':
      case 'avi':
        return 'VID';
      default:
        return 'FILE';
    }
  }

  async toggleShowHidden(): Promise<void> {
    this.activeWorkspace.showHidden = !this.activeWorkspace.showHidden;
    await this.refresh(this.leftPane);
    await this.refresh(this.rightPane);
    this.saveWorkspaces();
  }

  getActiveSelectedEntry(): FileInfo | null {
    const pane = this.activePaneSide === 'left' ? this.leftPane : this.rightPane;
    if (pane.selectedFiles.size === 0) {
      return null;
    }
    const selectedPath = Array.from(pane.selectedFiles)[0];
    return pane.entries.find((e) => e.path === selectedPath) ?? null;
  }

  async openQuickView(): Promise<void> {
    const entry = this.getActiveSelectedEntry();
    if (!entry) {
      this.quickViewError = 'Select a file first.';
      this.quickViewOpen = true;
      return;
    }

    if (entry.type === FileType.DIRECTORY) {
      this.quickViewError = 'Quick View is available for files only.';
      this.quickViewOpen = true;
      return;
    }

    this.quickViewOpen = true;
    this.quickViewLoading = true;
    this.quickViewError = null;
    this.quickViewText = '';
    this.quickViewDataUrl = null;
    this.quickViewTitle = entry.name;
    this.quickViewKind = 'none';

    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const textExt = new Set([
      'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'html', 'xml', 'yml', 'yaml', 'toml', 'rs',
      'py', 'java', 'cs', 'cpp', 'c', 'h', 'log', 'ini', 'csv'
    ]);
    const imageExt = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
    const audioExt = new Set(['mp3', 'wav', 'ogg', 'm4a']);
    const videoExt = new Set(['mp4', 'webm', 'mov', 'mkv']);

    try {
      if (textExt.has(ext)) {
        const content = await this.apiService.readFile(entry.path, 'utf8');
        this.quickViewKind = 'text';
        this.quickViewText = content.content.slice(0, 120_000);
      } else if (imageExt.has(ext) || audioExt.has(ext) || videoExt.has(ext) || ext === 'pdf') {
        if (entry.size > 8 * 1024 * 1024) {
          throw new Error('File is too large for Quick View (limit: 8MB).');
        }
        const content = await this.apiService.readFile(entry.path, 'base64');
        const mime = this.getMimeType(ext);
        this.quickViewDataUrl = `data:${mime};base64,${content.content}`;
        this.quickViewKind = ext === 'pdf'
          ? 'pdf'
          : imageExt.has(ext)
            ? 'image'
            : audioExt.has(ext)
              ? 'audio'
              : 'video';
      } else {
        throw new Error(`Preview not supported for .${ext || 'unknown'} files.`);
      }
    } catch (error: any) {
      this.quickViewError = error?.message || 'Failed to load preview.';
    } finally {
      this.quickViewLoading = false;
    }
  }

  closeQuickView(): void {
    this.quickViewOpen = false;
    this.quickViewLoading = false;
    this.quickViewError = null;
    this.quickViewKind = 'none';
    this.quickViewText = '';
    this.quickViewDataUrl = null;
  }

  setPanelMode(mode: PanelMode): void {
    this.panelMode = mode;
  }

  get selectedNote(): NoteItem | null {
    return this.notes.find((n) => n.id === this.selectedNoteId) ?? null;
  }

  get pinnedNotes(): NoteItem[] {
    return this.notes.filter((n) => n.pinned);
  }

  get protectedNotes(): NoteItem[] {
    return this.notes.filter((n) => n.protected);
  }

  createNote(): void {
    const title = this.noteDraftTitle.trim() || 'Untitled Note';
    const body = this.noteDraftBody;
    const tags = this.parseTags(this.noteDraftTags);
    const linkedPath = this.noteDraftLinkedPath.trim() || this.getActiveSelectedEntry()?.path || undefined;
    const now = Date.now();
    const note: NoteItem = {
      id: this.nextId('note'),
      title,
      body,
      tags,
      linkedPath,
      pinned: false,
      protected: false,
      createdAt: now,
      updatedAt: now,
    };
    this.notes.unshift(note);
    this.selectedNoteId = note.id;
    this.noteDraftTitle = '';
    this.noteDraftBody = '';
    this.noteDraftTags = '';
    this.noteDraftLinkedPath = '';
    this.saveNotes();
    this.recordActivity('Note', `Created: ${note.title}`);
  }

  selectNote(noteId: string): void {
    this.selectedNoteId = noteId;
  }

  updateSelectedNote(title: string, body: string, tagsRaw: string, linkedPathRaw: string): void {
    const note = this.selectedNote;
    if (!note || note.protected) {
      return;
    }
    note.title = title.trim() || 'Untitled Note';
    note.body = body;
    note.tags = this.parseTags(tagsRaw);
    note.linkedPath = linkedPathRaw.trim() || undefined;
    note.updatedAt = Date.now();
    this.saveNotes();
  }

  setCreateNoteLinkFromSelection(): void {
    const selected = this.getActiveSelectedEntry();
    if (!selected) {
      return;
    }
    this.noteDraftLinkedPath = selected.path;
  }

  setSelectedNoteLinkFromSelection(note: NoteItem): void {
    if (note.protected) {
      return;
    }
    const selected = this.getActiveSelectedEntry();
    if (!selected) {
      return;
    }
    note.linkedPath = selected.path;
    note.updatedAt = Date.now();
    this.saveNotes();
  }

  async openNoteLinkedPath(note: NoteItem): Promise<void> {
    if (!note.linkedPath) {
      return;
    }
    const pane = this.getActiveTab(this.activePaneSide);
    try {
      await this.loadDirectory(pane, note.linkedPath);
      this.recordActivity('Note', `Opened link: ${note.linkedPath}`);
      return;
    } catch {
      // Ignore and try parent path for file links.
    }

    const parent = this.getParentPath(note.linkedPath);
    await this.loadDirectory(pane, parent);
    pane.selectedFiles.clear();
    pane.selectedFiles.add(note.linkedPath);
    this.recordActivity('Note', `Opened link parent: ${note.linkedPath}`);
  }

  togglePin(note: NoteItem): void {
    note.pinned = !note.pinned;
    note.updatedAt = Date.now();
    this.saveNotes();
    this.recordActivity('Note', `${note.pinned ? 'Pinned' : 'Unpinned'}: ${note.title}`);
  }

  toggleProtectNote(note: NoteItem): void {
    note.protected = !note.protected;
    note.updatedAt = Date.now();
    this.saveNotes();
    this.recordActivity('Note', `${note.protected ? 'Protected' : 'Unprotected'}: ${note.title}`);
  }

  deleteNote(note: NoteItem): void {
    if (note.protected) {
      return;
    }
    this.notes = this.notes.filter((n) => n.id !== note.id);
    if (this.selectedNoteId === note.id) {
      this.selectedNoteId = this.notes[0]?.id ?? null;
    }
    this.saveNotes();
    this.recordActivity('Note', `Deleted: ${note.title}`);
  }

  setGlobalSearchMode(enabled: boolean): void {
    this.globalSearchMode = enabled;
    this.globalSearchError = null;
    this.globalSearchResults = [];
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ' && !event.ctrlKey) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') {
        event.preventDefault();
        this.openQuickView();
      }
      return;
    }

    if (!event.ctrlKey) {
      return;
    }

    const key = event.key.toLowerCase();
    const side = this.activePaneSide;
    const tabs = this.getTabs(side);
    const activeIndex = tabs.findIndex((tab) => tab.id === this.getActiveTabId(side));

    if (key === 't') {
      event.preventDefault();
      this.createTab(side);
      return;
    }

    if (key === 'w') {
      event.preventDefault();
      this.closeTab(side, this.getActiveTabId(side));
      return;
    }

    if (key === 'tab') {
      event.preventDefault();
      if (tabs.length > 0) {
        const nextIndex = (activeIndex + 1 + tabs.length) % tabs.length;
        this.selectTab(side, tabs[nextIndex].id);
      }
      return;
    }

    if (event.shiftKey && key === 'n') {
      event.preventDefault();
      this.createWorkspace();
      return;
    }

    const tabNumber = Number.parseInt(key, 10);
    if (!Number.isNaN(tabNumber) && tabNumber >= 1 && tabNumber <= 9) {
      event.preventDefault();
      const target = tabs[tabNumber - 1];
      if (target) {
        this.selectTab(side, target.id);
      }
    }
  }

  private initializeState(): void {
    const restored = this.loadWorkspaces();
    if (restored.length > 0) {
      this.workspaces = restored;
      this.currentWorkspaceId = restored[0].id;
      return;
    }

    const ws = this.createWorkspaceState('Default', this.getHomePath());
    this.workspaces = [ws];
    this.currentWorkspaceId = ws.id;
    this.saveWorkspaces();
  }

  private ensureWorkspaceLoaded(): void {
    const left = this.leftPane;
    const right = this.rightPane;

    if (left.entries.length === 0 && !left.loading) {
      this.loadDirectory(left, left.currentPath);
    }

    if (right.entries.length === 0 && !right.loading) {
      this.loadDirectory(right, right.currentPath);
    }
  }

  private createWorkspaceState(name: string, initialPath: string): Workspace {
    const left = this.createPaneTab(initialPath, 'Left');
    const right = this.createPaneTab(initialPath, 'Right');

    return {
      id: this.nextId('ws'),
      name,
      leftTabs: [left],
      rightTabs: [right],
      activeLeftTabId: left.id,
      activeRightTabId: right.id,
      showHidden: false,
      pathHistory: [initialPath],
      actions: [],
    };
  }

  private createPaneTab(path: string, title?: string, id?: string): PaneTab {
    const normalizedPath = path || '/';
    return {
      id: id ?? this.nextId('tab'),
      title: title ?? this.pathToTabTitle(normalizedPath),
      currentPath: normalizedPath,
      pathInput: normalizedPath,
      entries: [],
      selectedFiles: new Set<string>(),
      loading: false,
      error: null,
    };
  }

  private getTabs(side: PaneSide): PaneTab[] {
    return side === 'left' ? this.activeWorkspace.leftTabs : this.activeWorkspace.rightTabs;
  }

  private getActiveTab(side: PaneSide): PaneTab {
    const tabs = this.getTabs(side);
    const activeId = this.getActiveTabId(side);
    const existing = tabs.find((tab) => tab.id === activeId);

    if (existing) {
      return existing;
    }

    const fallback = tabs[0];
    this.setActiveTabId(side, fallback.id);
    return fallback;
  }

  private getActiveTabId(side: PaneSide): string {
    return side === 'left' ? this.activeWorkspace.activeLeftTabId : this.activeWorkspace.activeRightTabId;
  }

  private setActiveTabId(side: PaneSide, id: string): void {
    if (side === 'left') {
      this.activeWorkspace.activeLeftTabId = id;
    } else {
      this.activeWorkspace.activeRightTabId = id;
    }
  }

  private loadWorkspaces(): Workspace[] {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return [];
    }

    try {
      const snapshots = JSON.parse(raw) as WorkspaceSnapshot[];
      return snapshots
        .map((snap) => {
          const leftTabs = snap.leftTabs.map((tab) => this.createPaneTab(tab.currentPath, tab.title, tab.id));
          const rightTabs = snap.rightTabs.map((tab) => this.createPaneTab(tab.currentPath, tab.title, tab.id));

          if (leftTabs.length === 0 || rightTabs.length === 0) {
            return null;
          }

          return {
            id: snap.id,
            name: snap.name,
            leftTabs,
            rightTabs,
            activeLeftTabId: leftTabs.some((t) => t.id === snap.activeLeftTabId)
              ? snap.activeLeftTabId
              : leftTabs[0].id,
            activeRightTabId: rightTabs.some((t) => t.id === snap.activeRightTabId)
              ? snap.activeRightTabId
              : rightTabs[0].id,
            showHidden: !!snap.showHidden,
            pathHistory: Array.isArray(snap.pathHistory) ? snap.pathHistory.slice(0, 300) : [],
            actions: Array.isArray(snap.actions) ? snap.actions : [],
          } satisfies Workspace;
        })
        .filter((item): item is Workspace => item !== null);
    } catch {
      return [];
    }
  }

  private saveWorkspaces(): void {
    const snapshots: WorkspaceSnapshot[] = this.workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      leftTabs: ws.leftTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        currentPath: tab.currentPath,
      })),
      rightTabs: ws.rightTabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        currentPath: tab.currentPath,
      })),
      activeLeftTabId: ws.activeLeftTabId,
      activeRightTabId: ws.activeRightTabId,
      showHidden: ws.showHidden,
      pathHistory: ws.pathHistory,
      actions: ws.actions,
    }));

    localStorage.setItem(this.storageKey, JSON.stringify(snapshots));
  }

  private pathToTabTitle(path: string): string {
    if (path === '/' || path === '') {
      return '/';
    }

    const normalized = path.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : normalized;
  }

  private getParentPath(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    if (normalized === '/' || normalized === '') {
      return '/';
    }

    if (/^[a-z]:\/?$/i.test(normalized)) {
      return normalized.endsWith('/') ? normalized : `${normalized}/`;
    }

    const parts = normalized.split('/').filter((p) => p.length > 0);
    if (parts.length === 0) {
      return '/';
    }

    const drive = parts[0].endsWith(':') ? parts[0] : null;
    parts.pop();
    if (parts.length === 0) {
      return drive ? `${drive}/` : '/';
    }
    if (drive) {
      return `${parts[0]}/${parts.slice(1).join('/')}`.replace(/\/$/, '');
    }
    return '/' + parts.join('/');
  }

  private getHomePath(): string {
    return '/';
  }

  private nextId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private parseTags(raw: string): string[] {
    return raw
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
  }

  private loadNotes(): void {
    try {
      const raw = localStorage.getItem(this.notesStorageKey);
      if (!raw) {
        this.notes = [];
        return;
      }
      const parsed = JSON.parse(raw) as NoteItem[];
      this.notes = Array.isArray(parsed) ? parsed : [];
      this.selectedNoteId = this.notes[0]?.id ?? null;
    } catch {
      this.notes = [];
      this.selectedNoteId = null;
    }
  }

  private saveNotes(): void {
    localStorage.setItem(this.notesStorageKey, JSON.stringify(this.notes));
  }

  private loadActivityLog(): void {
    try {
      const raw = localStorage.getItem(this.activityStorageKey);
      if (!raw) {
        this.activityLog = [];
        return;
      }
      const parsed = JSON.parse(raw) as ActivityItem[];
      this.activityLog = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.activityLog = [];
    }
  }

  private recordActivity(action: string, details: string): void {
    const item: ActivityItem = {
      id: this.nextId('act'),
      timestamp: Date.now(),
      action,
      details,
    };
    this.activityLog.unshift(item);
    if (this.activityLog.length > 400) {
      this.activityLog.length = 400;
    }
    localStorage.setItem(this.activityStorageKey, JSON.stringify(this.activityLog));
  }

  private async loadShares(): Promise<void> {
    try {
      const data = await this.apiService.listShares();
      this.activeShares = data.items;
    } catch {
      this.activeShares = [];
    }
  }

  private async loadProtectedPaths(): Promise<void> {
    try {
      const data = await this.apiService.listProtectedPaths();
      this.protectedPaths = new Set(data.items);
    } catch {
      this.protectedPaths = new Set<string>();
    }
  }

  private normalizePathForCompare(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }

  private buildLocalPathSuggestions(pane: PaneTab): string[] {
    const input = pane.pathInput.trim();
    const suggestions = new Set<string>();
    const history = this.activeWorkspace.pathHistory ?? [];
    const normalizedInput = input.replace(/\\/g, '/').toLowerCase();

    for (const item of history) {
      const normalized = item.replace(/\\/g, '/').toLowerCase();
      if (!normalizedInput || normalized.startsWith(normalizedInput)) {
        suggestions.add(item);
      }
      if (suggestions.size >= 10) {
        break;
      }
    }

    const dirs = pane.entries.filter((e) => e.type === FileType.DIRECTORY);
    for (const entry of dirs) {
      const candidate = this.joinPath(pane.currentPath, entry.name);
      const normalized = candidate.replace(/\\/g, '/').toLowerCase();
      if (!normalizedInput || normalized.includes(normalizedInput)) {
        suggestions.add(candidate);
      }
      if (suggestions.size >= 20) {
        break;
      }
    }

    return Array.from(suggestions).slice(0, 20);
  }

  private async fetchRemoteSuggestions(side: PaneSide, pane: PaneTab, rawInput: string): Promise<void> {
    const input = rawInput.trim();
    if (!input) {
      return;
    }

    const requestId = this.nextSuggestRequestId(side);
    try {
      const response = await this.apiService.suggestPaths(input, pane.currentPath, 20);
      if (requestId !== this.getSuggestRequestId(side)) {
        return;
      }

      const merged = new Set<string>(this.getSuggestions(side));
      for (const candidate of response.suggestions) {
        merged.add(candidate);
      }
      this.setSuggestions(side, Array.from(merged).slice(0, 25));
    } catch {
      // Ignore remote suggestion failures and keep local suggestions.
    }
  }

  private joinPath(base: string, name: string): string {
    if (!base || base === '/') {
      return `/${name}`.replace(/\/{2,}/g, '/');
    }
    if (/^[a-z]:\/?$/i.test(base)) {
      return `${base.replace(/\/?$/, '/')}${name}`;
    }
    return `${base}/${name}`.replace(/\/{2,}/g, '/');
  }

  private rememberPath(path: string): void {
    const history = this.activeWorkspace.pathHistory;
    const existingIndex = history.findIndex((p) => p === path);
    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }
    history.unshift(path);
    if (history.length > 300) {
      history.length = 300;
    }
  }

  private getSuggestions(side: PaneSide): string[] {
    return side === 'left' ? this.leftPathSuggestions : this.rightPathSuggestions;
  }

  private setSuggestions(side: PaneSide, suggestions: string[]): void {
    if (side === 'left') {
      this.leftPathSuggestions = suggestions;
    } else {
      this.rightPathSuggestions = suggestions;
    }
  }

  private getSuggestionIndex(side: PaneSide): number {
    return side === 'left' ? this.leftSuggestionIndex : this.rightSuggestionIndex;
  }

  private setSuggestionIndex(side: PaneSide, index: number): void {
    if (side === 'left') {
      this.leftSuggestionIndex = index;
    } else {
      this.rightSuggestionIndex = index;
    }
  }

  private getSelectedSuggestion(side: PaneSide): string | null {
    const suggestions = this.getSuggestions(side);
    const idx = this.getSuggestionIndex(side);
    if (idx < 0 || idx >= suggestions.length) {
      return null;
    }
    return suggestions[idx];
  }

  private clearSuggestions(side: PaneSide): void {
    if (side === 'left') {
      this.leftPathSuggestions = [];
      this.leftSuggestionIndex = -1;
      this.leftSuggestRequestId += 1;
    } else {
      this.rightPathSuggestions = [];
      this.rightSuggestionIndex = -1;
      this.rightSuggestRequestId += 1;
    }
  }

  private nextSuggestRequestId(side: PaneSide): number {
    if (side === 'left') {
      this.leftSuggestRequestId += 1;
      return this.leftSuggestRequestId;
    }
    this.rightSuggestRequestId += 1;
    return this.rightSuggestRequestId;
  }

  private getSuggestRequestId(side: PaneSide): number {
    return side === 'left' ? this.leftSuggestRequestId : this.rightSuggestRequestId;
  }

  private matchesAllTokens(entry: FileInfo, tokens: string[]): boolean {
    for (const rawToken of tokens) {
      const token = rawToken.toLowerCase();
      if (!this.matchesToken(entry, token)) {
        return false;
      }
    }
    return true;
  }

  private matchesToken(entry: FileInfo, token: string): boolean {
    if (token.startsWith('type:')) {
      const value = token.slice(5);
      return entry.type.toLowerCase() === value;
    }

    if (token.startsWith('ext:')) {
      const value = token.slice(4).replace(/^\./, '');
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
      return ext === value;
    }

    if (token.startsWith('size>') || token.startsWith('size<') || token.startsWith('size=')) {
      const op = token[4];
      const rhs = this.parseSizeToken(token.slice(5));
      if (rhs === null) {
        return false;
      }
      return this.compareNumbers(entry.size, op, rhs);
    }

    if (token.startsWith('modified>') || token.startsWith('modified<') || token.startsWith('modified=')) {
      const op = token[8];
      const rhsDate = Date.parse(token.slice(9));
      if (Number.isNaN(rhsDate)) {
        return false;
      }
      const lhs = entry.modified * 1000;
      return this.compareNumbers(lhs, op, rhsDate);
    }

    if (token.includes('*') || token.includes('?')) {
      const pattern = this.globToRegExp(token);
      return pattern.test(entry.name.toLowerCase()) || pattern.test(entry.path.toLowerCase());
    }

    return (
      entry.name.toLowerCase().includes(token) ||
      entry.path.toLowerCase().includes(token)
    );
  }

  private parseSizeToken(raw: string): number | null {
    const match = raw.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)?$/);
    if (!match) {
      return null;
    }

    const value = Number.parseFloat(match[1]);
    const unit = match[2] ?? 'b';
    const factors: Record<string, number> = {
      b: 1,
      kb: 1024,
      mb: 1024 ** 2,
      gb: 1024 ** 3,
      tb: 1024 ** 4,
    };
    return value * factors[unit];
  }

  private compareNumbers(lhs: number, op: string, rhs: number): boolean {
    switch (op) {
      case '>':
        return lhs > rhs;
      case '<':
        return lhs < rhs;
      case '=':
        return lhs === rhs;
      default:
        return false;
    }
  }

  private globToRegExp(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }

  private getMimeType(ext: string): string {
    switch (ext) {
      case 'png': return 'image/png';
      case 'jpg':
      case 'jpeg': return 'image/jpeg';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'bmp': return 'image/bmp';
      case 'svg': return 'image/svg+xml';
      case 'mp3': return 'audio/mpeg';
      case 'wav': return 'audio/wav';
      case 'ogg': return 'audio/ogg';
      case 'm4a': return 'audio/mp4';
      case 'mp4': return 'video/mp4';
      case 'webm': return 'video/webm';
      case 'mov': return 'video/quicktime';
      case 'mkv': return 'video/x-matroska';
      case 'pdf': return 'application/pdf';
      default: return 'application/octet-stream';
    }
  }

  private isLikelyTextFile(name: string): boolean {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const textExt = new Set([
      'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'html', 'xml', 'yml', 'yaml', 'toml',
      'rs', 'py', 'java', 'cs', 'cpp', 'c', 'h', 'log', 'ini', 'csv'
    ]);
    return textExt.has(ext);
  }
}
