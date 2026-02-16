import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { PathHistoryService, PathSuggestion } from '../services/path-history.service';

/**
 * Address Bar with Autocomplete
 * Provides intelligent path suggestions based on:
 * - Path history
 * - Directory listing
 * - Fuzzy matching
 */
@Component({
  selector: 'app-address-bar-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="address-bar-wrapper">
      <div 
        class="address-bar-container" 
        [class.focused]="isFocused"
        (click)="onContainerClick($event)"
        (mouseenter)="onMouseEnter()"
        (mouseleave)="onMouseLeave()"
      >
        <!-- Address Input -->
        <div class="address-input-wrapper">
          <span class="address-icon">📂</span>
          <input
            #addressInput
            type="text"
            [(ngModel)]="currentPath"
            (ngModelChange)="onPathChange($event)"
            (focus)="onFocus()"
            (blur)="onBlur()"
            (keydown)="onKeyDown($event)"
            (paste)="onPaste($event)"
            class="address-input"
            [placeholder]="placeholder"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            *ngIf="currentPath !== initialPath"
            (click)="revertPath(); $event.stopPropagation()"
            class="btn-revert"
            title="Revert changes"
          >
            ↶
          </button>
        </div>

        <!-- Quick Action Buttons -->
        <div class="address-actions" (click)="$event.stopPropagation()">
          <button
            (click)="onNavigateUpClick(); $event.stopPropagation()"
            class="btn-action"
            title="Parent directory (Backspace)"
          >
            ⬆️
          </button>
          <button
            (click)="onRefreshClick(); $event.stopPropagation()"
            class="btn-action"
            title="Refresh (F5)"
          >
            🔄
          </button>
          <button
            (click)="copyPath(); $event.stopPropagation()"
            class="btn-action"
            title="Copy path"
          >
            📋
          </button>
        </div>
      </div>

      <!-- Autocomplete Dropdown -->
      <div
        *ngIf="showSuggestions && suggestions.length > 0"
        class="suggestions-dropdown"
        (mousedown)="$event.preventDefault()"
        (mouseenter)="onDropdownMouseEnter()"
        (mouseleave)="onDropdownMouseLeave()"
      >
        <div class="suggestions-header">
          <span class="suggestions-title">Suggestions</span>
          <span class="suggestions-count">{{ suggestions.length }}</span>
        </div>

        <div class="suggestions-list">
          <div
            *ngFor="let suggestion of suggestions; let i = index"
            class="suggestion-item"
            [class.selected]="i === selectedIndex"
            (mouseenter)="selectedIndex = i"
            (click)="selectSuggestion(suggestion)"
          >
            <div class="suggestion-icon">
              {{ getSuggestionIcon(suggestion) }}
            </div>

            <div class="suggestion-info">
              <div class="suggestion-path" [innerHTML]="highlightMatch(suggestion.path, currentPath)"></div>
              <div class="suggestion-meta">
                <span class="suggestion-type" [class]="'type-' + suggestion.matchType">
                  {{ suggestion.matchType }}
                </span>
                <span class="suggestion-name">{{ suggestion.displayName }}</span>
              </div>
            </div>

            <div class="suggestion-score">
              {{ suggestion.score.toFixed(0) }}
            </div>
          </div>
        </div>

        <div class="suggestions-footer">
          <span class="suggestion-hint">
            <kbd>↑</kbd><kbd>↓</kbd> Navigate
            <kbd>Enter</kbd> Select
            <kbd>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Host element */
    :host {
      display: block;
      width: 100%;
      background: transparent;
      position: relative;
      z-index: auto;
      font-size: var(--vsc-font-size);
    }

    /* Wrapper to contain both address bar and dropdown */
    .address-bar-wrapper {
      position: relative;
      width: 100%;
      background: transparent;
      z-index: 1;
    }

    .address-bar-container {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--vsc-gap-sm);
      padding: var(--vsc-gap-sm) var(--vsc-gap-lg);
      background: transparent;
      border-bottom: 1px solid var(--vsc-border);
      transition: background 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
      z-index: 2;
      cursor: text;
    }

    .address-bar-container:hover {
      background: rgba(0,0,0,0.03);
    }

    .address-bar-container.focused {
      background: rgba(0, 122, 204, 0.06);
    }

    .address-bar-container.mouse-hover {
      background: rgba(0,0,0,0.02);
    }

    .address-input-wrapper {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
      gap: var(--vsc-gap-sm);
      padding: var(--vsc-gap-sm) var(--vsc-gap-md);
      background: var(--vsc-panel-background);
      border: 1px solid var(--vsc-border);
      border-radius: var(--vsc-radius);
      box-sizing: border-box;
      transition: background 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
      cursor: text;
    }

    .address-input-wrapper:hover {
      background: rgba(0,0,0,0.04);
    }

    .address-input-wrapper:focus-within {
      background: var(--vsc-panel-background);
      border-color: var(--vsc-accent);
      box-shadow: 0 0 0 1px var(--vsc-accent);
    }

    .address-input-wrapper .address-icon {
      font-size: 1rem;
      opacity: 0.7;
      pointer-events: none;
      color: var(--vsc-muted);
    }

    .address-input-wrapper .address-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--vsc-text);
      font-family: 'Courier New', monospace;
      font-size: inherit;
      outline: none;
      cursor: text;
    }

    .address-input-wrapper .address-input::placeholder {
      color: var(--vsc-muted);
    }

    .address-input-wrapper .btn-revert {
      padding: 0.15rem 0.4rem;
      background: transparent;
      border: none;
      color: var(--vsc-muted);
      cursor: pointer;
      font-size: 0.95em;
      transition: background 0.12s, color 0.12s;
      border-radius: 3px;
      z-index: 3;
    }

    .address-input-wrapper .btn-revert:hover {
      background: rgba(0,0,0,0.06);
      color: var(--vsc-text);
    }

    .address-actions {
      display: flex;
      gap: var(--vsc-gap-xs);
    }

    .btn-action {
      padding: 0.28rem 0.5rem;
      background: var(--vsc-panel-background);
      border: 1px solid var(--vsc-border);
      border-radius: 4px;
      color: var(--vsc-text);
      cursor: pointer;
      font-size: 0.95em;
      transition: background 0.12s, transform 0.08s;
      z-index: 3;
    }

    .btn-action:hover {
      background: rgba(0,0,0,0.06);
      border-color: var(--vsc-accent);
      transform: translateY(-1px);
    }

    .btn-action:active {
      transform: translateY(0);
    }

    /* Suggestions Dropdown */
    .suggestions-dropdown {
      position: absolute;
      top: 100%;
      left: var(--vsc-gap-lg);
      right: var(--vsc-gap-lg);
      margin-top: 0.25rem;
      background: var(--vsc-panel-background);
      border: 1px solid var(--vsc-accent);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      z-index: 1000;
      max-height: 400px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: dropdownFadeIn 0.12s ease;
    }

    @keyframes dropdownFadeIn {
      from { opacity: 0; transform: translateY(-6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .suggestions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid var(--vsc-border);
      background: var(--vsc-panel-background);
    }

    .suggestions-title {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--vsc-accent);
      letter-spacing: 0.4px;
    }

    .suggestions-count {
      font-size: 0.8rem;
      padding: 0.15rem 0.5rem;
      background: var(--vsc-accent);
      border-radius: 10px;
      color: white;
      font-weight: 600;
    }

    .suggestions-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.2rem 0;
      display: flex;
      flex-direction: column;
    }

    .suggestions-list::-webkit-scrollbar { width: 8px; }
    .suggestions-list::-webkit-scrollbar-track { background: var(--vsc-panel-background); }
    .suggestions-list::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.4); border-radius: 4px; }

    .suggestion-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
      padding: 0.6rem 0.75rem;
      cursor: pointer;
      transition: background 0.12s, border-color 0.12s;
      background: var(--vsc-panel-background);
      border-left: 3px solid transparent;
      width: 100%;
    }

    .suggestion-item:hover { background: rgba(0,0,0,0.04); border-left-color: var(--vsc-border); }
    .suggestion-item.selected { background: rgba(0,100,140,0.12); border-left-color: var(--vsc-accent); }

    .suggestion-icon { font-size: 1.1rem; flex-shrink: 0; }
    .suggestion-info { flex: 1; min-width: 0; }

    .suggestion-path { font-size: 0.9rem; font-family: 'Courier New', monospace; color: var(--vsc-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 0.15rem; }
    .suggestion-path ::ng-deep mark { background: var(--vsc-accent); color: white; padding: 0.06rem 0.18rem; border-radius: 2px; font-weight: 600; }

    .suggestion-meta { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; }

    .suggestion-type { padding: 0.2rem 0.45rem; border-radius: 3px; text-transform: uppercase; font-weight: 700; font-size: 0.68rem; }
    .suggestion-type.type-history { background: var(--vsc-success); color: white; }
    .suggestion-type.type-directory { background: var(--vsc-accent); color: white; }
    .suggestion-type.type-fuzzy { background: #ff9800; color: white; }

    .suggestion-name { color: var(--vsc-muted); }
    .suggestion-score { font-size: 0.8rem; color: var(--vsc-muted); font-weight: 600; font-family: 'Courier New', monospace; }

    .suggestions-footer { padding: 0.5rem 0.75rem; border-top: 1px solid var(--vsc-border); background: var(--vsc-panel-background); text-align: center; }

    .suggestion-hint { font-size: 0.75rem; color: var(--vsc-muted); }
    .suggestion-hint kbd { display: inline-block; padding: 0.18rem 0.35rem; background: var(--vsc-panel-background); border: 1px solid var(--vsc-border); border-radius: 3px; font-family: 'Courier New', monospace; font-size: 0.7rem; color: var(--vsc-accent); margin: 0 0.2rem; font-weight: 600; }
  `]
})
export class AddressBarAutocompleteComponent implements OnInit, OnDestroy {
  @ViewChild('addressInput') addressInput?: ElementRef<HTMLInputElement>;

  @Input() initialPath = '/';
  @Input() placeholder = 'Enter path...';
  @Input() paneId = 'left';

  @Output() pathChange = new EventEmitter<string>();
  @Output() navigateUpClicked = new EventEmitter<void>();
  @Output() refreshClicked = new EventEmitter<void>();

  currentPath = '';
  suggestions: PathSuggestion[] = [];
  showSuggestions = false;
  selectedIndex = 0;
  isFocused = false;
  isMouseOver = false;
  isDropdownMouseOver = false;
  isToggling = false;

  private pathChange$ = new Subject<string>();
  private destroy$ = new Subject<void>();
  private blurTimeout: any;

  constructor(
    private pathHistoryService: PathHistoryService,
    private elementRef: ElementRef
  ) { }

  ngOnInit(): void {
    this.currentPath = this.normalizePath(this.initialPath);

    // Setup debounced path change handling
    this.pathChange$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(path => {
        this.loadSuggestions(path);
      });
  }

  ngOnDestroy(): void {
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Normalize path to prevent duplicate slashes and convert backslashes to forward slashes
   */
  private normalizePath(path: string): string {
    if (!path) return '/';

    // Convert backslashes to forward slashes
    let normalized = path.replace(/\\/g, '/');

    // Replace multiple slashes with single slash
    normalized = normalized.replace(/\/+/g, '/');

    // Ensure root is just '/'
    if (normalized === '') return '/';

    // Remove trailing slash unless it's root
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Handle path input change
   */
  onPathChange(path: string): void {
    // Normalize while typing to prevent double slashes and convert backslashes
    const normalized = this.normalizePath(path);
    if (normalized !== path) {
      // Update model without emitting change event
      this.currentPath = normalized;
    }
    this.pathChange$.next(normalized);
  }

  /**
   * Handle paste events to normalize paths
   */
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text');
    if (pastedText) {
      const normalized = this.normalizePath(pastedText);
      this.currentPath = normalized;
      this.onPathChange(normalized);
    }
  }

  /**
   * Handle input events to catch backslash conversion in real-time
   */
  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Check for backslashes or multiple slashes
    if (value.includes('\\') || value.includes('//')) {
      const normalized = this.normalizePath(value);
      if (normalized !== value) {
        this.currentPath = normalized;
        // Set cursor position at the end
        setTimeout(() => {
          input.value = normalized;
          input.setSelectionRange(normalized.length, normalized.length);
        });
      }
    }
  }

  /**
   * Load path suggestions
   */
  private async loadSuggestions(path: string): Promise<void> {
    if (!path || path.trim() === '') {
      this.suggestions = [];
      this.showSuggestions = false;
      return;
    }

    try {
      this.suggestions = await this.pathHistoryService.getSuggestions(
        path,
        this.initialPath
      );
      this.showSuggestions = this.suggestions.length > 0;
      this.selectedIndex = 0;
    } catch (error) {
      console.error('Failed to load suggestions:', error);
      this.suggestions = [];
      this.showSuggestions = false;
    }
  }

  /**
   * Handle mouse enter on container
   */
  onMouseEnter(): void {
    this.isMouseOver = true;
  }

  /**
   * Handle mouse leave on container
   */
  onMouseLeave(): void {
    this.isMouseOver = false;
  }

  /**
   * Handle mouse enter on dropdown
   */
  onDropdownMouseEnter(): void {
    this.isDropdownMouseOver = true;
  }

  /**
   * Handle mouse leave on dropdown
   */
  onDropdownMouseLeave(): void {
    this.isDropdownMouseOver = false;
  }

  /**
   * Handle input focus
   */
  onFocus(): void {
    // Clear any pending blur timeout
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
      this.blurTimeout = null;
    }

    this.isFocused = true;

    // Show suggestions if we have any
    if (this.suggestions.length > 0) {
      this.showSuggestions = true;
    } else if (this.currentPath) {
      // Load suggestions for current path
      this.loadSuggestions(this.currentPath);
    }
  }

  /**
   * Handle input blur
   */
  onBlur(): void {
    // Clear any existing timeout
    if (this.blurTimeout) {
      clearTimeout(this.blurTimeout);
    }

    // Don't immediately blur - wait to see if it's a click on the container
    this.blurTimeout = setTimeout(() => {
      // Only blur if mouse is not over component or dropdown
      // AND we're not in the middle of a toggle operation
      if (!this.isMouseOver && !this.isDropdownMouseOver && !this.isToggling) {
        this.isFocused = false;
        this.showSuggestions = false;
      }
      this.blurTimeout = null;
    }, 150);
  }

  /**
   * Handle click on the container to focus the input
   */
  onContainerClick(event: MouseEvent): void {
    // Don't toggle if clicking on buttons or their containers
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('.address-actions')) {
      return;
    }

    // Prevent default to avoid interference
    event.preventDefault();

    // Toggle focus: if focused then blur, if not focused then focus
    if (this.isFocused) {
      // Already focused, so blur
      this.isFocused = false;
      this.showSuggestions = false;
      this.addressInput?.nativeElement.blur();
    } else {
      // Not focused, so focus
      this.addressInput?.nativeElement.focus();
      // onFocus will set isFocused = true
    }
  }

  /**
   * Handle click outside to blur
   */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isClickInside = this.elementRef.nativeElement.contains(target);

    // If clicking outside and not on dropdown, blur
    if (!isClickInside && !this.isDropdownMouseOver && this.isFocused) {
      this.isFocused = false;
      this.showSuggestions = false;
      this.addressInput?.nativeElement.blur();
    }
  }

  /**
   * Handle mouse down on container to prevent blur
   */
  @HostListener('mousedown', ['$event'])
  onMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    // Don't prevent if clicking on buttons
    if (!target.closest('button') && !target.closest('.address-actions')) {
      // Prevent default to stop focus/blur interference
      event.preventDefault();
    }
  }


  /**
   * Handle keyboard navigation
   */
  onKeyDown(event: KeyboardEvent): void {
    if (!this.showSuggestions || this.suggestions.length === 0) {
      // Handle Enter when no suggestions
      if (event.key === 'Enter') {
        event.preventDefault();
        this.navigateToPath();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(
          this.selectedIndex + 1,
          this.suggestions.length - 1
        );
        this.scrollToSelected();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.scrollToSelected();
        break;

      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex >= 0 && this.selectedIndex < this.suggestions.length) {
          this.selectSuggestion(this.suggestions[this.selectedIndex]);
        } else {
          this.navigateToPath();
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.showSuggestions = false;
        this.addressInput?.nativeElement.blur();
        break;

      case 'Tab':
        event.preventDefault();
        if (this.suggestions.length > 0) {
          // Auto-complete with first suggestion
          this.selectSuggestion(this.suggestions[0]);
        }
        break;
    }
  }

  /**
   * Select a suggestion
   */
  selectSuggestion(suggestion: PathSuggestion): void {
    this.currentPath = this.normalizePath(suggestion.path);
    this.showSuggestions = false;
    this.navigateToPath();
  }

  /**
   * Navigate to current path
   */
  navigateToPath(): void {
    const normalizedPath = this.normalizePath(this.currentPath);
    if (normalizedPath !== this.currentPath) {
      this.currentPath = normalizedPath;
    }

    if (this.currentPath && this.currentPath !== this.initialPath) {
      this.pathChange.emit(this.currentPath);
    }
  }

  /**
   * Revert path changes
   */
  revertPath(): void {
    this.currentPath = this.normalizePath(this.initialPath);
    this.showSuggestions = false;
  }

  /**
   * Handle navigate up button click
   */
  onNavigateUpClick(): void {
    // Calculate parent path
    const parentPath = this.getParentPath(this.currentPath || this.initialPath);

    // Emit event for parent to handle
    this.navigateUpClicked.emit();

    // Also update current path and navigate
    if (parentPath !== this.currentPath) {
      this.currentPath = this.normalizePath(parentPath);
      this.navigateToPath();
    }
  }

  /**
   * Handle refresh button click
   */
  onRefreshClick(): void {
    // Emit event for parent to handle
    this.refreshClicked.emit();
  }

  /**
   * Get parent path with proper normalization
   */
  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);

    if (!normalized || normalized === '/' || normalized === '') {
      return '/';
    }

    const parts = normalized.split('/').filter(p => p.length > 0);
    if (parts.length === 0) {
      return '/';
    }

    parts.pop();
    return parts.length > 0 ? '/' + parts.join('/') : '/';
  }

  /**
   * Copy path to clipboard (normalized)
   */
  async copyPath(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.normalizePath(this.currentPath));
      console.log('Path copied to clipboard');
      // Could show a toast notification here
    } catch (error) {
      console.error('Failed to copy path:', error);
    }
  }

  /**
   * Get suggestion icon
   */
  getSuggestionIcon(suggestion: PathSuggestion): string {
    switch (suggestion.matchType) {
      case 'history':
        return '🕒';
      case 'directory':
        return '📁';
      case 'fuzzy':
        return '🔍';
      default:
        return '📂';
    }
  }

  /**
   * Highlight matching text (update to handle normalized paths)
   */
  highlightMatch(text: string, query: string): string {
    if (!query) return text;

    const normalizedText = this.normalizePath(text);
    const normalizedQuery = this.normalizePath(query);

    const queryLower = normalizedQuery.toLowerCase();
    const textLower = normalizedText.toLowerCase();
    const index = textLower.indexOf(queryLower);

    if (index === -1) {
      return normalizedText;
    }

    return (
      normalizedText.substring(0, index) +
      '<mark>' +
      normalizedText.substring(index, index + query.length) +
      '</mark>' +
      normalizedText.substring(index + query.length)
    );
  }

  /**
   * Scroll to selected suggestion
   */
  private scrollToSelected(): void {
    setTimeout(() => {
      const selected = document.querySelector('.suggestion-item.selected');
      if (selected) {
        selected.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }, 0);
  }

  /**
   * Listen for global keyboard shortcuts
   */
  @HostListener('document:keydown', ['$event'])
  handleGlobalKeyDown(event: KeyboardEvent): void {
    // Ctrl+L or Cmd+L to focus address bar
    if ((event.ctrlKey || event.metaKey) && event.key === 'l') {
      event.preventDefault();
      this.addressInput?.nativeElement.focus();
      this.addressInput?.nativeElement.select();
    }
  }
}