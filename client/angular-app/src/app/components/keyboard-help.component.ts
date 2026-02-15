import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { KeyboardService, ShortcutCategory } from '../services/keyboard.service';

@Component({
  selector: 'app-keyboard-help',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './keyboard-help.component.html',
  styleUrls: ['./keyboard-help.component.scss']
})
export class KeyboardHelpComponent implements OnInit, OnDestroy {
  isVisible = false;
  categories: ShortcutCategory[] = [];
  searchText = '';
  filteredCategories: ShortcutCategory[] = [];

  private destroy$ = new Subject<void>();

  constructor(private keyboardService: KeyboardService) {}

  ngOnInit(): void {
    this.loadShortcuts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Listen for keyboard events to show/hide help
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    // Show help with ? or Ctrl+/
    if (event.key === '?' || (event.ctrlKey && event.key === '/')) {
      if (!this.isVisible) {
        event.preventDefault();
        this.show();
      }
    }
    
    // Hide with Escape
    if (event.key === 'Escape' && this.isVisible) {
      event.preventDefault();
      this.hide();
    }
  }

  /**
   * Load shortcuts from service
   */
  loadShortcuts(): void {
    this.categories = this.keyboardService.getShortcutsByCategory();
    this.filteredCategories = this.categories;
  }

  /**
   * Show help modal
   */
  show(): void {
    this.isVisible = true;
    this.searchText = '';
    this.loadShortcuts();
  }

  /**
   * Hide help modal
   */
  hide(): void {
    this.isVisible = false;
  }

  /**
   * Filter shortcuts by search text
   */
  onSearchChange(): void {
    const search = this.searchText.toLowerCase().trim();

    if (!search) {
      this.filteredCategories = this.categories;
      return;
    }

    this.filteredCategories = this.categories
      .map(category => ({
        name: category.name,
        shortcuts: category.shortcuts.filter(shortcut => {
          const keyMatch = this.keyboardService.formatShortcut(shortcut)
            .toLowerCase()
            .includes(search);
          const descMatch = shortcut.description
            .toLowerCase()
            .includes(search);
          return keyMatch || descMatch;
        }),
      }))
      .filter(category => category.shortcuts.length > 0);
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchText = '';
    this.onSearchChange();
  }

  /**
   * Format shortcut for display
   */
  formatShortcut(shortcut: any): string {
    return this.keyboardService.formatShortcut(shortcut);
  }

  /**
   * Toggle shortcut enabled/disabled
   */
  toggleShortcut(shortcut: any): void {
    const newState = !shortcut.enabled;
    this.keyboardService.toggleShortcut(shortcut.id, newState);
    this.loadShortcuts();
  }

  /**
   * Export shortcuts configuration
   */
  exportConfig(): void {
    const config = this.keyboardService.exportConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keyboard-shortcuts.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import shortcuts configuration
   */
  importConfig(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target?.result as string);
        this.keyboardService.importConfig(config);
        this.loadShortcuts();
        alert('Shortcuts imported successfully!');
      } catch (error) {
        alert('Failed to import shortcuts: Invalid file format');
      }
    };
    reader.readAsText(file);
  }

  /**
   * Reset to default shortcuts
   */
  resetToDefaults(): void {
    if (confirm('Reset all shortcuts to defaults?')) {
      // This would need to be implemented based on your default shortcuts
      alert('Reset functionality not yet implemented');
    }
  }
}
