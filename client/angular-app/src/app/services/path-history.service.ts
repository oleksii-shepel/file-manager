import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ApiService } from './api.service';

/**
 * Path history entry
 */
export interface PathHistoryEntry {
  path: string;
  timestamp: number;
  accessCount: number;
  paneId: string;
}

/**
 * Path suggestion with metadata
 */
export interface PathSuggestion {
  path: string;
  displayName: string;
  matchType: 'history' | 'directory' | 'fuzzy';
  score: number;
  exists: boolean;
}

/**
 * Path history service for advanced address bar
 * Phase 2 Feature: Advanced Address Bar
 */
@Injectable({
  providedIn: 'root'
})
export class PathHistoryService {
  private readonly STORAGE_KEY = 'filemanager:path-history';
  private readonly MAX_HISTORY_ENTRIES = 100;

  private history = new Map<string, PathHistoryEntry>();
  private historySubject = new BehaviorSubject<PathHistoryEntry[]>([]);

  constructor(private apiService: ApiService) {
    this.loadHistory();
  }

  /**
   * Observable for history changes
   */
  get history$(): Observable<PathHistoryEntry[]> {
    return this.historySubject.asObservable();
  }

  /**
   * Add path to history
   */
  addPath(path: string, paneId: string): void {
    const existing = this.history.get(path);

    if (existing) {
      existing.timestamp = Date.now();
      existing.accessCount++;
    } else {
      this.history.set(path, {
        path,
        timestamp: Date.now(),
        accessCount: 1,
        paneId,
      });
    }

    this.pruneHistory();
    this.saveHistory();
    this.emitHistory();
  }

  /**
   * Get path suggestions based on query
   */
  async getSuggestions(query: string, currentPath: string): Promise<PathSuggestion[]> {
    if (!query || query.trim() === '') {
      return this.getRecentPaths(10);
    }

    const suggestions: PathSuggestion[] = [];
    const lowerQuery = query.toLowerCase();

    // 1. History-based suggestions
    const historyMatches = this.getHistoryMatches(query);
    suggestions.push(...historyMatches);

    // 2. Directory-based suggestions (autocomplete current directory)
    if (query.startsWith('/') || query.startsWith('.')) {
      const dirSuggestions = await this.getDirectorySuggestions(query);
      suggestions.push(...dirSuggestions);
    }

    // 3. Fuzzy path matching from history
    const fuzzyMatches = this.getFuzzyMatches(query);
    suggestions.push(...fuzzyMatches);

    // Sort by score and remove duplicates
    const uniquePaths = new Set<string>();
    const uniqueSuggestions = suggestions.filter(s => {
      if (uniquePaths.has(s.path)) {
        return false;
      }
      uniquePaths.add(s.path);
      return true;
    });

    uniqueSuggestions.sort((a, b) => b.score - a.score);

    return uniqueSuggestions.slice(0, 10);
  }

  /**
   * Get history matches for query
   */
  private getHistoryMatches(query: string): PathSuggestion[] {
    const lowerQuery = query.toLowerCase();
    const matches: PathSuggestion[] = [];

    for (const entry of this.history.values()) {
      const lowerPath = entry.path.toLowerCase();
      
      // Prefix match
      if (lowerPath.startsWith(lowerQuery)) {
        matches.push({
          path: entry.path,
          displayName: this.getDisplayName(entry.path),
          matchType: 'history',
          score: 100 + (entry.accessCount * 5),
          exists: true, // Assume exists since in history
        });
      }
      // Contains match
      else if (lowerPath.includes(lowerQuery)) {
        matches.push({
          path: entry.path,
          displayName: this.getDisplayName(entry.path),
          matchType: 'history',
          score: 80 + (entry.accessCount * 3),
          exists: true,
        });
      }
    }

    return matches;
  }

  /**
   * Get directory-based suggestions
   */
  private async getDirectorySuggestions(query: string): Promise<PathSuggestion[]> {
    try {
      // Extract the directory part
      const lastSlash = query.lastIndexOf('/');
      const dirPath = query.substring(0, lastSlash + 1) || '/';
      const prefix = query.substring(lastSlash + 1);

      // List directory
      const listing = await this.apiService.listDirectory(dirPath, false);
      
      const suggestions: PathSuggestion[] = [];
      
      for (const entry of listing.entries) {
        if (entry.name.toLowerCase().startsWith(prefix.toLowerCase())) {
          const fullPath = `${dirPath}${entry.name}`.replace('//', '/');
          suggestions.push({
            path: fullPath,
            displayName: entry.name,
            matchType: 'directory',
            score: 90,
            exists: true,
          });
        }
      }

      return suggestions;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get fuzzy matches from history
   */
  private getFuzzyMatches(query: string): PathSuggestion[] {
    const matches: PathSuggestion[] = [];
    const queryTokens = query.toLowerCase().split(/[\s\-_\/]/);

    for (const entry of this.history.values()) {
      const pathTokens = entry.path.toLowerCase().split('/');
      let matchCount = 0;

      for (const queryToken of queryTokens) {
        for (const pathToken of pathTokens) {
          if (pathToken.includes(queryToken)) {
            matchCount++;
            break;
          }
        }
      }

      if (matchCount > 0) {
        const score = (matchCount / queryTokens.length) * 50;
        matches.push({
          path: entry.path,
          displayName: this.getDisplayName(entry.path),
          matchType: 'fuzzy',
          score: score + (entry.accessCount * 2),
          exists: true,
        });
      }
    }

    return matches.filter(m => m.score > 20);
  }

  /**
   * Get recent paths
   */
  private getRecentPaths(limit: number): PathSuggestion[] {
    const entries = Array.from(this.history.values());
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return entries.slice(0, limit).map(entry => ({
      path: entry.path,
      displayName: this.getDisplayName(entry.path),
      matchType: 'history' as const,
      score: 50 + (entry.accessCount * 5),
      exists: true,
    }));
  }

  /**
   * Get display name for path
   */
  private getDisplayName(path: string): string {
    if (path === '/' || path === '') {
      return 'Root';
    }
    
    const parts = path.split('/').filter(p => p.length > 0);
    return parts.length > 0 ? parts[parts.length - 1] : 'Root';
  }

  /**
   * Prune history to max entries
   */
  private pruneHistory(): void {
    if (this.history.size <= this.MAX_HISTORY_ENTRIES) {
      return;
    }

    // Sort by timestamp (oldest first)
    const entries = Array.from(this.history.values());
    entries.sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest entries
    const toRemove = entries.slice(0, this.history.size - this.MAX_HISTORY_ENTRIES);
    for (const entry of toRemove) {
      this.history.delete(entry.path);
    }
  }

  /**
   * Load history from localStorage
   */
  private loadHistory(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const entries: PathHistoryEntry[] = JSON.parse(stored);
        for (const entry of entries) {
          this.history.set(entry.path, entry);
        }
        this.emitHistory();
      }
    } catch (error) {
      console.error('Failed to load path history:', error);
    }
  }

  /**
   * Save history to localStorage
   */
  private saveHistory(): void {
    try {
      const entries = Array.from(this.history.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.error('Failed to save path history:', error);
    }
  }

  /**
   * Emit history update
   */
  private emitHistory(): void {
    const entries = Array.from(this.history.values());
    entries.sort((a, b) => b.timestamp - a.timestamp);
    this.historySubject.next(entries);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.history.clear();
    this.saveHistory();
    this.emitHistory();
  }

  /**
   * Get all history entries
   */
  getAllHistory(): PathHistoryEntry[] {
    return Array.from(this.history.values());
  }

  /**
   * Remove specific path from history
   */
  removePath(path: string): void {
    this.history.delete(path);
    this.saveHistory();
    this.emitHistory();
  }
}
