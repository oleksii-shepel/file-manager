# File Browser Component Refactoring Plan

## Current Structure
```
file-browser.component.ts (1000+ lines)
├── Toolbar
├── Workspace Selector
├── Left Pane
│   ├── Tab Bar
│   ├── Address Bar
│   ├── Filter Bar
│   ├── Action Bar
│   └── File List
└── Right Pane
    ├── Tab Bar
    ├── Address Bar
    ├── Filter Bar
    ├── Action Bar
    └── File List
```

## Proposed Component Breakdown

### 1. **Main Container**
```
file-browser.component.ts (100-150 lines)
├── Manages workspace state
├── Coordinates panes
└── Handles global shortcuts
```

### 2. **Toolbar Component**
```
toolbar.component.ts
├── Title
├── Workspace selector
├── Global actions (show hidden, theme, compact)
└── Emits workspace change events
```

### 3. **Workspace Selector Component**
```
workspace-selector.component.ts
├── Dropdown menu
├── List of workspaces
├── Create/Delete/Rename actions
└── Emits workspace selection events
```

### 4. **File Pane Component** ⭐ Main Reusable Component
```
file-pane.component.ts
├── Tab bar
├── Address bar (already separate)
├── Filter bar
├── Action bar
├── File list
└── State management for single pane
```

### 5. **Tab Bar Component**
```
tab-bar.component.ts
├── Tab list
├── Tab items
├── New tab button
├── Pin/close functionality
└── Emits tab events
```

### 6. **Filter Bar Component**
```
filter-bar.component.ts
├── Filter input
├── Filter count
├── Clear button
└── Emits filter changes
```

### 7. **Action Bar Component**
```
action-bar.component.ts
├── Create folder button
├── Delete button
├── Copy/Move buttons
├── Context-aware (left/right pane)
└── Emits action events
```

### 8. **File List Component**
```
file-list.component.ts
├── File entry items
├── Selection handling
├── Double-click navigation
└── Keyboard navigation
```

### 9. **File Entry Component**
```
file-entry.component.ts
├── Icon
├── Name
├── Details (size, date)
├── Selection state
└── Click handlers
```

## New Component Structure

```
components/
├── file-browser/
│   ├── file-browser.component.ts           (Main container)
│   ├── file-browser.component.html
│   ├── file-browser.component.scss
│   │
│   ├── toolbar/
│   │   ├── toolbar.component.ts
│   │   ├── toolbar.component.html
│   │   └── toolbar.component.scss
│   │
│   ├── workspace-selector/
│   │   ├── workspace-selector.component.ts
│   │   ├── workspace-selector.component.html
│   │   └── workspace-selector.component.scss
│   │
│   ├── file-pane/
│   │   ├── file-pane.component.ts          (Reusable pane)
│   │   ├── file-pane.component.html
│   │   └── file-pane.component.scss
│   │
│   ├── tab-bar/
│   │   ├── tab-bar.component.ts
│   │   ├── tab-bar.component.html
│   │   ├── tab-bar.component.scss
│   │   ├── tab/
│   │   │   ├── tab.component.ts
│   │   │   ├── tab.component.html
│   │   │   └── tab.component.scss
│   │
│   ├── filter-bar/
│   │   ├── filter-bar.component.ts
│   │   ├── filter-bar.component.html
│   │   └── filter-bar.component.scss
│   │
│   ├── action-bar/
│   │   ├── action-bar.component.ts
│   │   ├── action-bar.component.html
│   │   └── action-bar.component.scss
│   │
│   ├── file-list/
│   │   ├── file-list.component.ts
│   │   ├── file-list.component.html
│   │   ├── file-list.component.scss
│   │   ├── file-entry/
│   │   │   ├── file-entry.component.ts
│   │   │   ├── file-entry.component.html
│   │   │   └── file-entry.component.scss
```

## Component Responsibilities

### Main File Browser Component
```typescript
@Component({
  selector: 'app-file-browser',
  template: `
    <div class="file-manager-enhanced">
      <app-toolbar
        [workspaces]="workspaces"
        [activeWorkspace]="activeWorkspace"
        [showHidden]="showHidden"
        (workspaceChange)="onWorkspaceChange($event)"
        (toggleHidden)="toggleShowHidden()">
      </app-toolbar>

      <div class="panes-container">
        <app-file-pane
          [paneId]="'left'"
          [workspace]="activeWorkspace"
          [showHidden]="showHidden"
          (pathChange)="onPathChange($event)">
        </app-file-pane>

        <app-file-pane
          [paneId]="'right'"
          [workspace]="activeWorkspace"
          [showHidden]="showHidden"
          (pathChange)="onPathChange($event)">
        </app-file-pane>
      </div>

      <app-path-history-viewer></app-path-history-viewer>
      <app-global-search></app-global-search>
      <app-keyboard-help></app-keyboard-help>
    </div>
  `
})
export class FileBrowserComponent {
  // Only manages:
  // - Workspace state
  // - Pane coordination
  // - Global shortcuts
}
```

### File Pane Component (Reusable)
```typescript
@Component({
  selector: 'app-file-pane',
  template: `
    <div class="pane">
      <app-tab-bar
        [tabs]="tabs"
        [activeTabId]="activeTabId"
        (tabChange)="onTabChange($event)"
        (tabClose)="onTabClose($event)"
        (newTab)="onNewTab()">
      </app-tab-bar>

      <app-address-bar-autocomplete
        [initialPath]="currentPath"
        [paneId]="paneId"
        (pathChange)="onPathChange($event)">
      </app-address-bar-autocomplete>

      <app-filter-bar
        [filterText]="filterText"
        [totalCount]="entries.length"
        [filteredCount]="filteredEntries.length"
        (filterChange)="onFilterChange($event)">
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
  `
})
export class FilePaneComponent {
  @Input() paneId: 'left' | 'right';
  @Input() workspace: WorkspaceConfig;
  @Input() showHidden: boolean;
  @Output() pathChange = new EventEmitter<string>();
  
  // Manages single pane state
}
```

### Tab Bar Component
```typescript
@Component({
  selector: 'app-tab-bar',
  template: `
    <div class="tab-bar">
      <div class="tabs">
        <app-tab
          *ngFor="let tab of tabs"
          [tab]="tab"
          [isActive]="tab.id === activeTabId"
          (click)="onTabClick(tab)"
          (close)="onTabClose(tab)"
          (pin)="onTabPin(tab)">
        </app-tab>
        
        <button class="tab-new" (click)="onNewTab()">
          +
        </button>
      </div>
    </div>
  `
})
export class TabBarComponent {
  @Input() tabs: TabInfo[];
  @Input() activeTabId: string;
  @Output() tabChange = new EventEmitter<TabInfo>();
  @Output() tabClose = new EventEmitter<TabInfo>();
  @Output() newTab = new EventEmitter<void>();
}
```

### File List Component
```typescript
@Component({
  selector: 'app-file-list',
  template: `
    <div class="pane-content">
      <div *ngIf="loading" class="loading">Loading...</div>
      <div *ngIf="error" class="error">{{ error }}</div>
      
      <div *ngIf="!loading && !error" class="file-list">
        <app-file-entry
          *ngFor="let entry of entries"
          [entry]="entry"
          [selected]="isSelected(entry)"
          (click)="onEntryClick(entry)"
          (dblclick)="onEntryDoubleClick(entry)">
        </app-file-entry>
      </div>
    </div>
  `
})
export class FileListComponent {
  @Input() entries: FileInfo[];
  @Input() selectedFiles: Set<string>;
  @Input() loading: boolean;
  @Input() error: string | null;
  @Output() selectionChange = new EventEmitter<FileInfo>();
  @Output() navigate = new EventEmitter<FileInfo>();
}
```

## Benefits of This Structure

### 1. **Reusability**
- `file-pane` component is fully reusable
- Can create 3-pane or 4-pane layouts easily
- Components can be used in different contexts

### 2. **Maintainability**
- Each component < 200 lines
- Clear responsibilities
- Easy to locate bugs
- Simple to test

### 3. **Scalability**
- Easy to add new features per component
- Can enhance individual components without affecting others
- Clear boundaries between features

### 4. **Testability**
- Each component can be tested in isolation
- Mock inputs/outputs easily
- Unit test specific behaviors

### 5. **Collaboration**
- Multiple developers can work on different components
- Clear interfaces between components
- Less merge conflicts

## Migration Strategy

### Phase 1: Extract Presentational Components
1. ✅ Extract `file-entry.component`
2. ✅ Extract `tab.component`
3. ✅ Extract `filter-bar.component`
4. ✅ Extract `action-bar.component`

### Phase 2: Extract Container Components
5. ✅ Extract `file-list.component`
6. ✅ Extract `tab-bar.component`
7. ✅ Extract `toolbar.component`
8. ✅ Extract `workspace-selector.component`

### Phase 3: Create Pane Component
9. ✅ Extract `file-pane.component` (combines all sub-components)

### Phase 4: Simplify Main Component
10. ✅ Refactor `file-browser.component` to use panes
11. ✅ Move logic to services
12. ✅ Keep only coordination logic

## Implementation Order

1. **Start with leaf components** (file-entry, tab)
2. **Move up to containers** (file-list, tab-bar)
3. **Create pane component**
4. **Simplify main component**

## Example: Extracting File Entry Component

### Before (in file-browser.component.html):
```html
<div 
  *ngFor="let entry of leftPane.filteredEntries"
  class="file-entry"
  [class.selected]="isSelected(leftPane, entry)"
  (click)="toggleSelection(leftPane, entry)"
  (dblclick)="navigateToPath(leftPane, entry)">
  <span class="file-icon">{{ getFileIcon(entry) }}</span>
  <div class="file-info">
    <div class="file-name">{{ entry.name }}</div>
    <div class="file-details">
      <span class="file-size">{{ formatSize(entry.size) }}</span>
      <span class="file-date">{{ formatDate(entry.modified) }}</span>
    </div>
  </div>
</div>
```

### After (with file-entry component):
```html
<app-file-entry
  *ngFor="let entry of leftPane.filteredEntries"
  [entry]="entry"
  [selected]="isSelected(leftPane, entry)"
  (select)="toggleSelection(leftPane, entry)"
  (navigate)="navigateToPath(leftPane, entry)">
</app-file-entry>
```

Much cleaner! 🎯

## File Size Reduction

Current:
- `file-browser.component.ts`: ~1000 lines
- `file-browser.component.html`: ~200 lines
- `file-browser.component.scss`: ~600 lines

After Refactoring:
- `file-browser.component.ts`: ~150 lines ⬇️ 85%
- `file-pane.component.ts`: ~200 lines
- `tab-bar.component.ts`: ~100 lines
- `file-list.component.ts`: ~100 lines
- `file-entry.component.ts`: ~50 lines
- `toolbar.component.ts`: ~100 lines
- Other small components: ~50 lines each

Total: Same functionality, better organized! 📦
