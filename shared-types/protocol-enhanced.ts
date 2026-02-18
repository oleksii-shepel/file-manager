/**
 * Enhanced protocol definitions with Phase 1 features:
 * - Tabs
 * - Workspaces
 * - Address Bar
 * - Item Filter
 */

// Re-export everything from the base protocol so consumers only need one import.
export * from '../shared-types/protocol';

// ============================================================================
// Tab Management
// ============================================================================

export interface TabInfo {
  id: string;
  title: string;
  path: string;
  isActive: boolean;
  isPinned: boolean;
  createdAt: number;
}

export interface PaneState {
  /** e.g. 'left' | 'right' */
  id: string;
  tabs: TabInfo[];
  activeTabId: string;
}

// ============================================================================
// Workspace Management
// ============================================================================

export interface WorkspaceConfig {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  leftPane: PaneState;
  rightPane: PaneState;
  showHidden: boolean;
  createdAt: number;
  lastAccessedAt: number;
}

export interface WorkspaceList {
  workspaces: WorkspaceConfig[];
  activeWorkspaceId: string;
}

// ============================================================================
// Filter System
// ============================================================================

export enum FilterType {
  NAME = 'name',
  EXTENSION = 'ext',
  TYPE = 'type',
  SIZE = 'size',
  MODIFIED = 'modified',
  GLOB = 'glob',
}

export interface FilterCriteria {
  type: FilterType;
  value: string;
  operator?:
    | 'equals'
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'gt'
    | 'lt'
    | 'gte'
    | 'lte';
}

export interface FilterQuery {
  /** Simple text search across file names */
  text?: string;
  /** Advanced multi-criteria filters */
  criteria?: FilterCriteria[];
  caseSensitive?: boolean;
}

// ============================================================================
// Enhanced Commands
// ============================================================================

export enum EnhancedCommandType {
  // Workspace commands
  SAVE_WORKSPACE = 'SAVE_WORKSPACE',
  LOAD_WORKSPACE = 'LOAD_WORKSPACE',
  DELETE_WORKSPACE = 'DELETE_WORKSPACE',
  LIST_WORKSPACES = 'LIST_WORKSPACES',

  // Tab commands
  SAVE_TAB_STATE = 'SAVE_TAB_STATE',
  LOAD_TAB_STATE = 'LOAD_TAB_STATE',

  // Filter commands (client-side mostly, but may need server for complex patterns)
  APPLY_FILTER = 'APPLY_FILTER',
}

export interface SaveWorkspaceCommand {
  type: EnhancedCommandType.SAVE_WORKSPACE;
  workspace: WorkspaceConfig;
}

export interface LoadWorkspaceCommand {
  type: EnhancedCommandType.LOAD_WORKSPACE;
  workspaceId: string;
}

export interface DeleteWorkspaceCommand {
  type: EnhancedCommandType.DELETE_WORKSPACE;
  workspaceId: string;
}

export interface ListWorkspacesCommand {
  type: EnhancedCommandType.LIST_WORKSPACES;
}

// ============================================================================
// Local Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  WORKSPACES: 'filemanager:workspaces',
  ACTIVE_WORKSPACE: 'filemanager:active-workspace',
  TAB_STATE_PREFIX: 'filemanager:tabs:',
  PREFERENCES: 'filemanager:preferences',
  HISTORY: 'filemanager:history',
} as const;

// ============================================================================
// User Preferences
// ============================================================================

export interface UserPreferences {
  theme: 'dark' | 'light' | 'auto';
  defaultShowHidden: boolean;
  defaultSortBy: 'name' | 'size' | 'modified' | 'type';
  defaultSortOrder: 'asc' | 'desc';
  enableKeyboardShortcuts: boolean;
  doubleClickAction: 'open' | 'preview';
  confirmDelete: boolean;
}

// ============================================================================
// Navigation History
// ============================================================================

export interface HistoryEntry {
  path: string;
  timestamp: number;
  paneId: string;
}

export interface NavigationHistory {
  entries: HistoryEntry[];
  maxEntries: number;
}