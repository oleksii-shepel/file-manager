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
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: transparent;
      border-bottom: 1px solid #3e3e42;
      transition: all 0.2s;
      z-index: 2;
      cursor: text;

      &:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      &.focused {
        background: rgba(0, 122, 204, 0.1);
        
        .address-input-wrapper {
          border-color: #007acc;
          box-shadow: 0 0 0 1px #007acc;
        }
      }

      &.mouse-hover {
        background: rgba(255, 255, 255, 0.02);
      }
    }

    .address-input-wrapper {
      position: relative;
      flex: 1;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      background: #1e1e1e;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      transition: all 0.2s;
      cursor: text;

      &:hover {
        background: #252526;
      }

      &:focus-within {
        background: #252526;
        border-color: #007acc;
        box-shadow: 0 0 0 1px #007acc;
      }

      .address-icon {
        font-size: 1rem;
        opacity: 0.6;
        pointer-events: none;
      }

      .address-input {
        flex: 1;
        background: transparent;
        border: none;
        color: #d4d4d4;
        font-family: 'Courier New', monospace;
        font-size: 0.9rem;
        outline: none;
        cursor: text;

        &::placeholder {
          color: #858585;
        }
      }

      .btn-revert {
        padding: 0.25rem 0.5rem;
        background: transparent;
        border: none;
        color: #858585;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
        border-radius: 3px;
        z-index: 3;

        &:hover {
          background: #505050;
          color: #d4d4d4;
        }
      }
    }

    .address-actions {
      display: flex;
      gap: 0.25rem;
    }

    .btn-action {
      padding: 0.4rem 0.6rem;
      background: #252526;
      border: 1px solid #3e3e42;
      border-radius: 4px;
      color: #d4d4d4;
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.2s;
      z-index: 3;

      &:hover {
        background: #37373d;
        border-color: #007acc;
        transform: translateY(-1px);
      }

      &:active {
        transform: translateY(0);
      }
    }

    /* Suggestions Dropdown */
    .suggestions-dropdown {
      position: absolute;
      top: 100%;
      left: 1rem;
      right: 1rem;
      margin-top: 0.25rem;
      background: #1e1e1e;
      border: 1px solid #007acc;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.8);
      z-index: 1000;
      max-height: 400px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: dropdownFadeIn 0.15s ease;
    }

    @keyframes dropdownFadeIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .suggestions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #3e3e42;
      background: #252526;
    }

    .suggestions-title {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      color: #007acc;
      letter-spacing: 0.5px;
    }

    .suggestions-count {
      font-size: 0.8rem;
      padding: 0.2rem 0.6rem;
      background: #007acc;
      border-radius: 12px;
      color: white;
      font-weight: 600;
    }

    .suggestions-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.25rem 0;
      display: flex;
      flex-direction: column;

      &::-webkit-scrollbar {
        width: 8px;
      }

      &::-webkit-scrollbar-track {
        background: #1e1e1e;
      }

      &::-webkit-scrollbar-thumb {
        background: #424242;
        border-radius: 4px;

        &:hover {
          background: #4e4e4e;
        }
      }
    }

    .suggestion-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      cursor: pointer;
      transition: all 0.15s;
      background: #1e1e1e;
      border-left: 3px solid transparent;
      width: 100%;
      flex-shrink: 0;

      &:hover {
        background: #2d2d30;
        border-left-color: #3e3e42;
      }

      &.selected {
        background: #0e4766;
        border-left-color: #007acc;
      }

      .suggestion-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
      }

      .suggestion-info {
        flex: 1;
        min-width: 0;
      }

      .suggestion-path {
        font-size: 0.9rem;
        font-family: 'Courier New', monospace;
        color: #d4d4d4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-bottom: 0.2rem;

        ::ng-deep mark {
          background: #007acc;
          color: white;
          padding: 0.1rem 0.2rem;
          border-radius: 2px;
          font-weight: 600;
        }
      }

      .suggestion-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
      }

      .suggestion-type {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        text-transform: uppercase;
        font-weight: 700;
        font-size: 0.7rem;
        letter-spacing: 0.3px;
        
        &.type-history {
          background: #16825d;
          color: white;
        }
        
        &.type-directory {
          background: #0078d4;
          color: white;
        }
        
        &.type-fuzzy {
          background: #ca5010;
          color: white;
        }
      }

      .suggestion-name {
        color: #858585;
      }

      .suggestion-score {
        font-size: 0.8rem;
        color: #858585;
        font-weight: 600;
        font-family: 'Courier New', monospace;
      }
    }

    .suggestions-footer {
      padding: 0.75rem 1rem;
      border-top: 1px solid #3e3e42;
      background: #252526;
      text-align: center;
    }

    .suggestion-hint {
      font-size: 0.75rem;
      color: #858585;

      kbd {
        display: inline-block;
        padding: 0.25rem 0.5rem;
        background: #1e1e1e;
        border: 1px solid #3e3e42;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
        font-size: 0.7rem;
        color: #007acc;
        margin: 0 0.25rem;
        font-weight: 600;
      }
    }
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