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
          
          <!-- New Tab Button -->
          <button class="new-tab-btn" (click)="onNewTab()" [class.compact]="isCompact" title="New Tab (Ctrl+N)">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      background: var(--vsc-tabbar-background);
      border-bottom: 1px solid var(--vsc-tab-border);
      overflow: hidden;
      height: 35px;
    }

    .tab-bar-container {
      display: flex;
      height: 100%;
      align-items: flex-end;
      padding-left: 6px;
      background: var(--vsc-tabbar-background);
    }

    .tab-bar-container.compact {
      height: 100%;
      min-height: 0;
    }

    .tabs-scroll-viewport {
      flex: 1;
      display: flex;
      overflow-x: auto;
      scrollbar-width: none;
      height: 100%;
    }

    .tabs-scroll-viewport::-webkit-scrollbar {
      display: none;
    }

    .tabs-list {
      display: flex;
      align-items: stretch;
      height: 100%;
      min-height: 0;
    }

    ::ng-deep app-tab {
      display: flex;
      align-items: stretch;
      height: 100%;
    }

    /* Fade overflow */
    .tabs-scroll-viewport::after {
      content: "";
      position: sticky;
      right: 0;
      width: 24px;
      height: 100%;
      pointer-events: none;
      background: linear-gradient(
        to right,
        transparent,
        var(--vsc-tabbar-background)
      );
      z-index: 3;
    }

    /* New Tab Button */
    .new-tab-btn {
      width: 30px;
      height: 30px;
      margin: auto 4px 0 6px;
      border: none;
      background: transparent;
      color: var(--vsc-tab-foreground);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .new-tab-btn:hover {
      background: var(--vsc-tab-hover-background);
      color: var(--vsc-tab-hover-foreground);
    }

    .new-tab-btn.compact {
      width: 26px;
      height: 26px;
    }
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