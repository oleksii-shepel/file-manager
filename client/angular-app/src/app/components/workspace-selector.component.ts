import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkspaceConfig } from '@shared/protocol-enhanced';

/**
 * Workspace Selector Component
 * Dropdown menu for selecting and managing workspaces
 */
@Component({
  selector: 'app-workspace-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="workspace-selector" (click)="toggleMenu()">
      <span class="workspace-icon">{{ activeWorkspace?.icon || '📁' }}</span>
      <span class="workspace-name">{{ activeWorkspace?.name || 'Default' }}</span>
      <span class="workspace-arrow">▼</span>
    </div>

    <div class="workspace-menu" *ngIf="showMenu" (click)="$event.stopPropagation()">
      <div class="workspace-menu-header">
        <h3>Workspaces</h3>
        <button (click)="onCreateNew()" class="btn-icon" title="New workspace">
          ➕
        </button>
      </div>
      
      <div class="workspace-list">
        <div 
          *ngFor="let workspace of workspaces"
          class="workspace-item"
          [class.active]="workspace.id === activeWorkspace?.id"
          (click)="onSelect(workspace)">
          <span class="workspace-icon">{{ workspace.icon }}</span>
          <span class="workspace-name">{{ workspace.name }}</span>
        </div>
      </div>
      
      <div class="workspace-menu-footer">
        <button (click)="onRename()" class="btn-small">Rename</button>
        <button (click)="onDelete()" class="btn-small btn-danger">Delete</button>
      </div>
    </div>
  `,
  styles: [`
    .workspace-selector {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      padding: var(--vsc-padding-xs) var(--vsc-padding-md);
      background: var(--vsc-input-background);
      border: 1px solid var(--vsc-border);
      border-radius: var(--vsc-border-radius-sm);
      cursor: pointer;
      transition: all var(--vsc-transition-fast);
      min-height: 26px;

      &:hover {
        background: var(--vsc-list-hover-background);
        border-color: var(--vsc-border-bright);
      }

      &:active {
        transform: scale(0.98);
      }

      .workspace-icon {
        font-size: 14px;
        line-height: 1;
      }

      .workspace-name {
        font-size: var(--vsc-font-size);
        color: var(--vsc-foreground);
        font-weight: 500;
      }

      .workspace-arrow {
        font-size: 9px;
        opacity: 0.7;
        transition: transform var(--vsc-transition-fast);
      }

      &:hover .workspace-arrow {
        opacity: 1;
      }
    }

    .workspace-menu {
      position: absolute;
      top: calc(100% + var(--vsc-padding-xs));
      left: 0;
      min-width: 250px;
      background: var(--vsc-panel-background);
      border: 1px solid var(--vsc-border-bright);
      border-radius: var(--vsc-border-radius);
      box-shadow: var(--vsc-widget-shadow);
      z-index: var(--vsc-z-dropdown);
      overflow: hidden;
      animation: dropdownFadeIn 0.15s ease-out;

      @keyframes dropdownFadeIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .workspace-menu-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--vsc-padding-md);
        border-bottom: 1px solid var(--vsc-border);
        background: var(--vsc-sidebar-background);

        h3 {
          margin: 0;
          font-size: var(--vsc-font-size-small);
          font-weight: 600;
          text-transform: uppercase;
          color: var(--vsc-foreground-dim);
          letter-spacing: 0.5px;
        }

        .btn-icon {
          padding: var(--vsc-padding-xs);
          width: 26px;
          height: 26px;
          background: transparent;
          border: none;
          color: var(--vsc-foreground);
          cursor: pointer;
          border-radius: var(--vsc-border-radius-sm);
          transition: all var(--vsc-transition-fast);
          display: flex;
          align-items: center;
          justify-content: center;

          &:hover {
            background: var(--vsc-button-secondary);
          }
        }
      }

      .workspace-list {
        max-height: 300px;
        overflow-y: auto;

        &::-webkit-scrollbar {
          width: 8px;
        }

        &::-webkit-scrollbar-track {
          background: var(--vsc-scrollbar-track);
        }

        &::-webkit-scrollbar-thumb {
          background: var(--vsc-scrollbar-thumb);
          border-radius: 4px;

          &:hover {
            background: var(--vsc-scrollbar-thumb-hover);
          }
        }
      }

      .workspace-item {
        display: flex;
        align-items: center;
        gap: var(--vsc-padding-md);
        padding: var(--vsc-padding-sm) var(--vsc-padding-md);
        cursor: pointer;
        transition: all var(--vsc-transition-fast);
        border-left: 3px solid transparent;

        &:hover {
          background: var(--vsc-list-hover-background);
          border-left-color: var(--vsc-border-bright);
        }

        &.active {
          background: var(--vsc-list-active-background);
          color: var(--vsc-foreground-bright);
          border-left-color: var(--vsc-accent-blue);
          font-weight: 500;
        }

        .workspace-icon {
          font-size: 16px;
          line-height: 1;
        }

        .workspace-name {
          font-size: var(--vsc-font-size);
          flex: 1;
        }
      }

      .workspace-menu-footer {
        display: flex;
        gap: var(--vsc-padding-sm);
        padding: var(--vsc-padding-md);
        border-top: 1px solid var(--vsc-border);
        background: var(--vsc-sidebar-background);

        .btn-small {
          flex: 1;
          padding: var(--vsc-padding-xs) var(--vsc-padding-sm);
          border: 1px solid transparent;
          border-radius: var(--vsc-border-radius-sm);
          background: var(--vsc-button-secondary);
          color: var(--vsc-foreground);
          cursor: pointer;
          font-size: var(--vsc-font-size-small);
          font-family: var(--vsc-font-family);
          font-weight: 500;
          transition: all var(--vsc-transition-fast);
          height: 22px;

          &:hover {
            background: var(--vsc-button-secondary-hover);
          }

          &.btn-danger {
            background: var(--vsc-error);
            color: white;

            &:hover {
              background: #d32f2f;
            }
          }
        }
      }
    }
  `]
})
export class WorkspaceSelectorComponent {
  @Input() workspaces: WorkspaceConfig[] = [];
  @Input() activeWorkspace: WorkspaceConfig | null = null;
  @Input() showMenu = false;
  
  @Output() workspaceChange = new EventEmitter<WorkspaceConfig>();
  @Output() createNew = new EventEmitter<void>();
  @Output() rename = new EventEmitter<void>();
  @Output() deleteWorkspace = new EventEmitter<void>();
  @Output() menuToggle = new EventEmitter<boolean>();

  toggleMenu(): void {
    this.showMenu = !this.showMenu;
    this.menuToggle.emit(this.showMenu);
  }

  onSelect(workspace: WorkspaceConfig): void {
    this.workspaceChange.emit(workspace);
    this.showMenu = false;
    this.menuToggle.emit(false);
  }

  onCreateNew(): void {
    this.createNew.emit();
  }

  onRename(): void {
    this.rename.emit();
  }

  onDelete(): void {
    this.deleteWorkspace.emit();
  }
}
