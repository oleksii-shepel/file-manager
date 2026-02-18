import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { TabInfo } from "@shared/protocol-enhanced";

@Component({
  selector: 'app-tab',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tab"
         [class.active]="isActive"
         [class.pinned]="tab.isPinned"
         (click)="onClick()"
         (auxclick)="onMouseUp($event)"
         (mouseenter)="isHovered = true"
         (mouseleave)="isHovered = false">
      <span class="tab-icon">📁</span>
      <span class="tab-title">{{ tab.title }}</span>
      <!-- Active Tab Indicators -->
      <div class="tab-border-top" *ngIf="isActive"></div>
      <div class="tab-active-indicator"></div>
      <div class="tab-actions">
        <!-- Pinned indicator/button -->
        <button *ngIf="tab.isPinned" class="tab-action pin" (click)="onPin($event)" 
                [class.active-action]="isActive" title="Unpin tab">
          <span class="pin-icon">📌</span>
        </button>
        <!-- Close button -->
        <button class="tab-action close" (click)="onClose($event)" 
                [class.active-action]="isActive" title="Close (Ctrl+W)"></button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: flex-end;
      height: 100%;
    }

    .tab {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 100%;
      padding: 2px 14px 0 14px; /* shift tab down by 2px */
      min-width: 120px;
      max-width: 240px;
      cursor: pointer;
      user-select: none;
      color: var(--vsc-tab-foreground);
      background: var(--vsc-tab-background);
      border-right: 1px solid var(--vsc-tab-border);
      border-left: 1px solid transparent;
      border-top: 1px solid transparent;
      box-shadow: var(--vsc-tab-shadow);
      transition:
        background var(--vsc-transition-fast),
        color var(--vsc-transition-fast);
    }

    .tab-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: auto;
      height: 100%;
    }

    /* Hover */
    .tab:hover:not(.active) {
      background: var(--vsc-tab-hover-background);
      color: var(--vsc-tab-hover-foreground);
    }

    /* Active */
    .tab.active {
      background: var(--vsc-editor-background); /* match content below */
      color: var(--vsc-tab-active-foreground);
      border-left-color: var(--vsc-tab-border);
      border-right-color: var(--vsc-tab-border);
      border-top-color: var(--vsc-tab-active-border-top);
      position: relative;
      z-index: 5;
    }

    .tab.active::after {
      display: none;
    }

    /* Icon */
    .tab-icon {
      font-size: 15px;
      opacity: .75;
    }

    /* Title */
    .tab-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--vsc-font-size);
    }

    /* Action buttons */
    .tab-action {
      width: 18px;
      height: 18px;
      border: none;
      background: transparent;
      color: inherit;
      opacity: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tab:hover .tab-action {
      opacity: .7;
    }

    .tab-action:hover {
      opacity: 1 !important;
      background: var(--vsc-tab-hover-background);
    }

    .tab.active .tab-action {
      opacity: .6;
    }

    /* Close icon */
    .tab-action.close::before {
      content: "✕";
      font-size: 13px;
    }

    /* Pinned */
    .tab.pinned {
      width: 42px;
      min-width: 42px;
      max-width: 42px;
      justify-content: center;
      padding: 0;
    }

    .tab.pinned .tab-title,
    .tab.pinned .close {
      display: none;
    }

    /* Dirty dot */
    .dirty-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--vsc-tab-foreground);
    }

    .dirty-dot.active-dirty {
      background: var(--vsc-accent-blue);
    }

    /* Compact */
    :host-context(.compact-mode) .tab {
      height: 100%;
      padding: 0 10px;
    }

    :host-context(.compact-mode) .tab.pinned {
      width: 36px;
    }

    /* Focus */
    .tab:focus-visible {
      outline: 1px solid var(--vsc-accent-blue);
      outline-offset: -1px;
    }
  `]
})
export class TabComponent {
  @Input() tab!: TabInfo;
  @Input() isActive = false;

  @Output() tabClick = new EventEmitter<TabInfo>();
  @Output() tabClose = new EventEmitter<TabInfo>();
  @Output() tabPin = new EventEmitter<TabInfo>();

  isHovered = false;

  onClick(): void { this.tabClick.emit(this.tab); }

  onMouseUp(event: MouseEvent): void {
    if (event.button === 1) { // Middle click to close
      this.onClose(event);
    }
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