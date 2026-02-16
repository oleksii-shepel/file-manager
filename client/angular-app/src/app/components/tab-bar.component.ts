import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabComponent } from '../tab/tab.component';
import { TabInfo } from '@shared/protocol-enhanced';

/**
 * Tab Bar Component
 * Container for tabs with new tab button
 */
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
        
        <button class="tab-new" (click)="onNewTab()" title="New tab">
        </button>
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
