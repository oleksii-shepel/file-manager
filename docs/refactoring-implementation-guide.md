# Step-by-Step Component Refactoring Guide

## Overview
This guide walks you through breaking down the monolithic `file-browser.component` into smaller, reusable components.

## Phase 1: Create New Component Files

### Step 1: Create Directory Structure
```bash
cd client/angular-app/src/app/components

# Create subdirectories
mkdir -p file-browser/file-entry
mkdir -p file-browser/tab
mkdir -p file-browser/tab-bar
mkdir -p file-browser/file-list
mkdir -p file-browser/filter-bar
mkdir -p file-browser/action-bar
mkdir -p file-browser/toolbar
mkdir -p file-browser/workspace-selector
mkdir -p file-browser/file-pane
```

### Step 2: Create Component Files

Copy these files from the docs folder:
- `file-entry.component.ts` → `file-browser/file-entry/`
- `tab.component.ts` → `file-browser/tab/`

## Phase 2: Extract File Entry Component

### 2.1: Create file-entry.component.ts
```typescript
// file-browser/file-entry/file-entry.component.ts
// (Already provided in file-entry.component.ts)
```

### 2.2: Update file-browser.component.html
Replace:
```html
<div 
  *ngFor="let entry of leftPane.filteredEntries"
  class="file-entry"
  [class.selected]="isSelected(leftPane, entry)"
  [class.directory]="entry.type === FileType.DIRECTORY"
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

With:
```html
<app-file-entry
  *ngFor="let entry of leftPane.filteredEntries"
  [entry]="entry"
  [selected]="isSelected(leftPane, entry)"
  (select)="toggleSelection(leftPane, entry)"
  (navigate)="navigateToPath(leftPane, entry)">
</app-file-entry>
```

### 2.3: Update Imports
```typescript
// file-browser.component.ts
import { FileEntryComponent } from './file-entry/file-entry.component';

@Component({
  imports: [
    CommonModule,
    FormsModule,
    FileEntryComponent, // Add this
    // ... other imports
  ]
})
```

### 2.4: Remove from file-browser.component.ts
Delete these methods (now in FileEntryComponent):
- `getFileIcon()`
- `formatSize()`
- `formatDate()`

### 2.5: Remove from file-browser.component.scss
Delete `.file-entry` styles (now in FileEntryComponent)

## Phase 3: Extract Tab Component

### 3.1: Create tab.component.ts
```typescript
// file-browser/tab/tab.component.ts
// (Already provided in tab.component.ts)
```

### 3.2: Create tab-bar.component.ts
```typescript
// file-browser/tab-bar/tab-bar.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabComponent } from '../tab/tab.component';
import { TabInfo } from '@shared/protocol-enhanced';

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [CommonModule, TabComponent],
  template: `
    <div class="tab-bar">
      <div class="tabs">
        <app-tab
          *ngFor="let tab of tabs"
          [tab]="tab"
          [isActive]="tab.id === activeTabId"
          (tabClick)="onTabClick($event)"
          (tabClose)="onTabClose($event)"
          (tabPin)="onTabPin($event)">
        </app-tab>
        
        <button class="tab-new" (click)="onNewTab()">+</button>
      </div>
    </div>
  `,
  styles: [`
    .tab-bar {
      display: flex;
      background: var(--vsc-editor-background);
      border-bottom: 1px solid var(--vsc-border);
      min-height: 35px;
      overflow-x: auto;
      overflow-y: hidden;
      position: relative;
      z-index: 10;
      flex-shrink: 0;

      &::-webkit-scrollbar {
        height: 3px;
      }

      &::-webkit-scrollbar-track {
        background: transparent;
      }

      &::-webkit-scrollbar-thumb {
        background: var(--vsc-scrollbar-thumb);
        border-radius: 2px;

        &:hover {
          background: var(--vsc-scrollbar-thumb-hover);
        }
      }
    }

    .tabs {
      display: flex;
      flex: 1;
      min-width: 0;
      height: 100%;
      align-items: stretch;
    }

    .tab-new {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 35px;
      min-width: 35px;
      max-width: 35px;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--vsc-foreground-dim);
      cursor: pointer;
      font-size: 16px;
      transition: all var(--vsc-transition-fast);
      opacity: 0.5;
      height: 35px;

      &::before {
        content: '+';
        font-size: 18px;
        line-height: 1;
        font-weight: 300;
      }

      &:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.05);
        color: var(--vsc-foreground);
      }

      &:active {
        background: rgba(255, 255, 255, 0.1);
      }
    }

    :host-context(.compact-mode) .tab-bar {
      min-height: 30px;
    }

    :host-context(.compact-mode) .tab-new {
      height: 30px;
      width: 30px;
      min-width: 30px;
      max-width: 30px;
    }
  `]
})
export class TabBarComponent {
  @Input() tabs: TabInfo[] = [];
  @Input() activeTabId = '';
  
  @Output() tabChange = new EventEmitter<TabInfo>();
  @Output() tabClose = new EventEmitter<TabInfo>();
  @Output() tabPin = new EventEmitter<TabInfo>();
  @Output() newTab = new EventEmitter<void>();

  onTabClick(tab: TabInfo): void {
    this.tabChange.emit(tab);
  }

  onTabClose(tab: TabInfo): void {
    this.tabClose.emit(tab);
  }

  onTabPin(tab: TabInfo): void {
    this.tabPin.emit(tab);
  }

  onNewTab(): void {
    this.newTab.emit();
  }
}
```

### 3.3: Update file-browser.component.html
Replace the tab bar section:
```html
<!-- Before -->
<div class="tab-bar">
  <div class="tabs">
    <div *ngFor="let tab of getTabs('left')" class="tab" ...>
      <!-- complex tab HTML -->
    </div>
    <button class="tab-new" ...>➕</button>
  </div>
</div>

<!-- After -->
<app-tab-bar
  [tabs]="getTabs('left')"
  [activeTabId]="leftPane.currentTabId"
  (tabChange)="switchTab(leftPane, $event.id)"
  (tabClose)="closeTab(leftPane, $event.id)"
  (tabPin)="toggleTabPin(leftPane, $event.id, $event)"
  (newTab)="addTab(leftPane)">
</app-tab-bar>
```

## Phase 4: Extract Filter Bar Component

### 4.1: Create filter-bar.component.ts
```typescript
// file-browser/filter-bar/filter-bar.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar">
      <input 
        type="text"
        [(ngModel)]="filterText"
        (ngModelChange)="onFilterChange()"
        class="filter-input"
        [placeholder]="placeholder"
      />
      <button 
        *ngIf="filterText"
        (click)="onClear()" 
        class="btn-icon"
        title="Clear filter">
        ✕
      </button>
      <span class="filter-count" *ngIf="filterText">
        {{ filteredCount }} / {{ totalCount }}
      </span>
    </div>
  `,
  styles: [`
    .filter-bar {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      padding: var(--vsc-padding-sm) var(--vsc-padding-lg);
      background: var(--vsc-sidebar-background);
      border-bottom: 1px solid var(--vsc-border);
      flex-shrink: 0;

      .filter-input {
        flex: 1;
        padding: var(--vsc-padding-sm) var(--vsc-padding-md);
        background: var(--vsc-input-background);
        border: 1px solid var(--vsc-input-border);
        border-radius: var(--vsc-border-radius-sm);
        color: var(--vsc-input-foreground);
        font-size: var(--vsc-font-size);
        font-family: var(--vsc-font-family);
        min-height: 28px;
        transition: all var(--vsc-transition-fast);

        &:focus {
          outline: none;
          border-color: var(--vsc-input-focus-border);
          box-shadow: 0 0 0 1px var(--vsc-input-focus-border);
        }

        &::placeholder {
          color: var(--vsc-input-placeholder);
          font-size: var(--vsc-font-size-small);
        }
      }

      .filter-count {
        font-size: var(--vsc-font-size-small);
        color: var(--vsc-foreground-dim);
        white-space: nowrap;
        font-weight: 500;
      }
    }

    :host-context(.compact-mode) .filter-input {
      min-height: 24px;
    }
  `]
})
export class FilterBarComponent {
  @Input() filterText = '';
  @Input() totalCount = 0;
  @Input() filteredCount = 0;
  @Input() placeholder = 'Filter: name, ext:pdf, type:dir, size>1mb...';
  
  @Output() filterChange = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();

  onFilterChange(): void {
    this.filterChange.emit(this.filterText);
  }

  onClear(): void {
    this.filterText = '';
    this.clear.emit();
  }
}
```

## Phase 5: Testing Each Component

### Test File Entry Component
```typescript
// file-entry.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileEntryComponent } from './file-entry.component';
import { FileType } from '@shared/protocol';

describe('FileEntryComponent', () => {
  let component: FileEntryComponent;
  let fixture: ComponentFixture<FileEntryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FileEntryComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FileEntryComponent);
    component = fixture.componentInstance;
    component.entry = {
      name: 'test.txt',
      path: '/test.txt',
      type: FileType.FILE,
      size: 1024,
      modified: Date.now() / 1000,
      created: Date.now() / 1000,
      accessed: Date.now() / 1000,
      permissions: 'rw-r--r--',
      isHidden: false
    };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit select event on click', () => {
    spyOn(component.select, 'emit');
    component.onClick();
    expect(component.select.emit).toHaveBeenCalledWith(component.entry);
  });

  it('should emit navigate event on double click', () => {
    spyOn(component.navigate, 'emit');
    component.onDoubleClick();
    expect(component.navigate.emit).toHaveBeenCalledWith(component.entry);
  });

  it('should format file size correctly', () => {
    expect(component.formatSize(0)).toBe('0 B');
    expect(component.formatSize(1024)).toBe('1 KB');
    expect(component.formatSize(1048576)).toBe('1 MB');
  });
});
```

## Phase 6: Verification Checklist

After each component extraction:

- [ ] Component builds without errors
- [ ] Component displays correctly in UI
- [ ] All inputs work as expected
- [ ] All outputs emit correctly
- [ ] Styles are properly scoped
- [ ] Compact mode works
- [ ] No duplicate code remains in parent
- [ ] Tests pass

## Benefits You'll See

### Before Refactoring:
```
file-browser.component.ts: 1000 lines 😰
- Hard to find bugs
- Difficult to test
- Changes affect everything
- Can't reuse parts
```

### After Refactoring:
```
file-browser.component.ts: 150 lines ✨
file-entry.component.ts: 150 lines
tab.component.ts: 120 lines
tab-bar.component.ts: 100 lines
filter-bar.component.ts: 80 lines
action-bar.component.ts: 80 lines
toolbar.component.ts: 100 lines

Total: Same functionality, better organized! 🎯
- Easy to find bugs
- Simple to test
- Changes are isolated
- Components are reusable
```

## Next Steps

1. Start with `FileEntryComponent` (easiest)
2. Then `TabComponent` and `TabBarComponent`
3. Then `FilterBarComponent`
4. Then `ActionBarComponent`
5. Finally, create `FilePaneComponent` to combine them all

Each step should be a separate commit for easy rollback if needed!

Good luck! 🚀
