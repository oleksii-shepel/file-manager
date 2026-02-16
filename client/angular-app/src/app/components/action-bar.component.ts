import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Action Bar Component
 * Provides file operation buttons (create, delete, copy, move)
 */
@Component({
  selector: 'app-action-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="action-bar">
      <button 
        *ngIf="panePosition === 'left'"
        (click)="onCreate()" 
        class="btn-small">
        ➕ Folder
      </button>
      
      <button 
        (click)="onDelete()" 
        [disabled]="selectedCount === 0" 
        class="btn-small">
        🗑️ Delete ({{ selectedCount }})
      </button>
      
      <button 
        *ngIf="panePosition === 'left'"
        (click)="onCopyToOther()" 
        [disabled]="selectedCount === 0" 
        class="btn-small">
        ➡️ Copy →
      </button>
      
      <button 
        *ngIf="panePosition === 'right'"
        (click)="onCopyToOther()" 
        [disabled]="selectedCount === 0" 
        class="btn-small">
        ⬅️ Copy ←
      </button>
      
      <button 
        *ngIf="panePosition === 'left'"
        (click)="onMoveToOther()" 
        [disabled]="selectedCount === 0" 
        class="btn-small">
        ➡️ Move →
      </button>
      
      <button 
        *ngIf="panePosition === 'right'"
        (click)="onMoveToOther()" 
        [disabled]="selectedCount === 0" 
        class="btn-small">
        ⬅️ Move ←
      </button>

      <button 
        *ngIf="panePosition === 'right'"
        (click)="onCreate()" 
        class="btn-small">
        ➕ Folder
      </button>
    </div>
  `,
  styles: [`
    .action-bar {
      display: flex;
      gap: var(--vsc-padding-sm);
      padding: var(--vsc-padding-sm) var(--vsc-padding-lg);
      background: var(--vsc-sidebar-background);
      border-bottom: 1px solid var(--vsc-border);
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .btn-small {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--vsc-padding-xs);
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
      white-space: nowrap;
      line-height: 1;

      &:hover:not(:disabled) {
        background: var(--vsc-button-secondary-hover);
        transform: translateY(-1px);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }

    :host-context(.compact-mode) .btn-small {
      height: 20px;
      font-size: 11px;
      padding: 1px var(--vsc-padding-xs);
    }
  `]
})
export class ActionBarComponent {
  @Input() selectedCount = 0;
  @Input() panePosition: 'left' | 'right' = 'left';
  
  @Output() createFolder = new EventEmitter<void>();
  @Output() deleteSelected = new EventEmitter<void>();
  @Output() copyToOther = new EventEmitter<void>();
  @Output() moveToOther = new EventEmitter<void>();

  onCreate(): void {
    this.createFolder.emit();
  }

  onDelete(): void {
    this.deleteSelected.emit();
  }

  onCopyToOther(): void {
    this.copyToOther.emit();
  }

  onMoveToOther(): void {
    this.moveToOther.emit();
  }
}
