import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Filter Bar Component
 * Provides filtering functionality for file lists
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar">
      <input 
        type="text"
        [(ngModel)]="currentFilter"
        (ngModelChange)="onFilterChange()"
        class="filter-input"
        [placeholder]="placeholder"
      />
      <button 
        *ngIf="currentFilter"
        (click)="onClear()" 
        class="btn-icon"
        title="Clear filter">
        ✕
      </button>
      <span class="filter-count" *ngIf="currentFilter">
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

      .btn-icon {
        padding: var(--vsc-padding-xs);
        width: 26px;
        height: 26px;
        background: transparent;
        border: none;
        color: var(--vsc-foreground-dim);
        cursor: pointer;
        border-radius: var(--vsc-border-radius-sm);
        transition: all var(--vsc-transition-fast);
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: var(--vsc-button-secondary);
          color: var(--vsc-foreground);
        }
      }

      .filter-count {
        font-size: var(--vsc-font-size-small);
        color: var(--vsc-foreground-dim);
        white-space: nowrap;
        font-weight: 500;
      }
    }

    :host-context(.compact-mode) .filter-bar {
      .filter-input {
        min-height: 24px;
      }

      .btn-icon {
        width: 22px;
        height: 22px;
      }
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

  currentFilter = '';

  ngOnInit(): void {
    this.currentFilter = this.filterText;
  }

  ngOnChanges(): void {
    this.currentFilter = this.filterText;
  }

  onFilterChange(): void {
    this.filterChange.emit(this.currentFilter);
  }

  onClear(): void {
    this.currentFilter = '';
    this.clear.emit();
  }
}
