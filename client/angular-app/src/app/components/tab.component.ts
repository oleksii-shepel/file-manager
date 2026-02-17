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

      <div class="tab-actions">
        <!-- Dirty dot (modified) - only show when not hovered -->
        <span *ngIf="!isHovered" class="dirty-dot" [class.active-dirty]="isActive"></span>
        
        <!-- Pinned indicator/button -->
        <button *ngIf="tab.isPinned" class="tab-action pin" (click)="onPin($event)" 
                [class.active-action]="isActive" title="Unpin tab">
          <span class="pin-icon">📌</span>
        </button>
        
        <!-- Close button -->
        <button class="tab-action close" (click)="onClose($event)" 
                [class.active-action]="isActive" title="Close (Ctrl+W)"></button>
      </div>
      
      <!-- Active Tab Indicators -->
      <div class="tab-border-top" *ngIf="isActive"></div>
      <div class="tab-active-indicator"></div>
    </div>
  `,
styles: [`
  .tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 34px;
    min-width: 120px;
    max-width: 240px;
    cursor: pointer;

    color: var(--vsc-foreground-dim);
    background: transparent;

    border-radius: 8px 8px 0 0;

    transition:
      background 140ms ease,
      color 140ms ease,
      box-shadow 160ms ease;
  }

  /* hover */
  .tab:hover {
    background: rgba(255,255,255,.06);
    color: var(--vsc-foreground);
  }

  /* active tab */
  .tab.active {
    background: var(--vsc-editor-background);
    color: var(--vsc-foreground);
    z-index: 2;

    box-shadow:
      0 -1px 0 rgba(255,255,255,.06),
      0 2px 6px rgba(0,0,0,.35);
  }

  /* icon */
  .tab-icon {
    font-size: 15px;
    opacity: .75;
    transform: translateY(.5px);
  }

  /* title */
  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  /* buttons */
  .tab-close,
  .tab-pin {
    width: 18px;
    height: 18px;
    border: none;
    background: transparent;
    color: var(--vsc-foreground-dim);

    display:flex;
    align-items:center;
    justify-content:center;

    opacity:0;
    border-radius:4px;
    transform: scale(.85);

    transition: all 140ms ease;
  }

  .tab:hover .tab-close,
  .tab:hover .tab-pin {
    opacity:.75;
    transform: scale(1);
  }

  .tab-close:hover,
  .tab-pin:hover {
    opacity:1;
    background: rgba(255,255,255,.12);
  }

  /* icons */
  .tab-close::before { content:"✕"; font-size:14px; }
  .tab-pin::before { content:"📌"; font-size:11px; }

  /* pinned */
  .tab.pinned {
    width:42px;
    min-width:42px;
    max-width:42px;
    justify-content:center;
    padding:0;
  }

  .tab.pinned .tab-title,
  .tab.pinned .tab-close {
    display:none;
  }

  /* pinned dot */
  .tab.pinned .tab-icon::after {
    content:'';
    position:absolute;
    bottom:-2px;
    left:50%;
    transform:translateX(-50%);
    width:4px;
    height:4px;
    border-radius:50%;
    background: var(--vsc-accent-blue);
  }

  /* compact */
  :host-context(.compact-mode) .tab {
    height:28px;
    padding:0 10px;
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