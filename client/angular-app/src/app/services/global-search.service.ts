import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from './api.service';
import { FileInfo, FileType } from '@shared/protocol';

/**
 * Search result with relevance scoring
 */
export interface SearchResultItem {
  file: FileInfo;
  score: number;
  matchType: 'exact' | 'prefix' | 'fuzzy' | 'content';
  highlightedName: string;
}

/**
 * Search index entry
 */
interface IndexEntry {
  path: string;
  name: string;
  normalizedName: string;
  type: FileType;
  size: number;
  modified: number;
  parentPath: string;
}

/**
 * Index statistics
 */
export interface IndexStats {
  totalFiles: number;
  totalDirectories: number;
  indexedPaths: string[];
  lastIndexTime: number;
  isIndexing: boolean;
}

/**
 * Search configuration
 */
export interface SearchConfig {
  maxResults: number;
  fuzzyThreshold: number;
  enableTypoTolerance: boolean;
  searchHidden: boolean;
  fileTypes: FileType[];
}

/**
 * Global search service with background indexing
 * Phase 2 Feature: Smart Global Search
 */
@Injectable({
  providedIn: 'root'
})
export class GlobalSearchService {
  // Search index (in-memory for MVP, could be moved to IndexedDB)
  private index: Map<string, IndexEntry> = new Map();
  private indexingInProgress$ = new BehaviorSubject<boolean>(false);
  private indexStats$ = new BehaviorSubject<IndexStats>({
    totalFiles: 0,
    totalDirectories: 0,
    indexedPaths: [],
    lastIndexTime: 0,
    isIndexing: false,
  });

  // Search configuration
  private config: SearchConfig = {
    maxResults: 50,
    fuzzyThreshold: 0.7,
    enableTypoTolerance: true,
    searchHidden: false,
    fileTypes: [FileType.FILE, FileType.DIRECTORY],
  };

  // Protected/System folders to skip (OS-specific)
  private protectedPaths: Set<string> = new Set([
    // Windows system folders
    '/PerfLogs',
    '/Recovery',
    '/System Volume Information',
    '/$Recycle.Bin',
    '/Windows/System32',
    '/Windows/WinSxS',
    '/Program Files/WindowsApps',
    // macOS system folders
    '/.Spotlight-V100',
    '/.Trashes',
    '/.fseventsd',
    '/System',
    '/private/var/db',
    // Linux system folders
    '/proc',
    '/sys',
    '/dev',
    '/run',
    '/tmp',
  ]);

  constructor(private apiService: ApiService) {
    // Start background indexing
    this.startBackgroundIndexing();
  }

  /**
   * Observable for indexing status
   */
  get isIndexing$(): Observable<boolean> {
    return this.indexingInProgress$.asObservable();
  }

  /**
   * Observable for index statistics
   */
  get stats$(): Observable<IndexStats> {
    return this.indexStats$.asObservable();
  }

  /**
   * Start background indexing of common paths
   */
  private async startBackgroundIndexing(): Promise<void> {
    // Index common root paths
    const rootPaths = ['/'];
    
    for (const path of rootPaths) {
      await this.indexPath(path, 2); // Depth of 2 for initial index
    }
  }

  /**
   * Index a path recursively
   */
  async indexPath(path: string, maxDepth: number = 3, currentDepth: number = 0): Promise<void> {
    if (currentDepth >= maxDepth) return;
    
    // Skip protected/system folders
    if (this.isProtectedPath(path)) {
      console.log(`Skipping protected path: ${path}`);
      return;
    }
    
    this.indexingInProgress$.next(true);
    const stats = this.indexStats$.value;
    stats.isIndexing = true;
    this.indexStats$.next(stats);

    try {
      const listing = await this.apiService.listDirectory(path, this.config.searchHidden);
      
      for (const entry of listing.entries) {
        // Skip protected folders
        if (this.isProtectedPath(entry.path)) {
          continue;
        }

        // Add to index
        const indexEntry: IndexEntry = {
          path: entry.path,
          name: entry.name,
          normalizedName: this.normalizeString(entry.name),
          type: entry.type,
          size: entry.size,
          modified: entry.modified,
          parentPath: path,
        };
        
        this.index.set(entry.path, indexEntry);
        
        // Update stats
        if (entry.type === FileType.FILE) {
          stats.totalFiles++;
        } else if (entry.type === FileType.DIRECTORY) {
          stats.totalDirectories++;
        }
        
        // Recursively index directories
        if (entry.type === FileType.DIRECTORY) {
          await this.indexPath(entry.path, maxDepth, currentDepth + 1);
        }
      }
      
      if (currentDepth === 0) {
        if (!stats.indexedPaths.includes(path)) {
          stats.indexedPaths.push(path);
        }
        stats.lastIndexTime = Date.now();
      }
      
      this.indexStats$.next(stats);
    } catch (error: any) {
      // Only log non-permission errors
      if (!error.message?.includes('Access is denied') && 
          !error.message?.includes('Permission denied') &&
          !error.message?.includes('EACCES')) {
        console.error('Failed to index path:', path, error);
      }
      // Silently skip permission errors
    } finally {
      if (currentDepth === 0) {
        this.indexingInProgress$.next(false);
        const updatedStats = this.indexStats$.value;
        updatedStats.isIndexing = false;
        this.indexStats$.next(updatedStats);
      }
    }
  }

  /**
   * Check if a path is protected/system folder
   */
  private isProtectedPath(path: string): boolean {
    // Check exact matches
    if (this.protectedPaths.has(path)) {
      return true;
    }

    // Check if path starts with any protected path
    for (const protectedPath of this.protectedPaths) {
      if (path.startsWith(protectedPath + '/') || path.startsWith(protectedPath + '\\')) {
        return true;
      }
    }

    // Check for common protected patterns
    const protectedPatterns = [
      /\/\$[A-Z]/,           // Windows special folders like $Recycle.Bin
      /\/\.[A-Z]/,           // Hidden system folders like .Spotlight-V100
      /System Volume/i,      // System Volume Information
      /WindowsApps/i,        // Windows Store apps
      /WinSxS/i,             // Windows side-by-side
    ];

    return protectedPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Search the index
   */
  search(query: string, config?: Partial<SearchConfig>): SearchResultItem[] {
    if (!query || query.trim() === '') {
      return [];
    }

    const searchConfig = { ...this.config, ...config };
    const normalizedQuery = this.normalizeString(query);
    const results: SearchResultItem[] = [];

    for (const entry of this.index.values()) {
      // Filter by type
      if (!searchConfig.fileTypes.includes(entry.type)) {
        continue;
      }

      // Calculate relevance score
      const score = this.calculateRelevance(
        query,
        normalizedQuery,
        entry,
        searchConfig
      );

      if (score > 0) {
        results.push({
          file: this.indexEntryToFileInfo(entry),
          score,
          matchType: this.getMatchType(normalizedQuery, entry.normalizedName, score),
          highlightedName: this.highlightMatch(entry.name, query),
        });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Limit results
    return results.slice(0, searchConfig.maxResults);
  }

  /**
   * Calculate relevance score for a search result
   */
  private calculateRelevance(
    query: string,
    normalizedQuery: string,
    entry: IndexEntry,
    config: SearchConfig
  ): number {
    let score = 0;

    // Exact match
    if (entry.normalizedName === normalizedQuery) {
      score = 100;
    }
    // Exact case-sensitive match (bonus)
    else if (entry.name === query) {
      score = 95;
    }
    // Prefix match
    else if (entry.normalizedName.startsWith(normalizedQuery)) {
      score = 80;
    }
    // Contains match
    else if (entry.normalizedName.includes(normalizedQuery)) {
      score = 60;
    }
    // Fuzzy match
    else if (config.enableTypoTolerance) {
      const fuzzyScore = this.fuzzyMatch(normalizedQuery, entry.normalizedName);
      if (fuzzyScore >= config.fuzzyThreshold) {
        score = fuzzyScore * 50; // Scale to 0-50 range
      }
    }

    // Bonus for file name vs full path
    if (score > 0 && entry.name.toLowerCase().includes(query.toLowerCase())) {
      score += 10;
    }

    // Bonus for recent files
    const daysSinceModified = (Date.now() - entry.modified * 1000) / (1000 * 60 * 60 * 24);
    if (daysSinceModified < 7) {
      score += 5;
    }

    // Penalty for deep paths
    const pathDepth = entry.path.split('/').length;
    score -= Math.min(pathDepth * 0.5, 10);

    return Math.max(0, score);
  }

  /**
   * Fuzzy string matching (Levenshtein-based)
   */
  private fuzzyMatch(query: string, target: string): number {
    const distance = this.levenshteinDistance(query, target);
    const maxLength = Math.max(query.length, target.length);
    return 1 - (distance / maxLength);
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Determine match type based on score and pattern
   */
  private getMatchType(
    normalizedQuery: string,
    normalizedName: string,
    score: number
  ): 'exact' | 'prefix' | 'fuzzy' | 'content' {
    if (score >= 95) return 'exact';
    if (normalizedName.startsWith(normalizedQuery)) return 'prefix';
    if (score < 60) return 'fuzzy';
    return 'content';
  }

  /**
   * Highlight matching parts of the name
   */
  private highlightMatch(name: string, query: string): string {
    const lowerName = name.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerName.indexOf(lowerQuery);

    if (index === -1) {
      return name;
    }

    return name.substring(0, index) +
           '<mark>' + name.substring(index, index + query.length) + '</mark>' +
           name.substring(index + query.length);
  }

  /**
   * Normalize string for comparison
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, ''); // Remove special characters
  }

  /**
   * Convert index entry to FileInfo
   */
  private indexEntryToFileInfo(entry: IndexEntry): FileInfo {
    return {
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      created: entry.modified, // We don't store created separately
      modified: entry.modified,
      accessed: entry.modified,
      permissions: '', // Not stored in index
      isHidden: entry.name.startsWith('.'),
    };
  }

  /**
   * Clear the index
   */
  clearIndex(): void {
    this.index.clear();
    const stats = this.indexStats$.value;
    stats.totalFiles = 0;
    stats.totalDirectories = 0;
    stats.indexedPaths = [];
    stats.lastIndexTime = 0;
    this.indexStats$.next(stats);
  }

  /**
   * Refresh the index
   */
  async refreshIndex(): Promise<void> {
    const stats = this.indexStats$.value;
    const paths = [...stats.indexedPaths];
    
    this.clearIndex();
    
    for (const path of paths) {
      await this.indexPath(path, 3);
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SearchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SearchConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Add a path to the protected paths list
   */
  addProtectedPath(path: string): void {
    this.protectedPaths.add(path);
  }

  /**
   * Remove a path from the protected paths list
   */
  removeProtectedPath(path: string): void {
    this.protectedPaths.delete(path);
  }

  /**
   * Get all protected paths
   */
  getProtectedPaths(): string[] {
    return Array.from(this.protectedPaths);
  }

  /**
   * Clear all protected paths (use with caution)
   */
  clearProtectedPaths(): void {
    this.protectedPaths.clear();
  }
}