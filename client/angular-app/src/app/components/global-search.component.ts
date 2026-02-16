import { Component, OnInit, OnDestroy, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { GlobalSearchService, SearchResultItem, IndexStats, SearchConfig } from '../services/global-search.service';
import { FileType } from '@shared/protocol';

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './global-search.component.html',
  styleUrls: ['./global-search.component.scss']
})
export class GlobalSearchComponent implements OnInit, OnDestroy {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  isVisible = false;
  searchQuery = '';
  results: SearchResultItem[] = [];
  isSearching = false;
  selectedIndex = 0;
  indexStats: IndexStats | null = null;
  
  activeFilters = new Set<string>(['all']);
  showSettingsModal = false;
  
  searchConfig: SearchConfig = {
    maxResults: 50,
    fuzzyThreshold: 0.7,
    enableTypoTolerance: true,
    searchHidden: false,
    fileTypes: [FileType.FILE, FileType.DIRECTORY],
  };

  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(private searchService: GlobalSearchService) {}

  ngOnInit(): void {
    // Subscribe to index stats
    this.searchService.stats$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stats => {
        this.indexStats = stats;
      });

    // Setup debounced search
    this.searchSubject
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(query => {
        this.performSearch(query);
      });

    // Load config
    this.searchConfig = this.searchService.getConfig();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Show the global search modal
   */
  show(): void {
    this.isVisible = true;
    this.searchQuery = '';
    this.results = [];
    this.selectedIndex = 0;
    this.activeFilters = new Set(['all']);

    // Focus input after render
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 100);
  }

  /**
   * Hide the global search modal
   */
  hide(): void {
    this.isVisible = false;
    this.searchQuery = '';
    this.results = [];
    this.showSettingsModal = false;
  }

  /**
   * Handle search query change
   */
  onSearchChange(): void {
    if (!this.searchQuery || this.searchQuery.trim() === '') {
      this.results = [];
      this.isSearching = false;
      return;
    }

    this.isSearching = true;
    this.searchSubject.next(this.searchQuery);
  }

  /**
   * Perform the search
   */
  private performSearch(query: string): void {
    try {
      const config = this.getActiveSearchConfig();
      const rawResults = this.searchService.search(query, config);

      // Apply active filters
      this.results = this.applyFilters(rawResults);
      this.selectedIndex = 0;
    } catch (error) {
      console.error('Search error:', error);
      this.results = [];
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * Get search config based on active filters
   */
  private getActiveSearchConfig(): Partial<SearchConfig> {
    const config: Partial<SearchConfig> = { ...this.searchConfig };

    // File type filters
    if (this.activeFilters.has('files') && !this.activeFilters.has('folders')) {
      config.fileTypes = [FileType.FILE];
    } else if (this.activeFilters.has('folders') && !this.activeFilters.has('files')) {
      config.fileTypes = [FileType.DIRECTORY];
    } else {
      config.fileTypes = [FileType.FILE, FileType.DIRECTORY];
    }

    return config;
  }

  /**
   * Apply additional filters to results
   */
  private applyFilters(results: SearchResultItem[]): SearchResultItem[] {
    let filtered = results;

    // Recent filter (last 7 days)
    if (this.activeFilters.has('recent')) {
      const weekAgo = Date.now() / 1000 - (7 * 24 * 60 * 60);
      filtered = filtered.filter(r => r.file.modified >= weekAgo);
    }

    return filtered;
  }

  /**
   * Toggle a filter
   */
  toggleFilter(filter: string): void {
    if (filter === 'all') {
      this.activeFilters.clear();
      this.activeFilters.add('all');
    } else {
      this.activeFilters.delete('all');
      
      if (this.activeFilters.has(filter)) {
        this.activeFilters.delete(filter);
      } else {
        this.activeFilters.add(filter);
      }

      // If no filters, default to 'all'
      if (this.activeFilters.size === 0) {
        this.activeFilters.add('all');
      }
    }

    // Re-search with new filters
    if (this.searchQuery) {
      this.performSearch(this.searchQuery);
    }
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchQuery = '';
    this.results = [];
    this.selectedIndex = 0;
    this.searchInput?.nativeElement.focus();
  }

  /**
   * Select a result
   */
  selectResult(result: SearchResultItem): void {
    // Emit selection event (to be handled by parent component)
    // For now, just log
    console.log('Selected:', result.file.path);
    this.hide();
    
    // TODO: Navigate to the selected file/folder
    // This should be handled by a callback passed from parent
  }

  /**
   * Get file icon
   */
  getFileIcon(file: any): string {
    if (file.type === FileType.DIRECTORY) {
      return '📁';
    } else if (file.type === FileType.SYMLINK) {
      return '🔗';
    }
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'txt':
      case 'md':
        return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return '🖼️';
      case 'pdf':
        return '📕';
      case 'zip':
      case 'tar':
      case 'gz':
        return '📦';
      case 'mp3':
      case 'wav':
        return '🎵';
      case 'mp4':
      case 'avi':
        return '🎬';
      case 'js':
      case 'ts':
      case 'py':
      case 'java':
        return '📝';
      default:
        return '📄';
    }
  }

  /**
   * Refresh the search index
   */
  async refreshIndex(): Promise<void> {
    this.isSearching = true;
    try {
      await this.searchService.refreshIndex();
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * Show settings modal
   */
  showSettings(): void {
    this.showSettingsModal = true;
  }

  /**
   * Hide settings modal
   */
  hideSettings(): void {
    this.showSettingsModal = false;
  }

  /**
   * Update search configuration
   */
  updateSearchConfig(): void {
    this.searchService.updateConfig(this.searchConfig);
    
    // Re-search if there's an active query
    if (this.searchQuery) {
      this.performSearch(this.searchQuery);
    }
  }

  /**
   * Reset settings to defaults
   */
  resetSettings(): void {
    this.searchConfig = {
      maxResults: 50,
      fuzzyThreshold: 0.7,
      enableTypoTolerance: true,
      searchHidden: false,
      fileTypes: [FileType.FILE, FileType.DIRECTORY],
    };
    this.updateSearchConfig();
  }

  /**
   * Handle keyboard navigation
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    if (!this.isVisible) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        if (this.showSettingsModal) {
          this.hideSettings();
        } else {
          this.hide();
        }
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (this.results.length > 0) {
          this.selectedIndex = Math.min(this.selectedIndex + 1, this.results.length - 1);
          this.scrollToSelected();
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (this.results.length > 0) {
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
          this.scrollToSelected();
        }
        break;

      case 'Enter':
        event.preventDefault();
        if (this.results.length > 0 && this.selectedIndex < this.results.length) {
          this.selectResult(this.results[this.selectedIndex]);
        }
        break;
    }
  }

  /**
   * Scroll to selected result
   */
  private scrollToSelected(): void {
    setTimeout(() => {
      const selected = document.querySelector('.result-item.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 0);
  }
}
