import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';

export interface FilterPreset {
  id: string;
  name: string;
  filter: string;
  icon?: string;
  description?: string;
  group?: string;
}

export interface FilterGroup {
  name: string;
  presets: FilterPreset[];
}

// The combined filter state emitted to the parent
export interface ActiveFilterState {
  presets: FilterPreset[];   // all selected presets in selection order
  combined: string;          // joined filter string ready for consumption
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar" [class.filter-bar--compact]="compact">

      <!-- ── Trigger button ─────────────────────────────── -->
      <div class="fb-anchor" #dropdownContainer>
        <button
          #triggerBtn
          class="fb-trigger"
          [class.fb-trigger--active]="hasActive"
          [class.fb-trigger--open]="isOpen"
          (click)="toggleDropdown(triggerBtn)"
          (keydown)="onTriggerKey($event, triggerBtn)"
          [attr.aria-expanded]="isOpen"
          [title]="hasActive ? 'Filters active — click to edit' : 'Filter files (Ctrl+Shift+F)'"
        >
          <svg class="fb-trigger-ico" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M15 2v1.5l-5 4.5v5.5l-4-2v-3.5l-5-4.5v-1.5z"/>
          </svg>
          <span class="fb-trigger-label">{{ hasActive ? activePresets.length + ' filter' + (activePresets.length > 1 ? 's' : '') : 'Filter' }}</span>
          <svg class="fb-trigger-caret" [class.fb-trigger-caret--open]="isOpen"
            width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 6l4 4 4-4H4z"/>
          </svg>
        </button>

        <!-- ── Dropdown — position:fixed, coords from getBoundingClientRect ── -->
        <div class="fb-menu" #menuEl *ngIf="isOpen"
          [style.top.px]="dropPos.top"
          [style.left.px]="dropPos.left"
          [style.minWidth.px]="menuWidth"
          (mousedown)="$event.preventDefault()"
          role="menu">

          <!-- AND / OR mode toggle -->
          <div class="fb-mode-row">
            <span class="fb-mode-label">COMBINE WITH</span>
            <div class="fb-mode-toggle">
              <button class="fb-mode-btn" [class.fb-mode-btn--on]="combineMode === 'AND'"
                (click)="setCombineMode('AND')" title="All conditions must match">AND</button>
              <button class="fb-mode-btn" [class.fb-mode-btn--on]="combineMode === 'OR'"
                (click)="setCombineMode('OR')" title="Any condition can match">OR</button>
            </div>
          </div>

          <!-- Groups + items -->
          <div class="fb-menu-body" #menuContent>
            <ng-container *ngFor="let group of groupedPresets; let gi = index">
              <div class="fb-group-head" *ngIf="group.presets.length > 0">
                <span>{{ group.name }}</span>
                <span class="fb-badge">{{ group.presets.length }}</span>
              </div>

              <div *ngFor="let preset of group.presets; let pi = index"
                class="fb-item"
                [class.fb-item--checked]="isSelected(preset)"
                [class.fb-item--focused]="focusedIdx === getItemIdx(gi, pi)"
                (mouseenter)="focusedIdx = getItemIdx(gi, pi)"
                (click)="togglePreset(preset)"
                role="menuitemcheckbox"
                [attr.aria-checked]="isSelected(preset)"
              >
                <span class="fb-checkbox" [class.fb-checkbox--on]="isSelected(preset)" aria-hidden="true">
                  <svg *ngIf="isSelected(preset)" width="9" height="9" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.485 1.929L5.5 9.914 2.515 6.929a1 1 0 0 0-1.414 1.414l3.692 3.693a1 1 0 0 0 1.414 0l8.692-8.693a1 1 0 0 0-1.414-1.414z"/>
                  </svg>
                </span>
                <span class="fb-item-icon">{{ preset.icon || getDefaultIcon(preset) }}</span>
                <span class="fb-item-name">{{ preset.name }}</span>
                <span class="fb-order-badge" *ngIf="isSelected(preset) && activePresets.length > 1">
                  {{ getSelectionOrder(preset) }}
                </span>
              </div>
            </ng-container>
          </div>

          <!-- Footer -->
          <div class="fb-menu-foot">
            <button class="fb-clear-btn" *ngIf="hasActive" (click)="clearAll()">
              <svg width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
              Clear all
            </button>
            <span class="fb-foot-hint" [class.fb-foot-hint--right]="hasActive">
              <kbd>Space</kbd> toggle &nbsp;<kbd>Esc</kbd> close
            </span>
          </div>
        </div>
      </div>

      <!-- ── Active filter tags ─────────────────────────── -->
      <div class="fb-tags" *ngIf="hasActive">
        <span class="fb-mode-badge" *ngIf="activePresets.length > 1">{{ combineMode }}</span>

        <div class="fb-tag" *ngFor="let p of activePresets" [title]="'Remove: ' + p.name">
          <span class="fb-tag-icon">{{ p.icon || getDefaultIcon(p) }}</span>
          <span class="fb-tag-name">{{ p.name }}</span>
          <button class="fb-tag-rm" (click)="togglePreset(p)" aria-label="Remove filter">
            <svg width="8" height="8" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>

        <button class="fb-clear-all" (click)="clearAll()" title="Clear all filters">Clear</button>
      </div>

      <!-- ── Quick chips (only when nothing active) ─────── -->
      <div class="fb-chips" *ngIf="showChips && quickPresets.length > 0 && !hasActive">
        <button *ngFor="let p of quickPresets"
          class="fb-chip" [class.fb-chip--on]="isSelected(p)"
          (click)="togglePreset(p)" [title]="p.description || p.name">
          <span>{{ p.icon || getDefaultIcon(p) }}</span>
          <span>{{ p.name }}</span>
        </button>
      </div>

      <!-- ── Count ──────────────────────────────────────── -->
      <span class="fb-count" *ngIf="hasActive && totalCount > 0">
        {{ filteredCount }}<span class="fb-count-sep">/</span>{{ totalCount }}
      </span>

    </div>
  `,
  styles: [`
    /* ══════════════════════════════════════════════════════
       FILTER BAR — Multi-filter combination
       VS Code design language: dense, functional, zero fluff
    ══════════════════════════════════════════════════════ */

    :host {
      display: block;
      font-family: var(--vsc-font-family, "Segoe UI", system-ui, sans-serif);
      font-size: 13px;
    }

    /* ── Bar ─────────────────────────────────────────────── */
    .filter-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 35px;
      padding: 0 8px;
      background: var(--vsc-sidebar-background, #252526);
      border-bottom: 1px solid var(--vsc-border, #3c3c3c);
      flex-shrink: 0;
      overflow: hidden;
    }

    .filter-bar--compact { height: 28px; padding: 0 6px; }

    /* ── Anchor ──────────────────────────────────────────── */
    .fb-anchor { position: relative; flex-shrink: 0; }

    /* ── Trigger ─────────────────────────────────────────── */
    .fb-trigger {
      display: inline-flex; align-items: center; gap: 5px;
      height: 22px; padding: 0 7px;
      background: transparent; border: 1px solid transparent; border-radius: 2px;
      color: var(--vsc-foreground, #cccccc); font-size: 12px; font-family: inherit;
      cursor: pointer; white-space: nowrap; user-select: none;
      transition: background 0.1s, border-color 0.1s;

      &:hover { background: var(--vsc-list-hover-background, #2a2d2e); }
      &:focus-visible { outline: 1px solid var(--vsc-focus-border, #007fd4); outline-offset: -1px; }
    }

    .fb-trigger--active {
      background: #094771 !important; color: #fff;
      &:hover { background: #0d5b8e !important; }
    }

    .fb-trigger--open { border-color: var(--vsc-border, #3c3c3c); }

    .fb-trigger-ico   { display: block; flex-shrink: 0; opacity: 0.85; }
    .fb-trigger-label { font-size: 12px; line-height: 1; }

    .fb-trigger-caret {
      display: block; flex-shrink: 0; opacity: 0.7;
      transition: transform 0.15s cubic-bezier(0.4,0,0.2,1);
    }
    .fb-trigger-caret--open { transform: rotate(180deg); }

    /* ── Dropdown ────────────────────────────────────────── */
    .fb-menu {
      position: fixed; /* escapes every overflow:hidden ancestor */
      min-width: 250px; max-width: 310px;
      background: var(--vsc-panel-background, #252526);
      border: 1px solid var(--vsc-border, #3c3c3c);
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.14), 0 8px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(0,0,0,0.1);
      z-index: 2000; overflow: hidden;
      animation: fb-in 0.1s cubic-bezier(0.4,0,0.2,1);
    }

    @keyframes fb-in {
      from { opacity: 0; transform: translateY(-3px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── AND/OR toggle row ───────────────────────────────── */
    .fb-mode-row {
      display: flex; align-items: center; justify-content: space-between;
      height: 30px; padding: 0 10px;
      background: color-mix(in srgb, var(--vsc-sidebar-background, #1e1e1e) 80%, var(--vsc-panel-background, #252526));
      border-bottom: 1px solid var(--vsc-border, #3c3c3c);
    }

    .fb-mode-label { font-size: 11px; color: var(--vsc-foreground-dim, #858585); text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }

    .fb-mode-toggle {
      display: flex; align-items: center;
      background: var(--vsc-panel-background, #252526);
      border: 1px solid var(--vsc-border, #3c3c3c);
      border-radius: 3px; overflow: hidden;
    }

    .fb-mode-btn {
      height: 18px; padding: 0 9px;
      background: transparent; border: none;
      color: var(--vsc-foreground-dim, #858585);
      font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
      font-family: var(--vsc-font-family-mono, Consolas, monospace);
      cursor: pointer; transition: background 0.1s, color 0.1s;

      & + & { border-left: 1px solid var(--vsc-border, #3c3c3c); }
      &:hover:not(.fb-mode-btn--on) { background: var(--vsc-list-hover-background, #2a2d2e); color: var(--vsc-foreground, #ccc); }
    }

    .fb-mode-btn--on { background: #007fd4 !important; color: #fff !important; }

    /* ── Menu body ───────────────────────────────────────── */
    .fb-menu-body {
      padding: 3px 0;
    }

    /* ── Group header ────────────────────────────────────── */
    .fb-group-head {
      display: flex; align-items: center; justify-content: space-between;
      height: 22px; padding: 0 10px; margin-top: 2px;
      font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px;
      color: var(--vsc-foreground-dim, #858585);
      &:first-child { margin-top: 0; }
    }

    .fb-badge {
      font-size: 9.5px; font-weight: 700;
      background: var(--vsc-badge-background, #4d4d4d); color: #fff;
      border-radius: 10px; padding: 1px 5px; min-width: 16px; text-align: center;
    }

    /* ── Row item ────────────────────────────────────────── */
    .fb-item {
      display: flex; align-items: center; gap: 8px;
      height: 24px; padding: 0 10px;
      cursor: pointer; transition: background 0.08s;
      border-left: 2px solid transparent;

      &:hover, &.fb-item--focused { background: var(--vsc-list-hover-background, #2a2d2e); }

      &.fb-item--checked {
        background: color-mix(in srgb, #094771 16%, transparent);
        border-left-color: #007fd4;
        &:hover, &.fb-item--focused { background: color-mix(in srgb, #094771 24%, transparent); }
      }
    }

    /* Checkbox */
    .fb-checkbox {
      flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      width: 13px; height: 13px;
      border: 1px solid var(--vsc-border-bright, #5a5a5a);
      border-radius: 2px;
      background: var(--vsc-panel-background, #252526);
      transition: background 0.1s, border-color 0.1s;
    }

    .fb-checkbox--on { background: #007fd4 !important; border-color: #007fd4 !important; }

    .fb-item-icon { flex-shrink: 0; font-size: 13px; width: 16px; text-align: center; line-height: 1; }

    .fb-item-name {
      flex: 1; font-size: 13px;
      color: var(--vsc-foreground, #cccccc);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* Selection-order number badge */
    .fb-order-badge {
      flex-shrink: 0; display: flex; align-items: center; justify-content: center;
      width: 16px; height: 16px;
      background: #007fd4; color: #fff;
      border-radius: 50%;
      font-size: 9.5px; font-weight: 700; line-height: 1;
    }

    /* ── Menu footer ─────────────────────────────────────── */
    .fb-menu-foot {
      display: flex; align-items: center; justify-content: space-between;
      height: 26px; padding: 0 10px;
      background: color-mix(in srgb, var(--vsc-sidebar-background, #1e1e1e) 60%, var(--vsc-panel-background, #252526));
      border-top: 1px solid var(--vsc-border, #3c3c3c);
    }

    .fb-foot-hint {
      font-size: 11px; color: var(--vsc-foreground-dim, #858585); margin-left: auto;

      kbd {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 16px; height: 14px; padding: 0 3px;
        background: #0a0a0a;
        border: 1px solid var(--vsc-border, #3c3c3c); border-bottom-width: 2px;
        border-radius: 3px;
        font-family: var(--vsc-font-family-mono, Consolas, monospace);
        font-size: 9.5px; color: #cccccc; line-height: 1; margin: 0 1px;
      }
    }

    .fb-clear-btn {
      display: inline-flex; align-items: center; gap: 4px;
      height: 18px; padding: 0 7px;
      background: transparent; border: 1px solid var(--vsc-border, #3c3c3c);
      border-radius: 2px; cursor: pointer;
      color: var(--vsc-error, #f14c4c); font-size: 11px; font-family: inherit;
      transition: background 0.1s, border-color 0.1s;
      &:hover { background: color-mix(in srgb, var(--vsc-error, #f14c4c) 12%, transparent); border-color: var(--vsc-error, #f14c4c); }
    }

    /* ── Active tags strip ───────────────────────────────── */
    .fb-tags {
      display: flex; align-items: center; gap: 3px;
      flex: 1; min-width: 0;
      overflow-x: auto; overflow-y: visible;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }

    .fb-mode-badge {
      flex-shrink: 0;
      display: inline-flex; align-items: center; justify-content: center;
      height: 16px; padding: 0 5px;
      background: color-mix(in srgb, #007fd4 20%, transparent);
      border: 1px solid rgba(0,127,212,0.4);
      border-radius: 2px;
      font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px;
      font-family: var(--vsc-font-family-mono, Consolas, monospace);
      color: #7ec8f8;
    }

    .fb-tag {
      flex-shrink: 0;
      display: inline-flex; align-items: center; gap: 3px;
      height: 20px; padding: 0 4px 0 6px;
      background: #094771;
      border: 1px solid rgba(0,127,212,0.4);
      border-radius: 2px; color: #ccddff; font-size: 11.5px;
      animation: fb-tag-in 0.12s cubic-bezier(0.4,0,0.2,1);
    }

    @keyframes fb-tag-in {
      from { opacity: 0; transform: scale(0.85); }
      to   { opacity: 1; transform: scale(1); }
    }

    .fb-tag-icon { font-size: 11px; line-height: 1; }
    .fb-tag-name { white-space: nowrap; line-height: 1; }

    .fb-tag-rm {
      display: flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; padding: 0;
      background: transparent; border: none; border-radius: 2px;
      color: rgba(204,221,255,0.55); cursor: pointer;
      transition: background 0.1s, color 0.1s; flex-shrink: 0;
      &:hover { background: rgba(255,255,255,0.15); color: #fff; }
    }

    .fb-clear-all {
      flex-shrink: 0;
      display: inline-flex; align-items: center;
      height: 18px; padding: 0 6px;
      background: transparent; border: 1px solid transparent; border-radius: 2px;
      cursor: pointer; color: var(--vsc-foreground-dim, #858585);
      font-size: 11.5px; font-family: inherit;
      transition: background 0.1s, color 0.1s, border-color 0.1s;
      &:hover { background: color-mix(in srgb, var(--vsc-error, #f14c4c) 10%, transparent); border-color: rgba(241,76,76,0.4); color: var(--vsc-error, #f14c4c); }
    }

    /* ── Quick chips ─────────────────────────────────────── */
    .fb-chips { display: flex; align-items: center; gap: 3px; }

    .fb-chip {
      display: inline-flex; align-items: center; gap: 3px;
      height: 20px; padding: 0 7px;
      background: transparent; border: 1px solid var(--vsc-border, #3c3c3c);
      border-radius: 2px; cursor: pointer;
      color: var(--vsc-foreground-dim, #858585);
      font-size: 11.5px; font-family: inherit;
      transition: background 0.08s, border-color 0.08s, color 0.08s;
      &:hover { background: var(--vsc-list-hover-background, #2a2d2e); border-color: var(--vsc-border-bright, #5a5a5a); color: var(--vsc-foreground, #ccc); }
      &.fb-chip--on { background: #094771; border-color: transparent; color: #ccddff; }
    }

    /* ── Count indicator ─────────────────────────────────── */
    .fb-count {
      flex-shrink: 0; margin-left: auto;
      font-size: 11px; font-family: var(--vsc-font-family-mono, Consolas, monospace);
      color: var(--vsc-foreground-dim, #858585); white-space: nowrap;
    }
    .fb-count-sep { opacity: 0.4; margin: 0 1px; }

    /* ── Compact mode ────────────────────────────────────── */
    .filter-bar--compact {
      .fb-trigger  { height: 20px; font-size: 11.5px; }
      .fb-chip     { height: 18px; }
      .fb-tag      { height: 18px; font-size: 11px; }
      .fb-item     { height: 22px; }
      .fb-mode-row { height: 26px; }
    }

    /* ── Light theme ─────────────────────────────────────── */
    :host-context(.vscode-light) {
      .fb-trigger--active,
      .fb-chip--on { background: #0060c0 !important; }
      .fb-tag       { background: #0060c0; }
      .fb-mode-btn--on { background: #0060c0 !important; }
      .fb-item--checked { background: color-mix(in srgb, #0060c0 10%, transparent); border-left-color: #0060c0; }
      .fb-checkbox--on  { background: #0060c0 !important; border-color: #0060c0 !important; }
      .fb-order-badge   { background: #0060c0; }
      .fb-mode-badge    { background: color-mix(in srgb, #0060c0 15%, transparent); border-color: rgba(0,96,192,0.4); color: #0060c0; }
    }
  `]
})
export class FilterBarComponent implements OnInit, OnDestroy {
  @ViewChild('menuContent')       menuContentRef?: ElementRef<HTMLDivElement>;
  @ViewChild('dropdownContainer') dropdownContainerRef?: ElementRef<HTMLElement>;
  @ViewChild('triggerBtn')        triggerBtnRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('menuEl')            menuElRef?: ElementRef<HTMLElement>;

  @Input() presets: FilterPreset[] = [
    { id: 'all',       name: 'All Files',  filter: '',                        icon: '📄', group: 'Basic' },
    { id: 'folders',   name: 'Folders',    filter: 'type:dir',                icon: '📁', group: 'Basic' },
    { id: 'files',     name: 'Files Only', filter: 'type:file',               icon: '📄', group: 'Basic' },
    { id: 'images',    name: 'Images',     filter: 'ext:jpg ext:png ext:gif', icon: '🖼️', group: 'Type' },
    { id: 'documents', name: 'Documents',  filter: 'ext:pdf ext:doc ext:txt', icon: '📝', group: 'Type' },
    { id: 'code',      name: 'Code',       filter: 'ext:ts ext:js ext:py',    icon: '💻', group: 'Type' },
    { id: 'recent',    name: 'Recent',     filter: 'modified:today',          icon: '⚡', group: 'Date' },
    { id: 'large',     name: 'Large',      filter: 'size>10mb',               icon: '📦', group: 'Size' },
  ];

  @Input() quickPresets: FilterPreset[] = [
    { id: 'folders', name: 'Folders', filter: 'type:dir',        icon: '📁' },
    { id: 'images',  name: 'Images',  filter: 'ext:jpg ext:png', icon: '🖼️' },
    { id: 'recent',  name: 'Recent',  filter: 'modified:today',  icon: '⚡' },
  ];

  @Input() totalCount    = 0;
  @Input() filteredCount = 0;
  @Input() showChips     = true;
  @Input() compact       = false;
  @Input() menuWidth     = 250;

  /** Emits the full active state (ordered presets + combined string) */
  @Output() filterChange = new EventEmitter<ActiveFilterState>();
  @Output() filterClear  = new EventEmitter<void>();

  isOpen        = false;
  combineMode: 'AND' | 'OR' = 'AND';
  focusedIdx    = -1;
  groupedPresets: FilterGroup[] = [];
  dropPos = { top: 0, left: 0 };

  /** Selected presets in the order they were picked */
  activePresets: FilterPreset[] = [];

  get hasActive(): boolean { return this.activePresets.length > 0; }

  private destroy$ = new Subject<void>();

  // ── Lifecycle ────────────────────────────────────────────

  ngOnInit():    void { this.groupPresets(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Grouping ─────────────────────────────────────────────

  private groupPresets(): void {
    const map = new Map<string, FilterPreset[]>();
    for (const p of this.presets) {
      const g = p.group || 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(p);
    }
    this.groupedPresets = Array.from(map.entries()).map(([name, presets]) => ({ name, presets }));
  }

  // ── Selection ─────────────────────────────────────────────

  isSelected(preset: FilterPreset): boolean {
    return this.activePresets.some(p => p.id === preset.id);
  }

  getSelectionOrder(preset: FilterPreset): number {
    return this.activePresets.findIndex(p => p.id === preset.id) + 1;
  }

  togglePreset(preset: FilterPreset): void {
    if (this.isSelected(preset)) {
      this.activePresets = this.activePresets.filter(p => p.id !== preset.id);
    } else {
      this.activePresets = [...this.activePresets, preset];
    }
    this.emit();
  }

  setCombineMode(mode: 'AND' | 'OR'): void {
    this.combineMode = mode;
    if (this.hasActive) this.emit();
  }

  clearAll(): void {
    this.activePresets = [];
    this.isOpen = false;
    this.filterClear.emit();
    this.filterChange.emit({ presets: [], combined: '' });
  }

  private emit(): void {
    const sep      = this.combineMode === 'OR' ? ' OR ' : ' ';
    const combined = this.activePresets.map(p => p.filter).filter(Boolean).join(sep);
    this.filterChange.emit({ presets: [...this.activePresets], combined });
  }

  // ── Dropdown ──────────────────────────────────────────────

  toggleDropdown(btn: HTMLElement): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      const r = btn.getBoundingClientRect();
      this.dropPos = { top: r.bottom + 3, left: r.left };
      this.focusedIdx = 0;
      this.groupPresets();
    }
  }

  // ── Keyboard ──────────────────────────────────────────────

  onTriggerKey(e: KeyboardEvent, btn: HTMLElement): void {
    if (['ArrowDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (!this.isOpen) this.toggleDropdown(btn); }
    else if (e.key === 'Escape' && this.isOpen) { this.isOpen = false; }
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const total = this.groupedPresets.reduce((s, g) => s + g.presets.length, 0);
    if      (e.key === 'ArrowDown') { e.preventDefault(); this.focusedIdx = Math.min(this.focusedIdx + 1, total - 1); this.scrollToFocused(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); this.focusedIdx = Math.max(this.focusedIdx - 1, 0); this.scrollToFocused(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.activateFocused(); }
    else if (e.key === 'Escape')    { e.preventDefault(); this.isOpen = false; }
  }

  private activateFocused(): void {
    let idx = 0;
    for (const g of this.groupedPresets) {
      for (const p of g.presets) {
        if (idx++ === this.focusedIdx) { this.togglePreset(p); return; }
      }
    }
  }

  private scrollToFocused(): void {
    if (!this.menuContentRef || this.focusedIdx < 0) return;
    const items = this.menuContentRef.nativeElement.querySelectorAll('.fb-item');
    items[this.focusedIdx]?.scrollIntoView({ block: 'nearest' });
  }

  // ── Index helpers ─────────────────────────────────────────

  getItemIdx(gi: number, pi: number): number {
    let idx = 0;
    for (let i = 0; i < gi; i++) idx += this.groupedPresets[i].presets.length;
    return idx + pi;
  }

  // ── Icon defaults ─────────────────────────────────────────

  getDefaultIcon(p: FilterPreset): string {
    if (p.filter.includes('type:dir'))   return '📁';
    if (p.filter.includes('type:file'))  return '📄';
    if (p.filter.includes('ext:pdf'))    return '📕';
    if (p.filter.includes('ext:jpg'))    return '🖼️';
    if (p.filter.includes('size>'))      return '📦';
    if (p.filter.includes('modified:'))  return '⚡';
    return '📄';
  }

  // ── Outside click ─────────────────────────────────────────

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.isOpen) return;
    const inAnchor = this.dropdownContainerRef?.nativeElement.contains(e.target as Node);
    const inMenu   = this.menuElRef?.nativeElement.contains(e.target as Node);
    if (!inAnchor && !inMenu) this.isOpen = false;
  }

  @HostListener('window:keydown.control.shift.f', ['$event'])
  onShortcut(e: any): void {
    e.preventDefault();
    if (this.triggerBtnRef) this.toggleDropdown(this.triggerBtnRef.nativeElement);
  }
}