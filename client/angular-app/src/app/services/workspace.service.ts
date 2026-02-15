import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  WorkspaceConfig,
  WorkspaceList,
  PaneState,
  TabInfo,
  STORAGE_KEYS,
} from '@shared/protocol-enhanced';

@Injectable({
  providedIn: 'root'
})
export class WorkspaceService {
  private workspacesSubject = new BehaviorSubject<WorkspaceList>(this.loadWorkspaces());
  public workspaces$ = this.workspacesSubject.asObservable();

  private activeWorkspaceSubject = new BehaviorSubject<WorkspaceConfig | null>(null);
  public activeWorkspace$ = this.activeWorkspaceSubject.asObservable();

  constructor() {
    this.initializeWorkspaces();
  }

  /**
   * Initialize workspaces from local storage or create default
   */
  private initializeWorkspaces(): void {
    const workspaceList = this.workspacesSubject.value;
    
    if (workspaceList.workspaces.length === 0) {
      // Create default workspace
      const defaultWorkspace = this.createDefaultWorkspace();
      workspaceList.workspaces.push(defaultWorkspace);
      workspaceList.activeWorkspaceId = defaultWorkspace.id;
      this.saveWorkspaces(workspaceList);
    }

    // Load active workspace
    const activeWorkspace = workspaceList.workspaces.find(
      w => w.id === workspaceList.activeWorkspaceId
    );
    
    if (activeWorkspace) {
      this.activeWorkspaceSubject.next(activeWorkspace);
    }
  }

  /**
   * Create a default workspace
   */
  private createDefaultWorkspace(): WorkspaceConfig {
    const now = Date.now();
    const homePath = this.getHomePath();

    return {
      id: this.generateId(),
      name: 'Default Workspace',
      icon: '🏠',
      color: '#007acc',
      leftPane: this.createDefaultPane('left', homePath),
      rightPane: this.createDefaultPane('right', homePath),
      showHidden: false,
      createdAt: now,
      lastAccessedAt: now,
    };
  }

  /**
   * Create a default pane with one tab
   */
  private createDefaultPane(paneId: string, path: string): PaneState {
    const tabId = this.generateId();
    return {
      id: paneId,
      tabs: [{
        id: tabId,
        title: this.getPathTitle(path),
        path,
        isActive: true,
        isPinned: false,
        createdAt: Date.now(),
      }],
      activeTabId: tabId,
    };
  }

  /**
   * Load workspaces from local storage
   */
  private loadWorkspaces(): WorkspaceList {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load workspaces:', error);
    }

    return {
      workspaces: [],
      activeWorkspaceId: '',
    };
  }

  /**
   * Save workspaces to local storage
   */
  private saveWorkspaces(workspaceList: WorkspaceList): void {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(workspaceList));
      this.workspacesSubject.next(workspaceList);
    } catch (error) {
      console.error('Failed to save workspaces:', error);
    }
  }

  /**
   * Get current workspace list
   */
  getWorkspaces(): WorkspaceList {
    return this.workspacesSubject.value;
  }

  /**
   * Get active workspace
   */
  getActiveWorkspace(): WorkspaceConfig | null {
    return this.activeWorkspaceSubject.value;
  }

  /**
   * Create a new workspace
   */
  createWorkspace(name: string, icon?: string, color?: string): WorkspaceConfig {
    const now = Date.now();
    const homePath = this.getHomePath();

    const workspace: WorkspaceConfig = {
      id: this.generateId(),
      name,
      icon: icon || '📁',
      color: color || '#007acc',
      leftPane: this.createDefaultPane('left', homePath),
      rightPane: this.createDefaultPane('right', homePath),
      showHidden: false,
      createdAt: now,
      lastAccessedAt: now,
    };

    const workspaceList = this.workspacesSubject.value;
    workspaceList.workspaces.push(workspace);
    this.saveWorkspaces(workspaceList);

    return workspace;
  }

  /**
   * Switch to a different workspace
   */
  switchWorkspace(workspaceId: string): boolean {
    const workspaceList = this.workspacesSubject.value;
    const workspace = workspaceList.workspaces.find(w => w.id === workspaceId);

    if (!workspace) {
      return false;
    }

    workspace.lastAccessedAt = Date.now();
    workspaceList.activeWorkspaceId = workspaceId;
    this.saveWorkspaces(workspaceList);
    this.activeWorkspaceSubject.next(workspace);

    return true;
  }

  /**
   * Update workspace configuration
   */
  updateWorkspace(workspaceId: string, updates: Partial<WorkspaceConfig>, silent: boolean = false): boolean {
    const workspaceList = this.workspacesSubject.value;
    const workspace = workspaceList.workspaces.find(w => w.id === workspaceId);

    if (!workspace) {
      return false;
    }

    Object.assign(workspace, updates);
    this.saveWorkspaces(workspaceList);

    // Update active workspace if it's the one being modified (unless silent)
    if (!silent && workspace.id === this.activeWorkspaceSubject.value?.id) {
      this.activeWorkspaceSubject.next(workspace);
    }

    return true;
  }

  /**
   * Delete a workspace
   */
  deleteWorkspace(workspaceId: string): boolean {
    const workspaceList = this.workspacesSubject.value;
    const index = workspaceList.workspaces.findIndex(w => w.id === workspaceId);

    if (index === -1 || workspaceList.workspaces.length <= 1) {
      return false; // Can't delete last workspace
    }

    workspaceList.workspaces.splice(index, 1);

    // If deleting active workspace, switch to first available
    if (workspaceList.activeWorkspaceId === workspaceId) {
      const newActive = workspaceList.workspaces[0];
      workspaceList.activeWorkspaceId = newActive.id;
      this.activeWorkspaceSubject.next(newActive);
    }

    this.saveWorkspaces(workspaceList);
    return true;
  }

  /**
   * Add a new tab to a pane
   */
  addTab(paneId: string, path: string, activate: boolean = true): TabInfo | null {
    const workspace = this.activeWorkspaceSubject.value;
    if (!workspace) return null;

    const pane = paneId === 'left' ? workspace.leftPane : workspace.rightPane;
    
    const newTab: TabInfo = {
      id: this.generateId(),
      title: this.getPathTitle(path),
      path,
      isActive: activate,
      isPinned: false,
      createdAt: Date.now(),
    };

    // Deactivate other tabs if activating this one
    if (activate) {
      pane.tabs.forEach(tab => tab.isActive = false);
      pane.activeTabId = newTab.id;
    }

    pane.tabs.push(newTab);
    this.updateWorkspace(workspace.id, { [paneId === 'left' ? 'leftPane' : 'rightPane']: pane });

    return newTab;
  }

  /**
   * Close a tab
   */
  closeTab(paneId: string, tabId: string): boolean {
    const workspace = this.activeWorkspaceSubject.value;
    if (!workspace) return false;

    const pane = paneId === 'left' ? workspace.leftPane : workspace.rightPane;
    const tabIndex = pane.tabs.findIndex(t => t.id === tabId);

    if (tabIndex === -1 || pane.tabs.length <= 1) {
      return false; // Can't close last tab
    }

    const wasActive = pane.tabs[tabIndex].isActive;
    pane.tabs.splice(tabIndex, 1);

    // If closed tab was active, activate another
    if (wasActive && pane.tabs.length > 0) {
      const newActiveIndex = Math.min(tabIndex, pane.tabs.length - 1);
      pane.tabs[newActiveIndex].isActive = true;
      pane.activeTabId = pane.tabs[newActiveIndex].id;
    }

    this.updateWorkspace(workspace.id, { [paneId === 'left' ? 'leftPane' : 'rightPane']: pane });
    return true;
  }

  /**
   * Switch to a different tab
   */
  switchTab(paneId: string, tabId: string): boolean {
    const workspace = this.activeWorkspaceSubject.value;
    if (!workspace) return false;

    const pane = paneId === 'left' ? workspace.leftPane : workspace.rightPane;
    const tab = pane.tabs.find(t => t.id === tabId);

    if (!tab) return false;

    // Deactivate all tabs
    pane.tabs.forEach(t => t.isActive = false);
    
    // Activate selected tab
    tab.isActive = true;
    pane.activeTabId = tabId;

    this.updateWorkspace(workspace.id, { [paneId === 'left' ? 'leftPane' : 'rightPane']: pane });
    return true;
  }

  /**
   * Update tab path (when navigating)
   */
  updateTabPath(paneId: string, tabId: string, path: string): boolean {
    const workspace = this.activeWorkspaceSubject.value;
    if (!workspace) return false;

    const pane = paneId === 'left' ? workspace.leftPane : workspace.rightPane;
    const tab = pane.tabs.find(t => t.id === tabId);

    if (!tab) return false;

    tab.path = path;
    tab.title = this.getPathTitle(path);

    // Use silent mode to avoid triggering workspace reload
    this.updateWorkspace(workspace.id, { [paneId === 'left' ? 'leftPane' : 'rightPane']: pane }, true);
    return true;
  }

  /**
   * Toggle tab pin status
   */
  toggleTabPin(paneId: string, tabId: string): boolean {
    const workspace = this.activeWorkspaceSubject.value;
    if (!workspace) return false;

    const pane = paneId === 'left' ? workspace.leftPane : workspace.rightPane;
    const tab = pane.tabs.find(t => t.id === tabId);

    if (!tab) return false;

    tab.isPinned = !tab.isPinned;

    this.updateWorkspace(workspace.id, { [paneId === 'left' ? 'leftPane' : 'rightPane']: pane });
    return true;
  }

  /**
   * Get active tab for a pane
   */
  getActiveTab(paneId: string): TabInfo | null {
    const workspace = this.activeWorkspaceSubject.value;
    if (!workspace) return null;

    const pane = paneId === 'left' ? workspace.leftPane : workspace.rightPane;
    return pane.tabs.find(t => t.id === pane.activeTabId) || null;
  }

  /**
   * Get all tabs for a pane
   */
  getTabs(paneId: string): TabInfo[] {
    const workspace = this.activeWorkspaceSubject.value;
    if (!workspace) return [];

    const pane = paneId === 'left' ? workspace.leftPane : workspace.rightPane;
    return pane.tabs;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getHomePath(): string {
    return '/';
  }

  private getPathTitle(path: string): string {
    if (path === '/' || path === '') {
      return 'Root';
    }
    
    const parts = path.split('/').filter(p => p.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : 'Root';
  }
}
