import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabInfo } from '@shared/protocol-enhanced';

/**
 * Tab Component
 * Displays a single tab in the tab bar
 */
@Component({
  selector: 'app-tab',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="tab"
      [class.active]="isActive"
      [class.pinned]="tab.isPinned"
      (click)="onClick()"
      [title]="tab.title">
      
      <span class="tab-icon">📁</span>
      <span class="tab-title">{{ tab.title }}</span>
      
      <button 
        *ngIf="tab.isPinned"
        class="tab-pin"
        (click)="onPin($event)"
        title="Unpin tab">
      </button>
      
      <button 
        class="tab-close"
        (click)="onClose($event)"
        title="Close tab">
      </button>
    </div>
  `,
  styles: [`
    .tab {
      display: inline-flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      padding: 0 var(--vsc-padding-lg);
      background: transparent;
      border-right: 1px solid transparent;
      cursor: pointer;
      transition: all var(--vsc-transition-fast);
      min-width: 120px;
      max-width: 200px;
      height: 35px;
      position: relative;
      color: var(--vsc-foreground-dim);

      &::after {
        content: '';
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 1px;
        background: var(--vsc-border-subtle);
        opacity: 0.5;
      }

      &:hover {
        background: rgba(255, 255, 255, 0.03);
        color: var(--vsc-foreground);

        .tab-title {
          color: var(--vsc-foreground);
        }
      }

      &.active {
        background: var(--vsc-editor-background);
        color: var(--vsc-foreground-bright);
        
        &::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--vsc-accent-blue);
          z-index: 1;
        }

        &::after {
          opacity: 0;
        }

        .tab-title {
          color: var(--vsc-foreground-bright);
          font-weight: 400;
        }

        .tab-icon {
          opacity: 1;
        }
      }

      &.pinned {
        min-width: 40px;
        max-width: 40px;
        padding: 0 var(--vsc-padding-sm);
        
        .tab-icon::after {
          content: '';
          position: absolute;
          bottom: 2px;
          left: 50%;
          transform: translateX(-50%);
          width: 4px;
          height: 4px;
          background: var(--vsc-accent-blue);
          border-radius: 50%;
        }

        .tab-title,
        .tab-close {
          width: 0;
          overflow: hidden;
          opacity: 0;
          pointer-events: none;
        }
      }

      &.pinned.active {
        .tab-icon::after {
          background: var(--vsc-foreground-bright);
        }
      }

      .tab-icon {
        font-size: 16px;
        flex-shrink: 0;
        line-height: 1;
        opacity: 0.7;
        position: relative;
        transition: opacity var(--vsc-transition-fast);
      }

      .tab-title {
        flex: 1;
        font-size: var(--vsc-font-size);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1;
        color: inherit;
        transition: color var(--vsc-transition-fast);
      }

      .tab-pin,
      .tab-close {
        display: inline-flex;
        width: 20px;
        height: 20px;
        padding: 0;
        background: transparent;
        border: none;
        color: var(--vsc-foreground-dim);
        cursor: pointer;
        font-size: 16px;
        opacity: 0;
        transition: all var(--vsc-transition-fast);
        border-radius: var(--vsc-border-radius-sm);
        line-height: 1;
        align-items: center;
        justify-content: center;
        position: relative;
        flex-shrink: 0;

        &:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--vsc-foreground);
          opacity: 1 !important;
        }

        &:active {
          background: rgba(255, 255, 255, 0.15);
        }
      }

      .tab-close {
        &::before {
          content: '✕';
          font-size: 14px;
          line-height: 1;
        }
      }

      .tab-pin {
        &::before {
          content: '📌';
          font-size: 11px;
          line-height: 1;
          filter: grayscale(1);
          opacity: 0.7;
        }
      }

      &:hover .tab-pin,
      &:hover .tab-close {
        opacity: 0.7;
      }

      &.pinned .tab-pin {
        display: inline-flex;
        opacity: 0.5;

        &::before {
          filter: grayscale(0);
          opacity: 1;
        }
      }

      &.pinned:hover .tab-pin {
        opacity: 1;
      }
    }

    :host-context(.compact-mode) .tab {
      height: 30px;
      padding: 0 var(--vsc-padding-md);
      min-width: 100px;
      max-width: 160px;

      &.pinned {
        min-width: 36px;
        max-width: 36px;
      }
    }
  `]
})
export class TabComponent {
  @Input() tab!: TabInfo;
  @Input() isActive = false;
  
  @Output() tabClick = new EventEmitter<TabInfo>();
  @Output() tabClose = new EventEmitter<TabInfo>();
  @Output() tabPin = new EventEmitter<TabInfo>();

  onClick(): void {
    this.tabClick.emit(this.tab);
  }

  onClose(event: Event): void {
    event.stopPropagation();
    this.tabClose.emit(this.tab);
  }

  onPin(event: Event): void {
    event.stopPropagation();
    this.tabPin.emit(this.tab);
  }
}
