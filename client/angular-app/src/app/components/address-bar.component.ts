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
import { DriveInfo } from '@shared/protocol-enhanced';

// ─── Types ─────────────────────────────────────────────────────────────────

interface PathSegment {
  label: string;
  fullPath: string;
  isRoot: boolean;
  rootLabel?: string;
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

function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:/.test(p);
}

function normalizePath(p: string): string {
  if (!p) return '/';
  let n = p.replace(/\\/g, '/');
  if (isWindowsPath(n)) {
    const drive = n.slice(0, 2);
    const rest = n.slice(2).replace(/\/+/g, '/');
    n = drive + (rest.startsWith('/') ? rest : '/' + rest);
  } else {
    n = n.replace(/\/+/g, '/');
  }
  if (n.length > 1 && n.endsWith('/') && !(/^[A-Za-z]:\//.test(n) && n.length === 3)) {
    n = n.slice(0, -1);
  }
  return n || '/';
}

function buildSegments(p: string): PathSegment[] {
  if (!p) return [];

  if (isWindowsPath(p)) {
    const drive = p.slice(0, 2).toUpperCase();
    const rest = p.slice(3);
    const parts = rest ? rest.split('/').filter(Boolean) : [];
    
    const segs: PathSegment[] = [{
      label: drive,
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
  if (/^[A-Za-z]:\/$/.test(n) || /^[A-Za-z]:$/.test(n)) return n;
  if (n === '/') return '/';
  const parts = n.split('/').filter(Boolean);
  if (parts.length <= 1) {
    return isWindowsPath(n) ? parts[0] + '/' : '/';
  }
  parts.pop();
  if (isWindowsPath(n)) {
    const drive = parts[0];
    const rest = parts.slice(1);
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
            <span class="ab-badge">{{ pinnedPaths.length }}</span>
          </div>
          <div class="ab-drop-empty" *ngIf="pinnedPaths.length === 0">
            <span class="ab-drop-empty-icon">📍</span>
            <span>No pinned paths yet.<br>Click ☆ to pin the current path.</span>
          </div>
          <div class="ab-drop-scroll">
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
    </div>

    <!-- Scrollable breadcrumb trail -->
    <div class="ab-crumbs" (click)="onCrumbsClick($event)">
      <div class="ab-crumbs-inner" #crumbsEl>
        <ng-container *ngFor="let seg of segments; let i = index; let last = last">
          
          <!-- DRIVE LETTER (Windows) - VS Code blue, clickable to show drive grid -->
          <span
            *ngIf="seg.isRoot && isWin"
            class="ab-seg ab-drive-letter"
            [class.ab-seg--last]="last"
            (click)="onDriveLetterClick(seg, $event)"
            (contextmenu)="onSegRightClick(seg, i, $event)"
            [title]="'Switch drives'"
          >
            {{ seg.label }}
          </span>

          <!-- CHEVRON after drive letter (shows root folder contents) -->
          <div class="ab-drive-chevron-wrap" *ngIf="seg.isRoot && isWin && !last">
            <button
              class="ab-chev ab-drive-chevron"
              [class.ab-chev--open]="chevIdx === i"
              (click)="toggleChev(i, seg, $event)"
              [title]="'Show contents of ' + seg.fullPath"
              aria-label="Show drive contents"
            >
              ›
            </button>
          </div>

          <!-- Regular segment (non-drive or Unix root) -->
          <span
            *ngIf="!seg.isRoot || !isWin"
            class="ab-seg"
            [class.ab-seg--root]="seg.isRoot"
            [class.ab-seg--last]="last"
            (click)="onSegClick(seg, $event)"
            (contextmenu)="onSegRightClick(seg, i, $event)"
            [title]="seg.fullPath"
          >{{ seg.label }}</span>

          <!-- Regular chevron between segments (for non-drive segments) -->
          <div class="ab-chev-wrap" *ngIf="!last && !(seg.isRoot && isWin)">
            <button
              class="ab-chev"
              [class.ab-chev--open]="chevIdx === i"
              (click)="toggleChev(i, seg, $event)"
              aria-label="Browse siblings"
              #chevBtn
            >›</button>
          </div>

          <!-- Sibling dropdown -->
          <div
            class="ab-dropdown ab-sib-drop"
            *ngIf="chevIdx >= 0"
            [ngStyle]="{ left: sibDropLeft + 'px', top: sibDropTop + 'px', position: 'fixed' }"
          >
            <div class="ab-drop-head">
              <span>{{ segments[chevIdx].label }}</span>
              <span class="ab-badge" *ngIf="!sibLoading">{{ siblings.length }}</span>
            </div>
            <div class="ab-drop-loading" *ngIf="sibLoading">
              <span class="ab-spinner"></span>Loading…
            </div>
            <div class="ab-drop-empty" *ngIf="!sibLoading && siblings.length === 0">
              <span class="ab-drop-empty-icon">📭</span>
              <span>No sub-folders</span>
            </div>
            <div class="ab-drop-scroll">
              <div
                *ngFor="let s of siblings"
                class="ab-drop-item ab-sib-item"
                [class.ab-drop-item--active]="s.isCurrent"
                (click)="onSibClick(s)"
              >
                <span class="ab-sib-folder">📁</span>
                <span class="ab-sib-name">{{ s.name }}</span>
              </div>
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
    <div class="ab-drop-head">
      <span>Suggestions</span>
      <span class="ab-badge">{{ suggestions.length }}</span>
    </div>
    <div class="ab-drop-scroll">
      <div
        *ngFor="let s of suggestions; let i = index"
        class="ab-drop-item ab-ac-item"
        [class.ab-drop-item--focused]="acIdx === i"
        (mouseenter)="acIdx = i"
        (mousedown)="acceptSuggestion(s, $event)"
      >
        <span class="ab-ac-badge ab-ac-badge--{{ s.matchType }}">{{ s.matchType }}</span>
        <span class="ab-ac-path" [innerHTML]="highlightMatch(s.path, editValue)"></span>
      </div>
    </div>
    <div class="ab-drop-footer">
      <kbd>↑↓</kbd> navigate &nbsp; <kbd>⏎</kbd> select &nbsp; <kbd>Esc</kbd> cancel
    </div>
  </div>

  <!-- ── DRIVE SWITCHER DROPDOWN (GRID) ─────────────────── -->
  <div class="ab-dropdown ab-drive-drop" *ngIf="showDriveMenu"
    [ngStyle]="{ left: driveMenuLeft + 'px', top: driveMenuTop + 'px', position: 'fixed' }">
    <div class="ab-drop-head">
      <span>Available Drives</span>
      <span class="ab-badge">{{ drives.length }}</span>
    </div>
    
    <div class="ab-drop-loading" *ngIf="drivesLoading">
      <span class="ab-spinner"></span>Loading drives…
    </div>
    
    <div class="ab-drop-empty" *ngIf="!drivesLoading && drives.length === 0">
      <span class="ab-drop-empty-icon">💽</span>
      <span>No drives found</span>
    </div>
    
    <div class="ab-drive-grid" *ngIf="!drivesLoading && drives.length > 0">
      <div
        *ngFor="let d of drives"
        class="ab-drive-grid-item"
        [class.ab-drive-grid-item--active]="d.path === currentPath"
        (click)="switchToDrive(d)"
      >
        <div class="ab-drive-grid-top">
          <span class="ab-drive-grid-icon">{{ getDriveIcon(d) }}</span>
          <span class="ab-drive-grid-letter">{{ d.name }}</span>
          <span class="ab-drive-grid-label">{{ 'Local Drive' }}</span>
          <svg *ngIf="d.path === currentPath" class="ab-drive-grid-check" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.485 1.929L5.5 9.914 2.515 6.929a1 1 0 0 0-1.414 1.414l3.692 3.693a1 1 0 0 0 1.414 0l8.692-8.693a1 1 0 0 0-1.414-1.414z"/>
          </svg>
        </div>
        
        <div class="ab-drive-grid-details">
          <div class="ab-drive-grid-space" *ngIf="d.totalSpace > 0">
            <span>{{ formatSize(d.freeSpace) }} free</span>
            <span>of {{ formatSize(d.totalSpace) }}</span>
            <div class="ab-drive-space-bar">
              <div class="ab-drive-space-fill" 
                   [style.width.%]="(d.freeSpace / d.totalSpace) * 100"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="ab-drop-footer" *ngIf="!drivesLoading && drives.length > 0">
      <kbd>↑↓</kbd> navigate &nbsp; <kbd>⏎</kbd> select &nbsp; <kbd>Esc</kbd> close
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
    :host {
      display: block;
      position: relative;
      font-family: var(--vsc-font-family);
      font-size: var(--vsc-font-size);
      color: var(--vsc-foreground);
      background: var(--vsc-sidebar-background);
      z-index: var(--vsc-z-base);
    }

    .ab-host {
      position: relative;
      background: var(--vsc-sidebar-background);
      border-bottom: 1px solid var(--vsc-border-subtle);
    }

    /* Main bar */
    .ab-bar {
      display: flex;
      align-items: center;
      height: var(--vsc-titlebar-height);
      padding: 0 var(--vsc-padding-sm);
      gap: var(--vsc-padding-xs);
      overflow: visible;
      background: var(--vsc-sidebar-background);
      transition: background var(--vsc-transition-fast);
    }

    .ab-bar--compact {
      height: 28px; /* Compact override, not using variable */
      
      .ab-btn {
        width: 22px;
        height: 22px;
      }
      
      .ab-seg {
        height: 20px;
        line-height: 20px;
        font-size: var(--vsc-font-size-small);
      }
    }

    /* Clusters with VS Code separators */
    .ab-cluster {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-xs);
      flex-shrink: 0;
    }

    .ab-cluster--left {
      padding-right: var(--vsc-padding-sm);
      border-right: 1px solid var(--vsc-border-subtle);
      margin-right: var(--vsc-padding-sm);
    }

    .ab-cluster--right {
      padding-left: var(--vsc-padding-sm);
      border-left: 1px solid var(--vsc-border-subtle);
      margin-left: var(--vsc-padding-sm);
    }

    /* VS Code style buttons */
    .ab-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      background: transparent;
      border: none;
      border-radius: var(--vsc-border-radius-sm);
      color: var(--vsc-foreground-dim);
      cursor: pointer;
      transition: background-color var(--vsc-transition-fast), color var(--vsc-transition-fast);
      flex-shrink: 0;

      &:hover {
        background: var(--vsc-list-hover-background);
        color: var(--vsc-foreground-bright);
      }

      &:active {
        background: var(--vsc-list-active-background);
        color: var(--vsc-foreground-bright);
      }

      &:focus-visible {
        outline: 1px solid var(--vsc-focusBorder, var(--vsc-accent-blue));
        outline-offset: -1px;
      }

      svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
        opacity: 0.9;
        transition: opacity var(--vsc-transition-fast);
      }

      &:hover svg {
        opacity: 1;
      }
    }

    /* Star/Pin button */
    .ab-btn--star {
      font-size: 16px;
      line-height: 1;
      
      &:hover {
        color: var(--vsc-accent-yellow);
      }
    }

    .ab-btn--pinned {
      color: var(--vsc-accent-yellow) !important;
    }

    /* Open state for dropdown triggers */
    .ab-btn--open {
      background: var(--vsc-list-active-background);
      color: var(--vsc-foreground-bright);
      
      svg {
        opacity: 1;
      }
    }

    /* Copy success state */
    .ab-btn--copied {
      color: var(--vsc-success) !important;
    }

    /* Cancel button in edit mode */
    .ab-btn--cancel {
      font-size: 14px;
      color: var(--vsc-foreground-dim);
      
      &:hover {
        background: var(--vsc-error);
        color: var(--vsc-foreground-bright);
      }
    }

    /* Breadcrumb container */
    .ab-crumbs {
      flex: 1;
      min-width: 0;
      overflow: visible;
      cursor: text;
      height: 100%;
      display: flex;
      align-items: center;
    }

    .ab-crumbs-inner {
      display: flex;
      align-items: center;
      height: 100%;
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      gap: 0;
      scroll-behavior: smooth;
      scrollbar-width: none;
      -ms-overflow-style: none;
      
      &::-webkit-scrollbar {
        display: none;
      }
    }

    /* Breadcrumb segments */
    .ab-seg {
      display: inline-flex;
      align-items: center;
      height: 24px;
      padding: 0 var(--vsc-padding-sm);
      border-radius: var(--vsc-border-radius-sm);
      color: var(--vsc-foreground-dim);
      font-size: var(--vsc-font-size);
      line-height: 24px;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color var(--vsc-transition-fast), color var(--vsc-transition-fast);
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;

      &:hover {
        background: var(--vsc-list-hover-background);
        color: var(--vsc-foreground);
      }

      &.ab-seg--root {
        color: var(--vsc-foreground);
        font-weight: 500;
      }

      &.ab-seg--last {
        color: var(--vsc-foreground-bright);
        cursor: default;
        max-width: 240px;
        
        &:hover {
          background: transparent;
        }
      }
    }

    /* Drive letter styling */
    .ab-drive-letter {
      background: var(--vsc-badge-background);
      color: var(--vsc-badge-foreground);
      border-radius: var(--vsc-border-radius-sm);
      font-family: var(--vsc-font-family-mono);
      font-weight: 600;
      padding: 0 var(--vsc-padding-sm);
      margin-right: 0;
      cursor: pointer;
      border: none;
      
      &:hover {
        background: var(--vsc-button-hover);
        color: var(--vsc-foreground-bright);
      }

      &.ab-seg--last {
        background: var(--vsc-button-background);
      }
    }

    /* Chevron styling */
    .ab-chev-wrap {
      position: relative;
      flex-shrink: 0;
      overflow: visible;
      display: inline-flex;
      align-items: center;
    }

    .ab-chev {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 24px;
      padding: 0;
      background: transparent;
      border: none;
      color: var(--vsc-foreground-dim);
      font-size: 16px;
      font-weight: 400;
      cursor: pointer;
      border-radius: var(--vsc-border-radius-sm);
      transition: background-color var(--vsc-transition-fast), transform var(--vsc-transition-normal);

      &:hover {
        color: var(--vsc-foreground);
        background: var(--vsc-list-hover-background);
      }

      &:focus-visible {
        outline: 1px solid var(--vsc-accent-blue);
        outline-offset: -1px;
      }

      &.ab-chev--open {
        transform: rotate(90deg);
        color: var(--vsc-accent-blue);
        background: var(--vsc-list-active-background);
      }
    }

    /* Drive chevron wrapper */
    .ab-drive-chevron-wrap {
      display: inline-flex;
      align-items: center;
      margin-right: var(--vsc-padding-xs);
    }

    .ab-drive-chevron {
      border-radius: 0 var(--vsc-border-radius-sm) var(--vsc-border-radius-sm) 0;
      margin-left: -2px;
      
      &.ab-chev--open {
        background: var(--vsc-list-active-background);
        color: var(--vsc-foreground-bright);
      }
    }

    /* === DROPDOWNS === */

    /* Base dropdown */
    .ab-dropdown {
  position: absolute;
  min-width: 220px;
  max-width: 340px;
  background: var(--vsc-panel-background) !important; /* Force solid */
  border: 1px solid var(--vsc-border);
  border-radius: var(--vsc-border-radius);
  box-shadow: var(--vsc-widget-shadow);
  z-index: var(--vsc-z-modal);
  overflow: hidden;
  animation: ab-appear var(--vsc-transition-fast) cubic-bezier(0.4, 0, 0.2, 1);
  
  /* All dropdown children should have appropriate backgrounds */
  .ab-drop-head,
  .ab-drop-scroll,
  .ab-drop-footer,
  .ab-drop-loading,
  .ab-drop-empty {
    background: var(--vsc-panel-background);
  }
  
  /* Scrollable content area */
  .ab-drop-scroll {
    background: var(--vsc-panel-background);
    
    .ab-drop-item {
      background: transparent;
      
      &:hover {
        background: var(--vsc-list-hover-background);
      }
      
      &.ab-drop-item--active {
        background: var(--vsc-list-active-background);
      }
    }
  }
}

    @keyframes ab-appear {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Dropdown header */
    .ab-drop-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 32px;
      padding: 0 var(--vsc-padding-lg);
      background: var(--vsc-panel-background);
      border-bottom: 1px solid var(--vsc-border-subtle);
      font-size: var(--vsc-font-size-small);
      color: var(--vsc-foreground-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }

    /* Badge */
    .ab-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 var(--vsc-padding-xs);
      background: var(--vsc-badge-background);
      color: var(--vsc-badge-foreground);
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
    }

    /* Scrollable content */
    .ab-drop-scroll {
      max-height: 300px;
      overflow-y: auto;
      padding: var(--vsc-padding-xs) 0;
      
      /* VS Code style scrollbar */
      &::-webkit-scrollbar {
        width: 10px;
      }
      
      &::-webkit-scrollbar-track {
        background: var(--vsc-scrollbar-track);
      }
      
      &::-webkit-scrollbar-thumb {
        background: var(--vsc-scrollbar-thumb);
        border-radius: 5px;
        
        &:hover {
          background: var(--vsc-scrollbar-thumb-hover);
        }
      }
    }

    /* Dropdown items */
    .ab-drop-item {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      height: 28px;
      padding: 0 var(--vsc-padding-lg);
      cursor: pointer;
      transition: background-color var(--vsc-transition-fast);
      border-left: 2px solid transparent;
      color: var(--vsc-foreground);
      font-size: var(--vsc-font-size);

      &:hover {
        background: var(--vsc-list-hover-background);
      }

      &.ab-drop-item--active {
        background: var(--vsc-list-active-background);
        color: var(--vsc-foreground-bright);
        border-left-color: var(--vsc-accent-blue);
        
        &:hover {
          background: var(--vsc-list-active-background);
        }
        
        .ab-pin-sub {
          color: var(--vsc-foreground-bright);
          opacity: 0.9;
        }
      }

      &.ab-drop-item--focused {
        background: var(--vsc-list-focus-background);
      }
    }

    /* Checkbox */
    .ab-checkbox {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: 1px solid var(--vsc-border);
      border-radius: var(--vsc-border-radius-sm);
      background: var(--vsc-input-background);
      transition: all var(--vsc-transition-fast);
      color: transparent;
      
      &.ab-checkbox--checked {
        background: var(--vsc-accent-blue) !important;
        border-color: var(--vsc-accent-blue) !important;
        color: var(--vsc-foreground-bright);
        
        &::after {
          content: '✓';
          font-size: 12px;
          line-height: 1;
        }
      }
    }

    /* Dropdown footer */
    .ab-drop-footer {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      height: 28px;
      padding: 0 var(--vsc-padding-lg);
      background: var(--vsc-panel-background);
      border-top: 1px solid var(--vsc-border-subtle);
      font-size: 11px;
      color: var(--vsc-foreground-dim);

      kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 3px;
        background: var(--vsc-input-background);
        border: 1px solid var(--vsc-border);
        border-bottom-width: 2px;
        border-radius: var(--vsc-border-radius-sm);
        font-family: var(--vsc-font-family-mono);
        font-size: 10px;
        color: var(--vsc-foreground);
        line-height: 1;
        margin: 0 var(--vsc-padding-xs);
      }
    }

    /* Loading state */
    .ab-drop-loading {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      padding: var(--vsc-padding-lg);
      font-size: var(--vsc-font-size);
      color: var(--vsc-foreground-dim);
    }

    .ab-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--vsc-border);
      border-top-color: var(--vsc-accent-blue);
      border-radius: 50%;
      animation: ab-spin 0.7s linear infinite;
    }

    @keyframes ab-spin {
      to { transform: rotate(360deg); }
    }

    /* Empty state */
    .ab-drop-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--vsc-padding-sm);
      padding: var(--vsc-padding-xl);
      font-size: var(--vsc-font-size-small);
      color: var(--vsc-foreground-dim);
      text-align: center;
      line-height: 1.5;
    }

    .ab-drop-empty-icon {
      font-size: 24px;
      opacity: 0.5;
      margin-bottom: var(--vsc-padding-xs);
    }

    /* === PIN DROPDOWN === */
    .ab-pin-drop {
      min-width: 270px;
      max-width: 370px;
    }

    .ab-pin-item {
      padding-right: var(--vsc-padding-sm);
    }

    .ab-pin-icon {
      font-size: 14px;
      flex-shrink: 0;
      opacity: 0.8;
    }

    .ab-pin-label {
      flex: 1;
      font-size: var(--vsc-font-size);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ab-pin-sub {
      font-size: 11px;
      color: var(--vsc-foreground-dim);
      font-family: var(--vsc-font-family-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 120px;
    }

    .ab-pin-remove {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      padding: 0;
      background: transparent;
      border: none;
      color: transparent;
      font-size: 12px;
      cursor: pointer;
      border-radius: var(--vsc-border-radius-sm);
      transition: all var(--vsc-transition-fast);
      display: flex;
      align-items: center;
      justify-content: center;

      .ab-drop-item:hover & {
        color: var(--vsc-foreground-dim);
      }
      
      &:hover {
        background: var(--vsc-error) !important;
        color: var(--vsc-foreground-bright) !important;
      }
    }

    /* === SIBLING DROPDOWN === */
    .ab-sib-drop {
      min-width: 210px;
      max-width: 320px;
    }

    .ab-sib-folder {
      font-size: 14px;
      flex-shrink: 0;
      opacity: 0.8;
    }

    .ab-sib-name {
      flex: 1;
      font-size: var(--vsc-font-size);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* === DRIVE DROPDOWN GRID === */
    .ab-drive-drop {
  min-width: 320px;
  max-width: 500px;
  padding: 0;
  z-index: calc(var(--vsc-z-modal) + 100) !important;
  position: fixed !important;
  background: var(--vsc-panel-background) !important; /* Force solid background */
  border: 1px solid var(--vsc-border);
  border-radius: var(--vsc-border-radius);
  box-shadow: var(--vsc-widget-shadow);
  
  /* Ensure all child elements have solid backgrounds */
  * {
    background: transparent; /* Reset individual backgrounds */
  }
  
  /* Specific elements that need solid backgrounds */
  .ab-drop-head {
    background: var(--vsc-panel-background) !important;
    border-bottom: 1px solid var(--vsc-border-subtle);
  }
  
  .ab-drive-grid {
    background: var(--vsc-panel-background) !important;
    
    /* Grid items keep their own backgrounds */
    .ab-drive-grid-item {
      background: var(--vsc-sidebar-background);
      
      &:hover {
        background: var(--vsc-list-hover-background);
      }
      
      &.ab-drive-grid-item--active {
        background: var(--vsc-list-active-background);
      }
    }
  }
  
  .ab-drop-footer {
    background: var(--vsc-panel-background) !important;
    border-top: 1px solid var(--vsc-border-subtle);
  }
}

    .ab-drive-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: var(--vsc-padding-sm);
      padding: var(--vsc-padding-lg);
      max-height: 350px;
      overflow-y: auto;
      
      &::-webkit-scrollbar {
        width: 10px;
      }
      
      &::-webkit-scrollbar-track {
        background: var(--vsc-scrollbar-track);
      }
      
      &::-webkit-scrollbar-thumb {
        background: var(--vsc-scrollbar-thumb);
        border-radius: 5px;
      }
    }

    .ab-drive-grid-item {
      display: flex;
      flex-direction: column;
      padding: var(--vsc-padding-lg);
      background: var(--vsc-sidebar-background);
      border: 1px solid var(--vsc-border-subtle);
      border-radius: var(--vsc-border-radius);
      cursor: pointer;
      transition: all var(--vsc-transition-fast);
      gap: var(--vsc-padding-sm);

      &:hover {
        background: var(--vsc-list-hover-background);
        border-color: var(--vsc-accent-blue);
        transform: translateY(-1px);
        box-shadow: 0 2px 8px var(--vsc-shadow);
      }

      &.ab-drive-grid-item--active {
        background: var(--vsc-list-active-background);
        border-color: var(--vsc-accent-blue);
        
        .ab-drive-grid-letter,
        .ab-drive-grid-label,
        .ab-drive-grid-details {
          color: var(--vsc-foreground-bright);
        }
      }
    }

    .ab-drive-grid-top {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
    }

    .ab-drive-grid-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .ab-drive-grid-letter {
      font-family: var(--vsc-font-family-mono);
      font-size: 14px;
      font-weight: 700;
      color: var(--vsc-accent-blue);
    }

    .ab-drive-grid-label {
      font-size: var(--vsc-font-size);
      font-weight: 500;
      color: var(--vsc-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
    }

    .ab-drive-grid-check {
      color: var(--vsc-accent-blue);
      margin-left: auto;
      flex-shrink: 0;
      width: 14px;
      height: 14px;
    }

    .ab-drive-grid-details {
      display: flex;
      flex-direction: column;
      gap: var(--vsc-padding-xs);
      font-size: 11px;
      color: var(--vsc-foreground-dim);
    }

    .ab-drive-grid-path {
      font-family: var(--vsc-font-family-mono);
      font-size: 10px;
      color: var(--vsc-foreground-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ab-drive-grid-space {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-xs);
      font-size: 10px;
    }

    .ab-drive-space-bar {
      flex: 1;
      height: 4px;
      background: var(--vsc-border-subtle);
      border-radius: 2px;
      overflow: hidden;
    }

    .ab-drive-space-fill {
      height: 100%;
      background: var(--vsc-accent-blue);
      border-radius: 2px;
      transition: width var(--vsc-transition-normal);
    }

    /* === EDIT MODE === */
    .ab-edit {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      height: var(--vsc-titlebar-height);
      padding: 0 var(--vsc-padding-md);
      background: var(--vsc-input-background);
      border: 1px solid var(--vsc-accent-blue);
      border-radius: var(--vsc-border-radius);
      animation: ab-edit-in var(--vsc-transition-fast) ease;
      position: relative;
    }

    @keyframes ab-edit-in {
      from {
        background: color-mix(in srgb, var(--vsc-accent-blue) 10%, var(--vsc-input-background));
        border-color: color-mix(in srgb, var(--vsc-accent-blue) 50%, transparent);
      }
      to {
        background: var(--vsc-input-background);
        border-color: var(--vsc-accent-blue);
      }
    }

    .ab-edit-icon {
      font-size: 14px;
      flex-shrink: 0;
      opacity: 0.8;
      color: var(--vsc-foreground-dim);
    }

    .ab-edit-input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: var(--vsc-input-foreground);
      font-family: var(--vsc-font-family-mono);
      font-size: var(--vsc-font-size);
      caret-color: var(--vsc-accent-blue);
      min-width: 0;
      padding: 0;

      &::placeholder {
        color: var(--vsc-input-placeholder);
        opacity: 1;
      }
      
      &::selection {
        background: color-mix(in srgb, var(--vsc-accent-blue) 40%, transparent);
      }
    }

    .ab-edit-hint {
      position: absolute;
      left: calc(32px + var(--vsc-padding-sm));
      font-family: var(--vsc-font-family-mono);
      font-size: var(--vsc-font-size);
      color: var(--vsc-input-placeholder);
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      opacity: 0.7;
    }

    /* === AUTOCOMPLETE === */
    .ab-autocomplete {
      max-height: 350px;
      overflow-y: auto;
    }

    .ab-ac-badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 2px var(--vsc-padding-xs);
      border-radius: var(--vsc-border-radius-sm);
      min-width: 50px;
      text-align: center;

      &.ab-ac-badge--history {
        background: var(--vsc-success);
        color: var(--vsc-foreground-bright);
      }
      
      &.ab-ac-badge--directory {
        background: var(--vsc-accent-blue);
        color: var(--vsc-foreground-bright);
      }
      
      &.ab-ac-badge--fuzzy {
        background: var(--vsc-accent-orange);
        color: var(--vsc-foreground-bright);
      }
    }

    .ab-ac-path {
      flex: 1;
      font-size: var(--vsc-font-size);
      font-family: var(--vsc-font-family-mono);
      color: var(--vsc-foreground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      ::ng-deep mark {
        background: var(--vsc-accent-blue);
        color: var(--vsc-foreground-bright);
        padding: 0 2px;
        border-radius: 2px;
        font-style: normal;
        font-weight: 500;
      }
    }

    /* === CONTEXT MENU === */
    .ab-ctx-menu {
      position: fixed;
      min-width: 200px;
      background: var(--vsc-panel-background);
      border: 1px solid var(--vsc-border);
      border-radius: var(--vsc-border-radius);
      box-shadow: var(--vsc-widget-shadow);
      z-index: calc(var(--vsc-z-modal) + 100);
      padding: var(--vsc-padding-xs) 0;
      animation: ab-appear var(--vsc-transition-fast) cubic-bezier(0.2, 0, 0.2, 1);
    }

    .ab-ctx-path {
      padding: var(--vsc-padding-sm) var(--vsc-padding-lg);
      font-size: 11px;
      font-family: var(--vsc-font-family-mono);
      color: var(--vsc-foreground-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
      border-bottom: 1px solid var(--vsc-border-subtle);
      margin-bottom: var(--vsc-padding-xs);
    }

    .ab-ctx-divider {
      margin: var(--vsc-padding-xs) 0;
      border: none;
      border-top: 1px solid var(--vsc-border-subtle);
    }

    .ab-ctx-item {
      display: flex;
      align-items: center;
      gap: var(--vsc-padding-sm);
      width: 100%;
      padding: var(--vsc-padding-sm) var(--vsc-padding-lg);
      background: transparent;
      border: none;
      color: var(--vsc-foreground);
      font-size: var(--vsc-font-size);
      font-family: var(--vsc-font-family);
      cursor: pointer;
      text-align: left;
      transition: background-color var(--vsc-transition-fast);

      svg {
        width: 14px;
        height: 14px;
        fill: currentColor;
        opacity: 0.8;
        flex-shrink: 0;
      }

      &:hover {
        background: var(--vsc-list-hover-background);
        
        svg {
          opacity: 1;
        }
      }

      &:active {
        background: var(--vsc-list-active-background);
        color: var(--vsc-foreground-bright);
      }
    }

    /* === DROP ANCHOR === */
    .ab-drop-anchor {
      position: relative;
    }

    /* === COMPACT MODE OVERRIDES === */
    :host-context(.compact-mode) {
      .ab-bar {
        height: 28px;
      }
      
      .ab-edit {
        height: 28px;
      }
      
      .ab-btn {
        width: 22px;
        height: 22px;
        
        svg {
          width: 14px;
          height: 14px;
        }
      }
      
      .ab-chev {
        width: 18px;
        height: 22px;
      }
      
      .ab-drive-letter {
        font-size: var(--vsc-font-size-small);
        padding: 0 var(--vsc-padding-sm);
        height: 22px;
        line-height: 22px;
      }
      
      .ab-seg {
        height: 22px;
        line-height: 22px;
        font-size: var(--vsc-font-size-small);
        padding: 0 var(--vsc-padding-sm);
      }
      
      .ab-drive-grid-item {
        padding: var(--vsc-padding-sm);
      }
      
      .ab-drop-item {
        height: 26px;
      }
    }

    /* === LIGHT THEME ADJUSTMENTS === */
    :host-context(.vscode-light) {
      .ab-drive-letter {
        background: var(--vsc-button-background);
        color: var(--vsc-foreground-bright);
      }
      
      .ab-btn--star:hover {
        color: var(--vsc-accent-yellow);
      }
      
      .ab-checkbox--checked {
        background: var(--vsc-accent-blue) !important;
      }
      
      .ab-pin-remove:hover {
        background: var(--vsc-error) !important;
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

  @Output() pathChange = new EventEmitter<string>();
  @Output() navigateUpClicked = new EventEmitter<void>();
  @Output() refreshClicked = new EventEmitter<void>();
  @Output() openInOtherPane = new EventEmitter<string>();

  // ── State: path ─────────────────────────────────────────
  currentPath = '/';
  segments: PathSegment[] = [];
  
  get isWin(): boolean {
    return isWindowsPath(this.currentPath);
  }

  // ── State: drive switcher ────────────────────────────────
  drives: DriveInfo[] = [];
  showDriveMenu = false;
  driveMenuLeft = 0;
  driveMenuTop = 0;
  drivesLoading = false;

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

  ngOnInit(): void {
    this.currentPath = normalizePath(this.initialPath);
    this.rebuildSegments();
    this.loadPins();

    this.editChange$
      .pipe(debounceTime(240), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(v => this.fetchSuggestions(v));

    if (this.isWin) {
      this.loadDrives();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialPath'] && !changes['initialPath'].firstChange) {
      const next = normalizePath(changes['initialPath'].currentValue);
      if (next !== this.currentPath) {
        this.currentPath = next;
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
  // Drive handling
  // ────────────────────────────────────────────────────────

  onDriveLetterClick(seg: PathSegment, e: MouseEvent): void {
    e.stopPropagation();
    this.closeAll();
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    this.driveMenuLeft = rect.left;
    this.driveMenuTop = rect.bottom + 4;
    
    this.showDriveMenu = true;
    
    if (this.drives.length === 0 && !this.drivesLoading) {
      this.loadDrives();
    }
  }

  switchToDrive(drive: DriveInfo): void {
    this.showDriveMenu = false;
    if (drive.path !== this.currentPath) {
      this.navigateTo(drive.path);
    }
  }

  async loadDrives(): Promise<void> {
    if (!this.isWin) return;
    
    this.drivesLoading = true;
    try {
      const drives = await this.apiService.listDrives();
      this.drives = drives || [];
    } catch (error) {
      console.error('Failed to load drives', error);
      this.drives = [];
    } finally {
      this.drivesLoading = false;
      this.cdr.detectChanges();
    }
  }

  getDriveIcon(drive: DriveInfo): string {
    if (drive.driveType === 'fixed') return '💽';
    if (drive.driveType === 'removable') return '💾';
    if (drive.driveType === 'cdrom') return '💿';
    if (drive.driveType === 'network') return '🌐';
    if (drive.driveType === 'ramdisk') return '⚡';
    return '💽';
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
  }

  // ────────────────────────────────────────────────────────
  // Segments
  // ────────────────────────────────────────────────────────

  private rebuildSegments(): void {
    this.segments = buildSegments(this.currentPath);
    setTimeout(() => {
      if (this.crumbsEl) {
        const el = this.crumbsEl.nativeElement;
        el.scrollLeft = el.scrollWidth;
      }
    }, 0);
  }

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
    this.showDriveMenu = false;

    if (this.chevIdx === idx) {
      this.chevIdx = -1;
      this.siblings = [];
      return;
    }

    const target = e.target as HTMLElement;
    const rect = target.getBoundingClientRect();
    this.sibDropLeft = Math.round(rect.left);
    this.sibDropTop = Math.round(rect.bottom + 4);

    this.chevIdx = idx;
    this.siblings = [];
    this.sibLoading = true;

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
    if (this.showPinDrop) {
      this.chevIdx = -1;
      this.showDriveMenu = false;
    }
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
    this.showDriveMenu = false;
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
      else if (this.editMode) { this.exitEditMode(false); e.preventDefault(); }
      else if (this.chevIdx >= 0 || this.showPinDrop || this.showDriveMenu) { this.closeAll(); e.preventDefault(); }
    }
  }
}