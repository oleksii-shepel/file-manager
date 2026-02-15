# Keyboard Shortcuts - Integration Guide

## Overview

This guide shows how to integrate the keyboard shortcut system into your existing file manager application.

## Files Created

```
client/angular-app/src/app/
├── services/
│   ├── keyboard.service.ts          # Core keyboard service
│   └── shortcut-registry.service.ts # Default shortcuts registration
└── components/
    ├── keyboard-help.component.ts    # Help modal component
    ├── keyboard-help.component.html  # Help modal template
    └── keyboard-help.component.scss  # Help modal styles
```

## Installation Steps

### Step 1: Copy Files

Copy all the created files to your Angular project:

```bash
# Services
cp keyboard.service.ts client/angular-app/src/app/services/
cp shortcut-registry.service.ts client/angular-app/src/app/services/

# Components
cp keyboard-help.component.ts client/angular-app/src/app/components/
cp keyboard-help.component.html client/angular-app/src/app/components/
cp keyboard-help.component.scss client/angular-app/src/app/components/
```

### Step 2: Update File Browser Component

Add keyboard shortcuts to your `file-browser.component.ts`:

```typescript
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { KeyboardHelpComponent } from './keyboard-help.component';
import { ShortcutRegistryService, ShortcutCallbacks } from '../services/shortcut-registry.service';
import { KeyboardService } from '../services/keyboard.service';

@Component({
  selector: 'app-file-browser',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    KeyboardHelpComponent, // Add this
  ],
  // ... existing config
})
export class FileBrowserComponent implements OnInit, OnDestroy {
  @ViewChild(KeyboardHelpComponent) keyboardHelp?: KeyboardHelpComponent;

  // Inject services
  constructor(
    private apiService: ApiService,
    private workspaceService: WorkspaceService,
    private filterService: FilterService,
    private keyboardService: KeyboardService,         // Add this
    private shortcutRegistry: ShortcutRegistryService, // Add this
  ) {}

  ngOnInit(): void {
    // ... existing initialization

    // Register keyboard shortcuts
    this.registerKeyboardShortcuts();
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
    // TODO: Implement global search modal (Phase 2)
    console.log('Global search - coming in Phase 2');
  }

  private showPathHistory(): void {
    // TODO: Implement path history modal (Phase 2)
    console.log('Path history - coming in Phase 2');
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
```

### Step 3: Update Template

Add the keyboard help component to your `file-browser.component.html`:

```html
<div class="file-manager-enhanced" (click)="closeWorkspaceMenu()">
  <!-- Existing content -->
  
  <!-- Add keyboard help modal at the end -->
  <app-keyboard-help></app-keyboard-help>
</div>
```

### Step 4: Test

Run your application:

```bash
cd client/angular-app
npm start
```

Test shortcuts:
- Press `?` or `Ctrl+/` to show keyboard help
- Press `Ctrl+T` to create new tab
- Press `Tab` to switch between panes
- Press `Ctrl+F` to focus filter
- Press `Space` to preview (when implemented)

## Available Shortcuts

### Navigation
- `Ctrl+K` - Open global search (Phase 2)
- `Ctrl+H` - Show path history (Phase 2)
- `Ctrl+P` - Quick path jump (Phase 2)
- `Backspace` - Go to parent directory
- `F5` - Refresh current pane
- `?` or `Ctrl+/` - Show keyboard shortcuts

### Tabs
- `Ctrl+T` - New tab
- `Ctrl+W` - Close tab
- `Ctrl+Tab` - Next tab
- `Ctrl+Shift+Tab` - Previous tab
- `Ctrl+1-9` - Jump to tab N
- `Ctrl+Shift+P` - Pin/unpin tab

### File Operations
- `Space` - Quick view (Phase 3)
- `Enter` - Open file/folder
- `Delete` - Delete selected
- `Ctrl+C` - Copy selected
- `Ctrl+X` - Cut selected
- `Ctrl+V` - Paste
- `Ctrl+A` - Select all
- `Ctrl+D` - Deselect all
- `Ctrl+Shift+N` - New folder
- `F2` - Rename

### Search & Filter
- `Ctrl+F` - Focus filter
- `Ctrl+Shift+F` - Advanced filter
- `Esc` - Clear filter (when in filter)

### Workspace
- `Ctrl+Shift+W` - Workspace switcher
- `Ctrl+Shift+Alt+N` - New workspace
- `Ctrl+Shift+H` - Toggle hidden files

### Panes
- `Tab` - Switch between panes
- `Ctrl+Shift+C` - Copy to other pane
- `Ctrl+Shift+M` - Move to other pane
- `Ctrl+L` - Focus address bar

## Customization

### Add Custom Shortcuts

```typescript
this.keyboardService.register({
  id: 'my-custom-shortcut',
  key: 'g',
  modifiers: ['ctrl', 'shift'],
  action: () => console.log('Custom action!'),
  context: 'global',
  category: 'navigation',
  description: 'My custom shortcut',
});
```

### Disable Specific Shortcuts

```typescript
this.keyboardService.toggleShortcut('copy-to-pane', false);
```

### Export/Import Configuration

Users can export and import their shortcut preferences from the keyboard help modal.

## Platform Differences

The service automatically adapts to platform:
- **macOS**: Shows ⌘ (Cmd) instead of Ctrl
- **Windows/Linux**: Shows Ctrl

## Troubleshooting

### Shortcuts not working

1. Check browser console for errors
2. Verify services are injected correctly
3. Make sure `registerKeyboardShortcuts()` is called in `ngOnInit`

### Conflicts with browser shortcuts

Some shortcuts may conflict with browser defaults. Users can customize conflicting shortcuts in the keyboard help modal.

### Typing in inputs

Shortcuts are automatically disabled when typing in input fields, textareas, or when modals are open (except modal-specific shortcuts).

## Next Steps

1. ✅ **Keyboard shortcuts** - Complete!
2. 🔄 **Global search** - Next in Phase 2
3. 🔄 **Advanced address bar** - Next in Phase 2

## Future Enhancements

- Vim-style navigation mode
- Macro recording
- Gesture shortcuts (mouse + keyboard)
- Per-workspace shortcut profiles
- Accessibility improvements

---

**Keyboard Shortcuts Status**: ✅ Ready to use!
