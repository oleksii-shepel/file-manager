import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WorkspaceSelectorComponent } from '../workspace-selector/workspace-selector.component';
import { WorkspaceConfig } from '@shared/protocol-enhanced';
import { ThemeService } from '../../services/theme.service';

/**
 * Toolbar Component
 * Top toolbar with workspace selector and global controls
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [CommonModule, WorkspaceSelectorComponent],
  template: `
    <div class="toolbar">
      <div class="toolbar-left">
        <app-workspace-selector
          [workspaces]="workspaces"
          [activeWorkspace]="activeWorkspace"
          [showMenu]="showWorkspaceMenu"
          (workspaceChange)="onWorkspaceChange($event)"
          (createNew)="onCreateWorkspace()"
          (rename)="onRenameWorkspace()"
          (deleteWorkspace)="onDeleteWorkspace()"
          (menuToggle)="onMenuToggle($event)">
        </app-workspace-selector>
      </div>

      <div class="toolbar-center">
        <h1>{{ title }}</h1>
      </div>

      <div class="toolbar-right">
        <button 
          (click)="onToggleHidden()" 
          [class.active]="showHidden" 
          class="btn"
          title="Toggle hidden files">
          {{ showHidden ? 'Hide' : 'Show' }} Hidden
        </button>
        
        <button 
          (click)="onToggleTheme()" 
          class="btn" 
          title="Toggle theme">
          Theme
        </button>
        
        <button 
          (click)="onToggleCompact()" 
          [class.active]="isCompact" 
          class="btn" 
          title="Toggle compact mode">
          Compact
        </button>
      </div>
    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: var(--vsc-titlebar-height);
      padding: 0 var(--vsc-padding-lg);
      background: var(--vsc-titlebar-background);
      border-bottom: 1px solid var(--vsc-border);
      gap: var(--vsc-padding-lg);
      flex-shrink: 0;

      h1 {
        margin: 0;
        font-size: var(--vsc-font-size-large);
        font-weight: 500;
        color: var(--vsc-foreground);
        letter-spacing: -0.01em;
      }

      .toolbar-left,
      .toolbar-right {
        display: flex;
        gap: var(--vsc-padding-sm);
        align-items: center;
      }

      .toolbar-center {
        flex: 1;
        text-align: center;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--vsc-padding-xs) var(--vsc-padding-md);
        border: 1px solid transparent;
        border-radius: var(--vsc-border-radius-sm);
        background: var(--vsc-button-secondary);
        color: var(--vsc-foreground);
        cursor: pointer;
        font-size: var(--vsc-font-size);
        font-family: var(--vsc-font-family);
        font-weight: 500;
        transition: all var(--vsc-transition-fast);
        height: 26px;
        white-space: nowrap;
        line-height: 1;

        &:hover {
          background: var(--vsc-button-secondary-hover);
          transform: translateY(-1px);
        }

        &:active {
          transform: translateY(0);
        }

        &.active {
          background: var(--vsc-button-background);
          color: var(--vsc-foreground-bright);
          border-color: var(--vsc-accent-blue);
        }
      }
    }

    :host-context(.compact-mode) .toolbar {
      height: 30px;
      padding: 0 var(--vsc-padding-md);

      h1 {
        font-size: var(--vsc-font-size);
      }

      .btn {
        height: 22px;
        font-size: var(--vsc-font-size-small);
      }
    }
  `]
})
export class ToolbarComponent {
  @Input() workspaces: WorkspaceConfig[] = [];
  @Input() activeWorkspace: WorkspaceConfig | null = null;
  @Input() showWorkspaceMenu = false;
  @Input() showHidden = false;
  @Input() isCompact = false;
  @Input() title = 'File Manager';
  
  @Output() workspaceChange = new EventEmitter<WorkspaceConfig>();
  @Output() createWorkspace = new EventEmitter<void>();
  @Output() renameWorkspace = new EventEmitter<void>();
  @Output() deleteWorkspace = new EventEmitter<void>();
  @Output() toggleHidden = new EventEmitter<void>();
  @Output() toggleTheme = new EventEmitter<void>();
  @Output() toggleCompact = new EventEmitter<void>();
  @Output() menuToggle = new EventEmitter<boolean>();

  onWorkspaceChange(workspace: WorkspaceConfig): void {
    this.workspaceChange.emit(workspace);
  }

  onCreateWorkspace(): void {
    this.createWorkspace.emit();
  }

  onRenameWorkspace(): void {
    this.renameWorkspace.emit();
  }

  onDeleteWorkspace(): void {
    this.deleteWorkspace.emit();
  }

  onToggleHidden(): void {
    this.toggleHidden.emit();
  }

  onToggleTheme(): void {
    this.toggleTheme.emit();
  }

  onToggleCompact(): void {
    this.toggleCompact.emit();
  }

  onMenuToggle(show: boolean): void {
    this.menuToggle.emit(show);
  }
}
