import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TabComponent } from './tab.component';
import { TabInfo } from '@shared/protocol-enhanced';

@Component({
  selector: 'app-tab-bar',
  standalone: true,
  imports: [CommonModule, TabComponent],
  template: `
    <div class="tab-bar-container" [class.compact]="isCompact">
      <div class="tabs-scroll-viewport">
        <div class="tabs-list">
          <app-tab *ngFor="let tab of tabs; trackBy: trackByTabId"
                   [tab]="tab"
                   [isActive]="tab.id === activeTabId"
                   (tabClick)="onTabClick($event)"
                   (tabClose)="onTabClose($event)"
                   (tabPin)="onTabPin($event)">
          </app-tab>
        </div>
      </div>
      
      <div class="tab-bar-actions">
        <button class="action-btn new-tab" (click)="onNewTab()" title="New Tab (Ctrl+N)"></button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      /* Lighter/darker container background to contrast with active tab */
      background: var(--vsc-tab-container-bg, #252526);
      border-bottom: 1px solid var(--vsc-border-subtle, #3c3c3c);
      overflow: hidden;
    }

    .tab-bar-container {
      display: flex;
      height: 35px;
      background: inherit;
    }

    /* Make container slightly different from inactive tabs */
    :host-context(.vscode-dark) .tab-bar-container {
      background: #2a2a2a; /* Slightly different from inactive tab (2d2d2d) */
    }

    :host-context(.vscode-light) .tab-bar-container {
      background: #e8e8e8; /* Slightly different from inactive tab (e0e0e0) */
    }

    /* Scrollable Viewport */
    .tabs-scroll-viewport {
      flex: 1;
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      position: relative;
    }

    .tabs-scroll-viewport::-webkit-scrollbar {
      display: none;
    }

    /* Tabs List */
    .tabs-list {
      display: flex;
      align-items: stretch;
      min-width: 0;
    }

    /* Fade Effect for Overflow */
    .tabs-scroll-viewport::after {
      content: '';
      position: sticky;
      right: 0;
      top: 0;
      width: 20px;
      height: 100%;
      background: linear-gradient(to right, transparent, var(--vsc-tab-container-bg, #252526));
      pointer-events: none;
      z-index: 5;
    }

    /* Action Buttons (Right side) */
    .tab-bar-actions {
      display: flex;
      align-items: center;
      padding: 0 4px;
      background: var(--vsc-tab-container-bg, #252526);
      border-left: 1px solid var(--vsc-border-subtle, #3c3c3c);
      z-index: 10;
    }

    .action-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--vsc-foreground-dim);
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }

    .action-btn:hover {
      background: var(--vsc-list-hover-background, #2a2d2e);
      color: var(--vsc-foreground);
    }

    .new-tab::before {
      content: '+';
      font-size: 18px;
      font-weight: 300;
    }

    /* Compact Mode */
    .compact .tab-bar-container { height: 28px; }
    .compact .action-btn { width: 24px; height: 24px; }
    .compact .action-btn::before { font-size: 16px; }
  `]
})
export class TabBarComponent {
  @Input() tabs: TabInfo[] = [];
  @Input() activeTabId = '';
  @Input() isCompact = false;

  @Output() tabChange = new EventEmitter<TabInfo>();
  @Output() tabClose = new EventEmitter<TabInfo>();
  @Output() tabPin = new EventEmitter<TabInfo>();
  @Output() newTab = new EventEmitter<void>();

  trackByTabId(index: number, tab: TabInfo): string {
    return tab.id;
  }

  onTabClick(tab: TabInfo) { this.tabChange.emit(tab); }
  onTabClose(tab: TabInfo) { this.tabClose.emit(tab); }
  onTabPin(tab: TabInfo) { this.tabPin.emit(tab); }
  onNewTab() { this.newTab.emit(); }
}