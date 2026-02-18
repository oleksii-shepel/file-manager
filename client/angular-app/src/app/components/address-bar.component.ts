import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  HostListener,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { PathHistoryService, PathSuggestion } from '../services/path-history.service';
import { ApiService } from '../services/api.service';
import { FileType } from '@shared/protocol';

// ─── Types ─────────────────────────────────────────────────────────────────

interface PathSegment {
  label: string;       // Display label, e.g. "Documents"
  fullPath: string;    // Absolute path up to + including this segment
  isRoot: boolean;     // True only for the root/drive node
  rootLabel?: string;  // e.g. "C:" or "/"
}

interface SiblingEntry {
  name: string;
  path: string;
  isCurrent: boolean;
}

interface PinnedPath {
  path: string;
  label: string;
  icon: string;
  addedAt: number;
}

interface ContextMenu {
  visible: boolean;
  x: number;
  y: number;
  segmentIndex: number;
  segment: PathSegment | null;
}

const PINNED_KEY = 'filemanager:pinned-paths-v2';

// ─── Utilities ──────────────────────────────────────────────────────────────

/**
 * Detect whether a path string looks like a Windows path.
 * Matches  C:\...  or  C:/...  (drive letter + colon)
 */
function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:/.test(p);
}

/**
 * Normalise a path consistently for both Unix and Windows.
 * Always uses forward-slash as separator internally.
 */
function normalizePath(p: string): string {
  if (!p) return '/';
  // Convert backslashes
  let n = p.replace(/\\/g, '/');
  // Collapse double slashes, but preserve the drive prefix  "C://"
  if (isWindowsPath(n)) {
    const drive = n.slice(0, 2); // "C:"
    const rest  = n.slice(2).replace(/\/+/g, '/');
    n = drive + (rest.startsWith('/') ? rest : '/' + rest);
  } else {
    n = n.replace(/\/+/g, '/');
  }
  // Trim trailing slash unless it's the only character or a Windows root
  if (n.length > 1 && n.endsWith('/') && !(/^[A-Za-z]:\//.test(n) && n.length === 3)) {
    n = n.slice(0, -1);
  }
  return n || '/';
}

/**
 * Split a normalised path into segments.
 * Unix  /home/user/docs  → [{root:"/"}, {label:"home"}, {label:"user"}, {label:"docs"}]
 * Win   C:/Users/docs    → [{root:"C:"}, {label:"Users"}, {label:"docs"}]
 */
function buildSegments(p: string): PathSegment[] {
  if (!p) return [];

  if (isWindowsPath(p)) {
    const drive = p.slice(0, 2).toUpperCase(); // "C:"
    const rest   = p.slice(3);                  // after "C:/"
    const parts  = rest ? rest.split('/').filter(Boolean) : [];
    const segs: PathSegment[] = [{
      label: drive, // Show 'C:' only
      fullPath: drive + '/',
      isRoot: true,
      rootLabel: drive,
    }];
    parts.forEach((part, i) => {
      segs.push({
        label: part,
        fullPath: drive + '/' + parts.slice(0, i + 1).join('/'),
        isRoot: false,
      });
    });
    return segs;
  }

  // Unix
  const parts = p.split('/').filter(Boolean);
  const segs: PathSegment[] = [{
    label: '/',
    fullPath: '/',
    isRoot: true,
    rootLabel: '/',
  }];
  parts.forEach((part, i) => {
    segs.push({
      label: part,
      fullPath: '/' + parts.slice(0, i + 1).join('/'),
      isRoot: false,
    });
  });
  return segs;
}

function parentPath(p: string): string {
  const n = normalizePath(p);
  // Windows root
  if (/^[A-Za-z]:\/$/.test(n) || /^[A-Za-z]:$/.test(n)) return n;
  if (n === '/') return '/';
  const parts = n.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return isWindowsPath(n) ? parts[0] + '/' : '/';
  }
  parts.pop();
  if (isWindowsPath(n)) {
    const drive = parts[0]; // "C:"
    const rest   = parts.slice(1);
    return rest.length ? drive + '/' + rest.join('/') : drive + '/';
  }
  return '/' + parts.join('/');
}

// ───────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-address-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<!-- ═══════════════════════════════════════════════════════
     ADDRESS BAR  —  Breadcrumb + Edit modes
═══════════════════════════════════════════════════════════ -->
<div class="ab-host" (keydown)="onHostKeyDown($event)">

  <!-- ── BREADCRUMB ROW ───────────────────────────────── -->
  <div class="ab-bar" *ngIf="!editMode" [class.ab-bar--compact]="compact">

    <!-- Left cluster: pin-star + pinned-list -->
    <div class="ab-cluster ab-cluster--left">

      <!-- Pin / unpin current path -->
      <button
        class="ab-btn ab-btn--star"
        [class.ab-btn--pinned]="isPinned"
        (click)="togglePin()"
        [title]="isPinned ? 'Unpin this path' : 'Pin this path'"
        aria-label="Toggle pin"
      >{{ isPinned ? '★' : '☆' }}</button>

      <!-- Pinned-paths dropdown trigger -->
      <div class="ab-drop-anchor" #pinAnchor>
        <button
          class="ab-btn ab-btn--pinlist"
          [class.ab-btn--open]="showPinDrop"
          (click)="togglePinDrop()"
          title="Pinned paths"
          aria-label="Open pinned paths"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 1.5a1 1 0 0 0-1.415 0L4.94 4.645a3.5 3.5 0 0 0-.871 3.547l-2.646 2.647a.5.5 0 0 0 .708.707l2.646-2.646a3.5 3.5 0 0 0 3.547-.872l3.144-3.144A1 1 0 0 0 11.5 3l-2-1.5z"/>
          </svg>
        </button>

        <!-- Pin dropdown -->
        <div class="ab-dropdown ab-pin-drop" *ngIf="showPinDrop">
          <div class="ab-drop-head">
            <span>Pinned Paths</span>
            <span class="ab-drop-count">{{ pinnedPaths.length }}</span>
          </div>
          <div class="ab-drop-empty" *ngIf="pinnedPaths.length === 0">
            <span class="ab-drop-empty-icon">📍</span>
            <span>No pinned paths yet.<br>Click ☆ to pin the current path.</span>
          </div>
          <div
            *ngFor="let p of pinnedPaths"
            class="ab-drop-item ab-pin-item"
            [class.ab-drop-item--active]="p.path === currentPath"
            (click)="navigateTo(p.path)"
          >
            <span class="ab-pin-icon">{{ p.icon }}</span>
            <span class="ab-pin-label" [title]="p.path">{{ p.label }}</span>
            <span class="ab-pin-sub">{{ shortenPath(p.path) }}</span>
            <button
              class="ab-pin-remove"
              (click)="removePin(p, $event)"
              title="Remove"
              aria-label="Remove pin"
            >✕</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Scrollable breadcrumb trail -->
    <div 
      class="ab-crumbs" 
      (click)="onCrumbsClick($event)"
    >
      <div class="ab-crumbs-inner" #crumbsEl>
        <ng-container *ngFor="let seg of segments; let i = index; let last = last">

          <!-- Segment pill -->
          <span
            class="ab-seg"
            [class.ab-seg--root]="seg.isRoot"
            [class.ab-seg--last]="last"
            [class.ab-seg--win-drive]="seg.isRoot && isWin"
            (click)="onSegClick(seg, $event)"
            (contextmenu)="onSegRightClick(seg, i, $event)"
            [title]="seg.fullPath"
          >{{ seg.label }}</span>

          <!-- Chevron + sibling dropdown (between segments) -->
          <div class="ab-chev-wrap" *ngIf="!last">
            <button
              class="ab-chev"
              [class.ab-chev--open]="chevIdx === i"
              (click)="toggleChev(i, seg, $event)"
              aria-label="Browse siblings"
              #chevBtn
            >›</button>
          </div>
          <!-- Sibling dropdown rendered at root for visibility -->
          <div
            class="ab-dropdown ab-sib-drop"
            *ngIf="chevIdx >= 0"
            [ngStyle]="{ left: sibDropLeft + 'px', top: sibDropTop + 'px', position: 'fixed' }"
          >
            <div class="ab-drop-head">
              <span>{{ segments[chevIdx].label }}</span>
              <span class="ab-drop-count" *ngIf="!sibLoading">{{ siblings.length }}</span>
            </div>
            <div class="ab-drop-loading" *ngIf="sibLoading">
              <span class="ab-spinner"></span>Loading…
            </div>
            <div class="ab-drop-empty" *ngIf="!sibLoading && siblings.length === 0">
              <span class="ab-drop-empty-icon">📭</span>
              <span>No sub-folders</span>
            </div>
            <div
              *ngFor="let s of siblings"
              class="ab-drop-item ab-sib-item"
              [class.ab-drop-item--active]="s.isCurrent"
              (click)="onSibClick(s)"
            >
              <span class="ab-sib-folder">📁</span>
              <span class="ab-sib-name">{{ s.name }}</span>
              <svg *ngIf="s.isCurrent" class="ab-sib-check" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.485 1.929L5.5 9.914 2.515 6.929a1 1 0 0 0-1.414 1.414l3.692 3.693a1 1 0 0 0 1.414 0l8.692-8.693a1 1 0 0 0-1.414-1.414z"/>
              </svg>
            </div>
          </div>
        </ng-container>
      </div>
    </div>

    <!-- Right cluster: Up / Refresh / Copy -->
    <div class="ab-cluster ab-cluster--right">
      <button class="ab-btn" (click)="goUp()" title="Parent directory" aria-label="Go up">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1z" transform="rotate(180,8,8)"/>
        </svg>
      </button>
      <button class="ab-btn" (click)="refresh()" title="Refresh (F5)" aria-label="Refresh">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
      </button>
      <button class="ab-btn" (click)="copyPath()" [class.ab-btn--copied]="justCopied" title="Copy path" aria-label="Copy path">
        <svg *ngIf="!justCopied" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
          <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
        </svg>
        <svg *ngIf="justCopied" width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.485 1.929L5.5 9.914 2.515 6.929a1 1 0 0 0-1.414 1.414l3.692 3.693a1 1 0 0 0 1.414 0l8.692-8.693a1 1 0 0 0-1.414-1.414z"/>
        </svg>
      </button>
    </div>
  </div>

  <!-- ── EDIT MODE ROW ─────────────────────────────────── -->
  <div class="ab-edit" *ngIf="editMode">
    <span class="ab-edit-icon">📂</span>
    <input
      #editInput
      class="ab-edit-input"
      type="text"
      [(ngModel)]="editValue"
      (ngModelChange)="onEditChange($event)"
      (keydown)="onEditKeyDown($event)"
      (blur)="onEditBlur()"
      [placeholder]="placeholder"
      autocomplete="off"
      spellcheck="false"
    />
    <span class="ab-edit-hint" *ngIf="!editValue">{{ currentPath }}</span>
    <button class="ab-btn ab-btn--cancel" (click)="exitEditMode(false)" title="Cancel (Esc)" aria-label="Cancel">✕</button>
  </div>

  <!-- ── AUTOCOMPLETE DROPDOWN ──────────────────────────── -->
  <div class="ab-dropdown ab-autocomplete" *ngIf="editMode && suggestions.length > 0">
    <div
      *ngFor="let s of suggestions; let i = index"
      class="ab-drop-item ab-ac-item"
      [class.ab-drop-item--focus]="acIdx === i"
      (mouseenter)="acIdx = i"
      (mousedown)="acceptSuggestion(s, $event)"
    >
      <span class="ab-ac-badge ab-ac-badge--{{ s.matchType }}">{{ s.matchType }}</span>
      <span class="ab-ac-path" [innerHTML]="highlightMatch(s.path, editValue)"></span>
    </div>
    <div class="ab-ac-footer">
      <kbd>↑↓</kbd> navigate &nbsp; <kbd>⏎</kbd> select &nbsp; <kbd>Tab</kbd> first &nbsp; <kbd>Esc</kbd> cancel
    </div>
  </div>

  <!-- ── RIGHT-CLICK CONTEXT MENU ──────────────────────── -->
  <div
    class="ab-ctx-menu"
    *ngIf="ctxMenu.visible"
    [style.left.px]="ctxMenu.x"
    [style.top.px]="ctxMenu.y"
  >
    <div class="ab-ctx-path">{{ ctxMenu.segment?.fullPath }}</div>
    <hr class="ab-ctx-divider"/>
    <button class="ab-ctx-item" (click)="ctxNavigateTo()">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h2.764c.958 0 1.76.56 2.311 1.184C7.985 3.648 8.48 4 9 4h4.5A1.5 1.5 0 0 1 15 5.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12.5v-9z"/></svg>
      Navigate here
    </button>
    <button class="ab-ctx-item" (click)="ctxCopyPath()">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
      Copy path
    </button>
    <button class="ab-ctx-item" (click)="ctxCopyName()">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5L14 4.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5h-2z"/></svg>
      Copy folder name
    </button>
    <hr class="ab-ctx-divider"/>
    <button class="ab-ctx-item" (click)="ctxOpenOtherPane()">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3zm8.5-1v12H14a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H8.5zM7.5 2H2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h5.5V2z"/></svg>
      Open in other pane
    </button>
    <button class="ab-ctx-item" (click)="ctxPinPath()">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 1.5a1 1 0 0 0-1.415 0L4.94 4.645a3.5 3.5 0 0 0-.871 3.547l-2.646 2.647a.5.5 0 0 0 .708.707l2.646-2.646a3.5 3.5 0 0 0 3.547-.872l3.144-3.144A1 1 0 0 0 11.5 3l-2-1.5z"/></svg>
      {{ isSegmentPinned(ctxMenu.segment) ? 'Unpin path' : 'Pin path' }}
    </button>
  </div>

</div>
  `,
  styles: [`
/* ═══════════════════════════════════════════════════════════
   ADDRESS BAR — Production-grade VS Code dark theme style
   Aesthetic: Refined industrial minimalism
   Key: every detail intentional, no decoration for its own sake
═══════════════════════════════════════════════════════════ */

:host {
  display: block;
  position: relative;
  font-family: var(--vsc-font-family);
  font-size: var(--vsc-font-size);
}

/* ── Host wrapper ─────────────────────────────────────── */
.ab-host {
  position: relative;
  background: var(--vsc-sidebar-background);
  border-bottom: 1px solid var(--vsc-border);
}

/* ── Breadcrumb bar ───────────────────────────────────── */
.ab-bar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 4px;
  gap: 2px;
  overflow: visible;
}

.ab-bar--compact { height: 27px; }

/* ── Left / right clusters ────────────────────────────── */
.ab-cluster {
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}

.ab-cluster--left { padding-right: 3px; border-right: 1px solid var(--vsc-border); margin-right: 4px; }
.ab-cluster--right { padding-left: 3px; border-left: 1px solid var(--vsc-border); margin-left: 4px; }

/* ── Generic icon button ──────────────────────────────── */
.ab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--vsc-foreground-dim);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, transform 0.08s;
  flex-shrink: 0;

  &:hover {
    background: var(--vsc-list-hover-background);
    color: var(--vsc-foreground);
  }
  &:active { transform: scale(0.9); }
}

.ab-btn--star {
  font-size: 15px;
  color: var(--vsc-foreground-dim);
  &:hover { color: #e6b800; }
}
.ab-btn--pinned { color: #e6b800 !important; }

.ab-btn--pinlist svg { opacity: 0.6; transition: opacity 0.1s; }
.ab-btn--pinlist:hover svg { opacity: 1; }
.ab-btn--open {
  background: color-mix(in srgb, var(--vsc-accent-blue) 18%, transparent);
  color: var(--vsc-accent-blue);
  svg { opacity: 1; }
}

.ab-btn--copied { color: var(--vsc-success) !important; }
.ab-btn--cancel { font-size: 11px; color: var(--vsc-foreground-dim); }

/* ── Crumbs scroll area ───────────────────────────────── */
.ab-crumbs {
  display: block;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow: visible; /* allow dropdowns to overflow */
  cursor: text;
}

.ab-crumbs-inner {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: visible;
  gap: 0;
  scroll-behavior: smooth;
  position: static !important;

  /* Hide scrollbar but keep scrollable */
  scrollbar-width: none;
}
.ab-crumbs-inner::-webkit-scrollbar { display: none; }

/* ── Segment pill ─────────────────────────────────────── */
.ab-seg {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 5px;
  border-radius: 3px;
  color: var(--vsc-foreground-dim);
  font-size: 12.5px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.08s, color 0.08s;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background: var(--vsc-list-hover-background);
    color: var(--vsc-foreground);
  }

  /* Root / drive */
  &.ab-seg--root {
    font-weight: 600;
    color: var(--vsc-foreground);
    letter-spacing: 0.2px;
  }

  /* Windows drive badge */
  &.ab-seg--win-drive {
    background: color-mix(in srgb, var(--vsc-accent-blue) 12%, transparent);
    color: var(--vsc-accent-blue);
    border: 1px solid color-mix(in srgb, var(--vsc-accent-blue) 30%, transparent);
    font-family: var(--vsc-font-family-mono);
    letter-spacing: 0.5px;

    &:hover {
      background: color-mix(in srgb, var(--vsc-accent-blue) 22%, transparent);
      color: var(--vsc-foreground-bright);
    }
  }

  /* Last (current) segment */
  &.ab-seg--last {
    color: var(--vsc-foreground-bright);
    font-weight: 500;
    cursor: default;
    max-width: 240px;
    &:hover { background: transparent; }
  }
}

/* ── Chevron button ───────────────────────────────────── */
.ab-chev-wrap {
  position: relative;
  flex-shrink: 0;
}

.ab-chev-wrap { overflow: visible; }

.ab-chev {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--vsc-border-bright);
  font-size: 15px;
  cursor: pointer;
  border-radius: 3px;
  transition: color 0.1s, background 0.1s, transform 0.15s;

  &:hover {
    color: var(--vsc-foreground);
    background: var(--vsc-list-hover-background);
  }

  &.ab-chev--open {
    transform: rotate(90deg);
    color: var(--vsc-accent-blue);
    background: color-mix(in srgb, var(--vsc-accent-blue) 14%, transparent);
  }
}

/* ── Generic dropdown ─────────────────────────────────── */
.ab-dropdown {
  position: absolute;
  background: var(--vsc-panel-background);
  border: 1px solid var(--vsc-border-bright);
  border-radius: 6px;
  box-shadow:
    0 4px 6px -2px rgba(0,0,0,0.3),
    0 12px 32px -4px rgba(0,0,0,0.5);
  z-index: 9000;
  overflow: hidden;
  animation: ab-appear 0.13s cubic-bezier(0.2,0,0.2,1);
}

@keyframes ab-appear {
  from { opacity: 0; transform: translateY(-5px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

.ab-drop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 5px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--vsc-accent-blue);
  background: color-mix(in srgb, var(--vsc-sidebar-background) 60%, var(--vsc-panel-background));
  border-bottom: 1px solid var(--vsc-border);
}

.ab-drop-sep { opacity: 0.5; margin-left: 1px; }

.ab-drop-count {
  font-size: 10px;
  font-weight: 700;
  background: var(--vsc-accent-blue);
  color: #fff;
  border-radius: 10px;
  padding: 1px 6px;
  min-width: 18px;
  text-align: center;
}

.ab-drop-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 12px;
  font-size: 11.5px;
  color: var(--vsc-foreground-dim);
  text-align: center;
  line-height: 1.5;
}

.ab-drop-empty-icon { font-size: 22px; opacity: 0.5; }

.ab-drop-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--vsc-foreground-dim);
}

.ab-drop-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.08s;
  border-left: 2px solid transparent;

  &:hover { background: var(--vsc-list-hover-background); }
  &.ab-drop-item--active {
    background: color-mix(in srgb, var(--vsc-accent-blue) 12%, transparent);
    border-left-color: var(--vsc-accent-blue);
  }
  &.ab-drop-item--focus {
    background: var(--vsc-list-hover-background);
    outline: none;
  }
}

/* ── Pin dropdown ─────────────────────────────────────── */
.ab-pin-drop {
  top: calc(100% + 5px);
  left: 0;
  min-width: 270px;
  max-width: 370px;
  max-height: 340px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ab-pin-item { padding-right: 6px; }

.ab-pin-icon { font-size: 14px; flex-shrink: 0; }

.ab-pin-label {
  flex: 1;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ab-pin-sub {
  font-size: 10.5px;
  color: var(--vsc-foreground-dim);
  font-family: var(--vsc-font-family-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.ab-pin-remove {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: transparent;
  font-size: 10px;
  cursor: pointer;
  border-radius: 3px;
  transition: background 0.1s, color 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;

  .ab-drop-item:hover & { color: var(--vsc-foreground-dim); }
  &:hover { background: var(--vsc-error) !important; color: #fff !important; }
}

/* ── Sibling dropdown ─────────────────────────────────── */
.ab-sib-drop {
  position: absolute;
  top: calc(100% + 4px);
  left: -8px;
  min-width: 210px;
  max-width: 320px;
  max-height: 300px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10020; /* ensure above other panels */
}

.ab-sib-drop > .ab-drop-item {
  overflow-y: auto;
}

/* scrollable list inside */
.ab-sib-drop::after {
  content: '';
  display: block;
}

/* make the items area scroll, not the whole dropdown */
.ab-sib-item { min-height: 30px; }

.ab-sib-folder { font-size: 13px; flex-shrink: 0; }

.ab-sib-name {
  flex: 1;
  font-size: 12.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ab-sib-check { color: var(--vsc-success); flex-shrink: 0; }

/* ── Edit mode row ────────────────────────────────────── */
.ab-edit {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 32px;
  background: var(--vsc-panel-background);
  border-bottom: 2px solid var(--vsc-accent-blue);
  animation: ab-edit-in 0.1s ease;
  position: relative;
}

@keyframes ab-edit-in {
  from { background: color-mix(in srgb, var(--vsc-accent-blue) 8%, var(--vsc-panel-background)); }
  to   { background: var(--vsc-panel-background); }
}

.ab-edit-icon { font-size: 14px; flex-shrink: 0; opacity: 0.8; }

.ab-edit-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--vsc-foreground-bright);
  font-family: var(--vsc-font-family-mono);
  font-size: 12px;
  caret-color: var(--vsc-accent-blue);
  min-width: 0;

  &::placeholder { color: transparent; }
  &::selection { background: color-mix(in srgb, var(--vsc-accent-blue) 40%, transparent); }
}

.ab-edit-hint {
  position: absolute;
  left: 36px;
  font-family: var(--vsc-font-family-mono);
  font-size: 12px;
  color: var(--vsc-foreground-dim);
  opacity: 0.4;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
}

/* ── Autocomplete dropdown ────────────────────────────── */
.ab-autocomplete {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  border-top: none;
  border-radius: 0 0 6px 6px;
  z-index: 9001;

  scrollbar-width: thin;
  scrollbar-color: var(--vsc-scrollbar-thumb) transparent;
  &::-webkit-scrollbar { width: 5px; }
  &::-webkit-scrollbar-thumb { background: var(--vsc-scrollbar-thumb); border-radius: 3px; }
}

.ab-ac-item { gap: 8px; }

.ab-ac-badge {
  flex-shrink: 0;
  font-size: 9.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 1px 5px;
  border-radius: 3px;

  &.ab-ac-badge--history   { background: var(--vsc-success);     color: #fff; }
  &.ab-ac-badge--directory { background: var(--vsc-accent-blue); color: #fff; }
  &.ab-ac-badge--fuzzy     { background: #cc7700;                color: #fff; }
}

.ab-ac-path {
  flex: 1;
  font-size: 12px;
  font-family: var(--vsc-font-family-mono);
  color: var(--vsc-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  ::ng-deep mark {
    background: var(--vsc-accent-blue);
    color: #fff;
    padding: 0 2px;
    border-radius: 2px;
    font-style: normal;
  }
}

.ab-ac-footer {
  padding: 5px 10px;
  font-size: 10.5px;
  color: var(--vsc-foreground-dim);
  background: color-mix(in srgb, var(--vsc-sidebar-background) 60%, var(--vsc-panel-background));
  border-top: 1px solid var(--vsc-border);

  kbd {
    display: inline-block;
    padding: 1px 4px;
    background: var(--vsc-panel-background);
    border: 1px solid var(--vsc-border-bright);
    border-radius: 3px;
    font-family: var(--vsc-font-family-mono);
    font-size: 10px;
    color: var(--vsc-accent-blue);
    margin: 0 1px;
  }
}

/* ── Right-click context menu ─────────────────────────── */
.ab-ctx-menu {
  position: fixed;
  min-width: 200px;
  background: var(--vsc-panel-background);
  border: 1px solid var(--vsc-border-bright);
  border-radius: 6px;
  box-shadow:
    0 4px 6px -2px rgba(0,0,0,0.3),
    0 12px 32px -4px rgba(0,0,0,0.55);
  z-index: 99999;
  padding: 4px 0;
  animation: ab-appear 0.1s cubic-bezier(0.2,0,0.2,1);
}

.ab-ctx-path {
  padding: 5px 12px 4px;
  font-size: 10.5px;
  font-family: var(--vsc-font-family-mono);
  color: var(--vsc-foreground-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.ab-ctx-divider {
  margin: 3px 0;
  border: none;
  border-top: 1px solid var(--vsc-border);
}

.ab-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--vsc-foreground);
  font-size: 12.5px;
  font-family: var(--vsc-font-family);
  cursor: pointer;
  text-align: left;
  transition: background 0.08s;

  svg { color: var(--vsc-foreground-dim); flex-shrink: 0; }

  &:hover {
    background: var(--vsc-list-hover-background);
    svg { color: var(--vsc-foreground); }
  }
}

/* ── Spinner ──────────────────────────────────────────── */
.ab-spinner {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid var(--vsc-border);
  border-top-color: var(--vsc-accent-blue);
  border-radius: 50%;
  animation: ab-spin 0.65s linear infinite;
}

@keyframes ab-spin { to { transform: rotate(360deg); } }

/* ── Drop-anchor positioning helper ───────────────────── */
.ab-drop-anchor {
  position: relative;
}

/* ── Compact mode ─────────────────────────────────────── */
:host-context(.compact-mode) {
  .ab-bar  { height: 26px; }
  .ab-edit { height: 26px; }
  .ab-seg  { font-size: 11.5px; padding: 1px 4px; }
  .ab-btn  { width: 21px; height: 21px; }
  .ab-chev { height: 18px; }
}

/* ── Light theme overrides ────────────────────────────── */
:host-context(.vscode-light) {
  .ab-seg--win-drive {
    background: color-mix(in srgb, var(--vsc-accent-blue) 8%, transparent);
    border-color: color-mix(in srgb, var(--vsc-accent-blue) 25%, transparent);
  }
}
  `],
})
export class AddressBarComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('editInput') editInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('crumbsEl') crumbsEl?: ElementRef<HTMLDivElement>;

  @Input() initialPath = '/';
  @Input() placeholder = 'Enter path…';
  @Input() paneId = 'left';

  @Output() pathChange          = new EventEmitter<string>();
  @Output() navigateUpClicked   = new EventEmitter<void>();
  @Output() refreshClicked      = new EventEmitter<void>();
  /** Emitted when "Open in other pane" is chosen from context menu */
  @Output() openInOtherPane     = new EventEmitter<string>();

  // ── State: path ─────────────────────────────────────────
  currentPath = '/';
  segments: PathSegment[] = [];
  isWin = false;

  // ── State: chevron / siblings ────────────────────────────
  chevIdx = -1;
  siblings: SiblingEntry[] = [];
  sibLoading = false;
  sibDropLeft = 0;
  sibDropTop = 0;

  // ── State: pinned paths ──────────────────────────────────
  pinnedPaths: PinnedPath[] = [];
  showPinDrop = false;
  get isPinned(): boolean { return this.pinnedPaths.some(p => p.path === this.currentPath); }

  // ── State: edit mode ─────────────────────────────────────
  editMode = false;
  editValue = '';

  // ── State: autocomplete ──────────────────────────────────
  suggestions: PathSuggestion[] = [];
  acIdx = -1;

  // ── State: context menu ──────────────────────────────────
  ctxMenu: ContextMenu = { visible: false, x: 0, y: 0, segmentIndex: -1, segment: null };

  // ── State: copy feedback ─────────────────────────────────
  justCopied = false;

  // ── Compact passthrough ──────────────────────────────────
  compact = false;

  private destroy$ = new Subject<void>();
  private editChange$ = new Subject<string>();
  private blurTimer: any;
  private copiedTimer: any;

  constructor(
    private pathHistoryService: PathHistoryService,
    private apiService: ApiService,
    private elRef: ElementRef,
    private cdr: ChangeDetectorRef,
  ) {}

  // ────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    this.currentPath = normalizePath(this.initialPath);
    // Default to false, will update after OS info
    this.isWin = false;
    try {
      const osInfo = await this.apiService.getOSInfo();
    } catch (e) {
      // fallback: guess from path
      this.isWin = isWindowsPath(this.currentPath);
    }
    this.rebuildSegments();
    this.loadPins();
    // Debounced autocomplete
    this.editChange$
      .pipe(debounceTime(240), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(v => this.fetchSuggestions(v));
  }

  ngOnChanges(c: SimpleChanges): void {
    if (c['initialPath'] && !c['initialPath'].firstChange) {
      const next = normalizePath(c['initialPath'].currentValue);
      if (next !== this.currentPath) {
        this.currentPath = next;
        this.isWin = isWindowsPath(next);
        this.rebuildSegments();
        if (this.editMode) this.editValue = next;
      }
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.blurTimer);
    clearTimeout(this.copiedTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ────────────────────────────────────────────────────────
  // Segments
  // ────────────────────────────────────────────────────────

  private rebuildSegments(): void {
    this.segments = buildSegments(this.currentPath);
    // Scroll crumbs to end after render
    setTimeout(() => {
      if (this.crumbsEl) {
        const el = this.crumbsEl.nativeElement;
        el.scrollLeft = el.scrollWidth;
      }
    }, 0);
  }

  // ────────────────────────────────────────────────────────
  // Segment click
  // ────────────────────────────────────────────────────────

  onSegClick(seg: PathSegment, e: MouseEvent): void {
    e.stopPropagation();
    this.closeAll();
    if (seg.fullPath !== this.currentPath) {
      this.navigateTo(seg.fullPath);
    }
  }

  // ────────────────────────────────────────────────────────
  // Chevron / sibling dropdown
  // ────────────────────────────────────────────────────────

  async toggleChev(idx: number, seg: PathSegment, e: MouseEvent): Promise<void> {
    e.stopPropagation();
    this.showPinDrop = false;

    if (this.chevIdx === idx) {
      this.chevIdx = -1;
      this.siblings = [];
      return;
    }

    // Find the chevron button's screen position
    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.sibDropLeft = Math.round(rect.left);
    this.sibDropTop = Math.round(rect.bottom + 4); // 4px gap

    this.chevIdx = idx;
    this.siblings = [];
    this.sibLoading = true;

    // Determine current active child path
    const activeChildPath = idx + 1 < this.segments.length
      ? this.segments[idx + 1].fullPath
      : null;

    try {
      const listing = await this.apiService.listDirectory(seg.fullPath, false);
      this.siblings = listing.entries
        .filter(e => e.type === FileType.DIRECTORY)
        .map(e => ({ name: e.name, path: e.path, isCurrent: e.path === activeChildPath }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      this.siblings = [];
    } finally {
      this.sibLoading = false;
      this.cdr.detectChanges();
    }
  }

  onSibClick(s: SiblingEntry): void {
    this.chevIdx = -1;
    this.siblings = [];
    this.navigateTo(s.path);
  }

  onCrumbsClick(e: MouseEvent): void {
    // Only enter edit mode if clicking directly on the crumbs container,
    // not on its children (segments or chevrons)
    const target = e.target as HTMLElement;
    if (target.classList.contains('ab-crumbs')) {
      this.enterEditMode();
    }
  }

  // ────────────────────────────────────────────────────────
  // Pinned paths
  // ────────────────────────────────────────────────────────

  private loadPins(): void {
    try {
      const raw = localStorage.getItem(PINNED_KEY);
      this.pinnedPaths = raw ? JSON.parse(raw) : [];
    } catch { this.pinnedPaths = []; }
  }

  private savePins(): void {
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(this.pinnedPaths)); } catch {}
  }

  togglePin(): void {
    if (this.isPinned) {
      this.pinnedPaths = this.pinnedPaths.filter(p => p.path !== this.currentPath);
    } else {
      const parts = this.currentPath.split('/').filter(Boolean);
      const label = parts.length ? parts[parts.length - 1] : (isWindowsPath(this.currentPath) ? this.currentPath.slice(0,2) : '/');
      this.pinnedPaths.push({ path: this.currentPath, label, icon: '📁', addedAt: Date.now() });
    }
    this.savePins();
  }

  togglePinDrop(): void {
    this.showPinDrop = !this.showPinDrop;
    if (this.showPinDrop) this.chevIdx = -1;
  }

  removePin(p: PinnedPath, e: MouseEvent): void {
    e.stopPropagation();
    this.pinnedPaths = this.pinnedPaths.filter(x => x.path !== p.path);
    this.savePins();
  }

  isSegmentPinned(seg: PathSegment | null): boolean {
    return !!seg && this.pinnedPaths.some(p => p.path === seg.fullPath);
  }

  shortenPath(p: string): string {
    if (p.length <= 28) return p;
    const parts = p.split('/').filter(Boolean);
    if (parts.length <= 2) return p;
    return '…/' + parts.slice(-2).join('/');
  }

  // ────────────────────────────────────────────────────────
  // Edit mode
  // ────────────────────────────────────────────────────────

  enterEditMode(): void {
    this.closeAll();
    this.editMode = true;
    this.editValue = this.currentPath;
    this.suggestions = [];
    this.acIdx = -1;
    setTimeout(() => {
      const el = this.editInputRef?.nativeElement;
      if (el) { el.focus(); el.select(); }
    }, 30);
  }

  exitEditMode(commit: boolean): void {
    clearTimeout(this.blurTimer);
    const val = normalizePath(this.editValue);
    this.editMode = false;
    this.editValue = '';
    this.suggestions = [];
    this.acIdx = -1;
    if (commit && val && val !== this.currentPath) {
      this.navigateTo(val);
    }
  }

  onEditBlur(): void {
    this.blurTimer = setTimeout(() => this.exitEditMode(false), 170);
  }

  onEditChange(v: string): void {
    this.editChange$.next(normalizePath(v));
  }

  onEditKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (this.acIdx >= 0 && this.suggestions[this.acIdx]) {
          this.acceptSuggestion(this.suggestions[this.acIdx]);
        } else {
          this.exitEditMode(true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.exitEditMode(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.acIdx = Math.min(this.acIdx + 1, this.suggestions.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.acIdx = Math.max(this.acIdx - 1, -1);
        break;
      case 'Tab':
        e.preventDefault();
        if (this.suggestions.length) this.acceptSuggestion(this.suggestions[0]);
        break;
    }
  }

  onHostKeyDown(e: KeyboardEvent): void {
    // Ctrl/Cmd+L → focus address bar
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
      e.preventDefault();
      this.enterEditMode();
    }
  }

  // ────────────────────────────────────────────────────────
  // Autocomplete
  // ────────────────────────────────────────────────────────

  private async fetchSuggestions(path: string): Promise<void> {
    if (!path?.trim()) { this.suggestions = []; return; }
    try {
      this.suggestions = await this.pathHistoryService.getSuggestions(path, this.currentPath);
      this.acIdx = -1;
      this.cdr.detectChanges();
    } catch { this.suggestions = []; }
  }

  acceptSuggestion(s: PathSuggestion, e?: MouseEvent): void {
    e?.preventDefault();
    clearTimeout(this.blurTimer);
    const p = normalizePath(s.path);
    this.editMode = false;
    this.editValue = '';
    this.suggestions = [];
    this.navigateTo(p);
  }

  highlightMatch(text: string, query: string): string {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return text;
    return text.slice(0, idx)
      + '<mark>' + text.slice(idx, idx + query.length) + '</mark>'
      + text.slice(idx + query.length);
  }

  // ────────────────────────────────────────────────────────
  // Context menu
  // ────────────────────────────────────────────────────────

  onSegRightClick(seg: PathSegment, idx: number, e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.closeAll();
    this.ctxMenu = { visible: true, x: e.clientX, y: e.clientY, segmentIndex: idx, segment: seg };
  }

  ctxNavigateTo(): void {
    if (this.ctxMenu.segment) this.navigateTo(this.ctxMenu.segment.fullPath);
    this.closeCtx();
  }

  async ctxCopyPath(): Promise<void> {
    if (this.ctxMenu.segment) {
      await navigator.clipboard.writeText(this.ctxMenu.segment.fullPath).catch(() => {});
    }
    this.closeCtx();
  }

  async ctxCopyName(): Promise<void> {
    if (this.ctxMenu.segment) {
      await navigator.clipboard.writeText(this.ctxMenu.segment.label).catch(() => {});
    }
    this.closeCtx();
  }

  ctxOpenOtherPane(): void {
    if (this.ctxMenu.segment) this.openInOtherPane.emit(this.ctxMenu.segment.fullPath);
    this.closeCtx();
  }

  ctxPinPath(): void {
    const seg = this.ctxMenu.segment;
    if (!seg) { this.closeCtx(); return; }
    const already = this.pinnedPaths.some(p => p.path === seg.fullPath);
    if (already) {
      this.pinnedPaths = this.pinnedPaths.filter(p => p.path !== seg.fullPath);
    } else {
      this.pinnedPaths.push({ path: seg.fullPath, label: seg.label, icon: '📁', addedAt: Date.now() });
    }
    this.savePins();
    this.closeCtx();
  }

  private closeCtx(): void {
    this.ctxMenu = { visible: false, x: 0, y: 0, segmentIndex: -1, segment: null };
  }

  // ────────────────────────────────────────────────────────
  // Action buttons
  // ────────────────────────────────────────────────────────

  goUp(): void {
    const p = parentPath(this.currentPath);
    this.navigateUpClicked.emit();
    if (p !== this.currentPath) this.navigateTo(p);
  }

  refresh(): void { this.refreshClicked.emit(); }

  async copyPath(): Promise<void> {
    await navigator.clipboard.writeText(this.currentPath).catch(() => {});
    clearTimeout(this.copiedTimer);
    this.justCopied = true;
    this.copiedTimer = setTimeout(() => { this.justCopied = false; this.cdr.detectChanges(); }, 1800);
  }

  // ────────────────────────────────────────────────────────
  // Navigation
  // ────────────────────────────────────────────────────────

  navigateTo(p: string): void {
    const np = normalizePath(p);
    this.closeAll();
    if (np !== this.currentPath) {
      this.currentPath = np;
      this.isWin = isWindowsPath(np);
      this.rebuildSegments();
      this.pathChange.emit(np);
    }
  }

  // ────────────────────────────────────────────────────────
  // Close everything
  // ────────────────────────────────────────────────────────

  private closeAll(): void {
    this.chevIdx = -1;
    this.siblings = [];
    this.showPinDrop = false;
    this.closeCtx();
  }

  // ────────────────────────────────────────────────────────
  // Outside click
  // ────────────────────────────────────────────────────────

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(e.target as Node)) {
      this.closeAll();
      if (this.editMode) this.exitEditMode(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.ctxMenu.visible) { this.closeCtx(); e.preventDefault(); }
      else if (this.editMode)   { this.exitEditMode(false); e.preventDefault(); }
      else if (this.chevIdx >= 0 || this.showPinDrop) { this.closeAll(); e.preventDefault(); }
    }
  }
}