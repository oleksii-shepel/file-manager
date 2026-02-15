import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Keyboard shortcut definition
 */
export interface ShortcutDefinition {
  id: string;
  key: string;
  modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[];
  action: () => void | Promise<void>;
  context?: 'global' | 'pane' | 'tab' | 'filter' | 'modal';
  category: 'navigation' | 'tabs' | 'files' | 'search' | 'workspace' | 'pane';
  description: string;
  enabled?: boolean;
}

/**
 * Shortcut category for help display
 */
export interface ShortcutCategory {
  name: string;
  shortcuts: ShortcutDefinition[];
}

/**
 * Keyboard event context information
 */
interface KeyboardContext {
  inInput: boolean;
  inTextarea: boolean;
  inModal: boolean;
  activePane: 'left' | 'right' | null;
  hasSelection: boolean;
}

/**
 * Global keyboard shortcut service
 * Manages all keyboard shortcuts across the application
 */
@Injectable({
  providedIn: 'root'
})
export class KeyboardService {
  private shortcuts = new Map<string, ShortcutDefinition>();
  private enabledSubject = new BehaviorSubject<boolean>(true);
  public enabled$ = this.enabledSubject.asObservable();
  
  private historyStack: string[] = [];
  private maxHistorySize = 50;

  constructor() {
    this.initializeGlobalListener();
  }

  /**
   * Initialize global keyboard event listener
   */
  private initializeGlobalListener(): void {
    document.addEventListener('keydown', (event) => {
      if (!this.enabledSubject.value) return;

      const handled = this.handleKeyboardEvent(event);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  /**
   * Register a keyboard shortcut
   */
  register(shortcut: ShortcutDefinition): void {
    const key = this.buildShortcutKey(shortcut.key, shortcut.modifiers);
    
    if (this.shortcuts.has(key)) {
      console.warn(`Shortcut conflict: ${key} is already registered`);
    }

    this.shortcuts.set(key, {
      ...shortcut,
      enabled: shortcut.enabled !== false,
    });
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregister(id: string): void {
    for (const [key, shortcut] of this.shortcuts.entries()) {
      if (shortcut.id === id) {
        this.shortcuts.delete(key);
        break;
      }
    }
  }

  /**
   * Handle keyboard event
   */
  private handleKeyboardEvent(event: KeyboardEvent): boolean {
    const context = this.getKeyboardContext(event);
    
    // Build key signature from event
    const modifiers: ('ctrl' | 'shift' | 'alt' | 'meta')[] = [];
    if (event.ctrlKey || event.metaKey) modifiers.push(event.ctrlKey ? 'ctrl' : 'meta');
    if (event.shiftKey) modifiers.push('shift');
    if (event.altKey) modifiers.push('alt');

    const key = this.normalizeKey(event.key);
    const shortcutKey = this.buildShortcutKey(key, modifiers);

    // Find matching shortcut
    const shortcut = this.shortcuts.get(shortcutKey);
    
    if (!shortcut || !shortcut.enabled) {
      return false;
    }

    // Check context restrictions
    if (!this.isShortcutValidInContext(shortcut, context)) {
      return false;
    }

    // Execute action
    try {
      const result = shortcut.action();
      if (result instanceof Promise) {
        result.catch(err => console.error('Shortcut action failed:', err));
      }
      
      // Add to history
      this.addToHistory(shortcut.id);
      
      return true;
    } catch (error) {
      console.error('Error executing shortcut:', error);
      return false;
    }
  }

  /**
   * Get current keyboard context
   */
  private getKeyboardContext(event: KeyboardEvent): KeyboardContext {
    const target = event.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();

    return {
      inInput: tagName === 'input',
      inTextarea: tagName === 'textarea',
      inModal: !!target.closest('.modal, [role="dialog"]'),
      activePane: this.getActivePaneFromTarget(target),
      hasSelection: window.getSelection()!.toString().length > 0,
    };
  }

  /**
   * Get active pane from event target
   */
  private getActivePaneFromTarget(target: HTMLElement): 'left' | 'right' | null {
    const pane = target.closest('.pane');
    if (!pane) return null;

    const panes = Array.from(document.querySelectorAll('.pane'));
    const index = panes.indexOf(pane);
    
    return index === 0 ? 'left' : index === 1 ? 'right' : null;
  }

  /**
   * Check if shortcut is valid in current context
   */
  private isShortcutValidInContext(
    shortcut: ShortcutDefinition,
    context: KeyboardContext
  ): boolean {
    // Global shortcuts work everywhere except when typing
    if (shortcut.context === 'global') {
      return !context.inInput && !context.inTextarea;
    }

    // Modal shortcuts only work in modals
    if (shortcut.context === 'modal') {
      return context.inModal;
    }

    // Filter shortcuts only work in filter inputs
    if (shortcut.context === 'filter') {
      const target = document.activeElement as HTMLElement;
      return target?.classList.contains('filter-input') || false;
    }

    // Pane-specific shortcuts
    if (shortcut.context === 'pane') {
      return context.activePane !== null;
    }

    // Default: works when not typing
    return !context.inInput && !context.inTextarea;
  }

  /**
   * Build shortcut key string
   */
  private buildShortcutKey(key: string, modifiers?: string[]): string {
    const parts: string[] = [];
    
    if (modifiers) {
      const sorted = [...modifiers].sort();
      parts.push(...sorted);
    }
    
    parts.push(key.toLowerCase());
    
    return parts.join('+');
  }

  /**
   * Normalize key name
   */
  private normalizeKey(key: string): string {
    const keyMap: Record<string, string> = {
      ' ': 'space',
      'Escape': 'escape',
      'Enter': 'enter',
      'Tab': 'tab',
      'Backspace': 'backspace',
      'Delete': 'delete',
      'ArrowUp': 'arrowup',
      'ArrowDown': 'arrowdown',
      'ArrowLeft': 'arrowleft',
      'ArrowRight': 'arrowright',
      'Control': 'ctrl',
      'Meta': 'meta',
      'Shift': 'shift',
      'Alt': 'alt',
    };

    return keyMap[key] || key.toLowerCase();
  }

  /**
   * Add shortcut to history
   */
  private addToHistory(shortcutId: string): void {
    this.historyStack.push(shortcutId);
    
    if (this.historyStack.length > this.maxHistorySize) {
      this.historyStack.shift();
    }
  }

  /**
   * Get all shortcuts grouped by category
   */
  getShortcutsByCategory(): ShortcutCategory[] {
    const categories = new Map<string, ShortcutDefinition[]>();

    for (const shortcut of this.shortcuts.values()) {
      const category = shortcut.category;
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(shortcut);
    }

    const categoryNames: Record<string, string> = {
      navigation: 'Navigation',
      tabs: 'Tab Management',
      files: 'File Operations',
      search: 'Search & Filter',
      workspace: 'Workspaces',
      pane: 'Pane Control',
    };

    return Array.from(categories.entries()).map(([key, shortcuts]) => ({
      name: categoryNames[key] || key,
      shortcuts: shortcuts.sort((a, b) => a.description.localeCompare(b.description)),
    }));
  }

  /**
   * Get all shortcuts
   */
  getAllShortcuts(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Enable/disable keyboard shortcuts globally
   */
  setEnabled(enabled: boolean): void {
    this.enabledSubject.next(enabled);
  }

  /**
   * Toggle a specific shortcut
   */
  toggleShortcut(id: string, enabled: boolean): void {
    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.id === id) {
        shortcut.enabled = enabled;
        break;
      }
    }
  }

  /**
   * Format shortcut for display
   */
  formatShortcut(shortcut: ShortcutDefinition): string {
    const parts: string[] = [];
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    if (shortcut.modifiers) {
      for (const mod of shortcut.modifiers) {
        switch (mod) {
          case 'ctrl':
            parts.push(isMac ? '⌃' : 'Ctrl');
            break;
          case 'meta':
            parts.push(isMac ? '⌘' : 'Win');
            break;
          case 'shift':
            parts.push(isMac ? '⇧' : 'Shift');
            break;
          case 'alt':
            parts.push(isMac ? '⌥' : 'Alt');
            break;
        }
      }
    }

    // Format key name
    const keyName = this.formatKeyName(shortcut.key);
    parts.push(keyName);

    return parts.join(isMac ? '' : '+');
  }

  /**
   * Format key name for display
   */
  private formatKeyName(key: string): string {
    const keyMap: Record<string, string> = {
      'space': '␣',
      'escape': 'Esc',
      'enter': '⏎',
      'tab': '⇥',
      'backspace': '⌫',
      'delete': 'Del',
      'arrowup': '↑',
      'arrowdown': '↓',
      'arrowleft': '←',
      'arrowright': '→',
    };

    return keyMap[key.toLowerCase()] || key.toUpperCase();
  }

  /**
   * Get recent shortcut history
   */
  getHistory(): string[] {
    return [...this.historyStack].reverse();
  }

  /**
   * Clear shortcut history
   */
  clearHistory(): void {
    this.historyStack = [];
  }

  /**
   * Check if a key combination is available
   */
  isAvailable(key: string, modifiers?: string[]): boolean {
    const shortcutKey = this.buildShortcutKey(key, modifiers);
    return !this.shortcuts.has(shortcutKey);
  }

  /**
   * Export shortcuts configuration
   */
  exportConfig(): any {
    const shortcuts: any[] = [];
    
    for (const shortcut of this.shortcuts.values()) {
      shortcuts.push({
        id: shortcut.id,
        key: shortcut.key,
        modifiers: shortcut.modifiers,
        category: shortcut.category,
        description: shortcut.description,
        enabled: shortcut.enabled,
      });
    }

    return {
      version: '1.0',
      shortcuts,
    };
  }

  /**
   * Import shortcuts configuration
   */
  importConfig(config: any): void {
    if (!config.shortcuts || !Array.isArray(config.shortcuts)) {
      console.error('Invalid shortcuts configuration');
      return;
    }

    for (const shortcutData of config.shortcuts) {
      const existing = Array.from(this.shortcuts.values())
        .find(s => s.id === shortcutData.id);

      if (existing) {
        existing.enabled = shortcutData.enabled !== false;
      }
    }
  }
}
