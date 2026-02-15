import { Injectable } from '@angular/core';
import { FileInfo, FileType } from '@shared/protocol';
import { FilterQuery, FilterCriteria, FilterType } from '@shared/protocol-enhanced';

@Injectable({
  providedIn: 'root'
})
export class FilterService {

  /**
   * Filter file entries based on query
   */
  filterEntries(entries: FileInfo[], query: FilterQuery): FileInfo[] {
    if (!query.text && (!query.criteria || query.criteria.length === 0)) {
      return entries;
    }

    return entries.filter(entry => {
      // Apply text filter if present
      if (query.text) {
        if (!this.matchesTextFilter(entry, query.text, query.caseSensitive)) {
          return false;
        }
      }

      // Apply criteria filters
      if (query.criteria && query.criteria.length > 0) {
        for (const criterion of query.criteria) {
          if (!this.matchesCriterion(entry, criterion, query.caseSensitive)) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Parse filter text into structured query
   * Supports:
   * - Plain text: "document"
   * - Extension filter: "ext:pdf"
   * - Type filter: "type:file" or "type:dir"
   * - Size filter: "size>1mb" or "size<100kb"
   * - Modified filter: "modified:today" or "modified>2024-01-01"
   * - Glob pattern: "*.pdf" or "doc*"
   */
  parseFilterText(text: string): FilterQuery {
    const query: FilterQuery = {
      text: '',
      criteria: [],
      caseSensitive: false,
    };

    if (!text || text.trim() === '') {
      return query;
    }

    const tokens = text.trim().split(/\s+/);
    const plainTextTokens: string[] = [];

    for (const token of tokens) {
      if (token.includes(':')) {
        const [prefix, value] = token.split(':', 2);
        const criterion = this.parseFilterToken(prefix, value);
        if (criterion) {
          query.criteria!.push(criterion);
          continue;
        }
      }

      // Check for size comparisons
      const sizeMatch = token.match(/^size([><=]+)(.+)$/i);
      if (sizeMatch) {
        const [, operator, value] = sizeMatch;
        const criterion = this.parseSizeFilter(operator, value);
        if (criterion) {
          query.criteria!.push(criterion);
          continue;
        }
      }

      // Check for date comparisons
      const dateMatch = token.match(/^modified([><=]+)(.+)$/i);
      if (dateMatch) {
        const [, operator, value] = dateMatch;
        const criterion = this.parseDateFilter(operator, value);
        if (criterion) {
          query.criteria!.push(criterion);
          continue;
        }
      }

      // Check for glob pattern
      if (token.includes('*') || token.includes('?')) {
        query.criteria!.push({
          type: FilterType.GLOB,
          value: token,
          operator: 'contains',
        });
        continue;
      }

      // Plain text token
      plainTextTokens.push(token);
    }

    // Combine plain text tokens
    if (plainTextTokens.length > 0) {
      query.text = plainTextTokens.join(' ');
    }

    return query;
  }

  /**
   * Parse a filter token (prefix:value format)
   */
  private parseFilterToken(prefix: string, value: string): FilterCriteria | null {
    switch (prefix.toLowerCase()) {
      case 'ext':
      case 'extension':
        return {
          type: FilterType.EXTENSION,
          value: value.startsWith('.') ? value : `.${value}`,
          operator: 'equals',
        };

      case 'type':
        const fileType = this.parseFileType(value);
        if (fileType) {
          return {
            type: FilterType.TYPE,
            value: fileType,
            operator: 'equals',
          };
        }
        break;

      case 'name':
        return {
          type: FilterType.NAME,
          value,
          operator: 'contains',
        };

      case 'modified':
        return this.parseDateFilter('=', value);
    }

    return null;
  }

  /**
   * Parse file type from string
   */
  private parseFileType(value: string): string | null {
    const lower = value.toLowerCase();
    if (lower === 'file' || lower === 'f') return FileType.FILE;
    if (lower === 'directory' || lower === 'dir' || lower === 'd' || lower === 'folder') return FileType.DIRECTORY;
    if (lower === 'symlink' || lower === 'link' || lower === 'l') return FileType.SYMLINK;
    return null;
  }

  /**
   * Parse size filter
   */
  private parseSizeFilter(operator: string, value: string): FilterCriteria | null {
    const sizeBytes = this.parseSizeValue(value);
    if (sizeBytes === null) return null;

    return {
      type: FilterType.SIZE,
      value: sizeBytes.toString(),
      operator: this.normalizeOperator(operator),
    };
  }

  /**
   * Parse date filter
   */
  private parseDateFilter(operator: string, value: string): FilterCriteria | null {
    const timestamp = this.parseDateValue(value);
    if (timestamp === null) return null;

    return {
      type: FilterType.MODIFIED,
      value: timestamp.toString(),
      operator: this.normalizeOperator(operator),
    };
  }

  /**
   * Parse size value (supports kb, mb, gb)
   */
  private parseSizeValue(value: string): number | null {
    const match = value.match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i);
    if (!match) return null;

    const [, num, unit] = match;
    const numValue = parseFloat(num);

    switch ((unit || 'b').toLowerCase()) {
      case 'b': return numValue;
      case 'kb': return numValue * 1024;
      case 'mb': return numValue * 1024 * 1024;
      case 'gb': return numValue * 1024 * 1024 * 1024;
      default: return numValue;
    }
  }

  /**
   * Parse date value
   */
  private parseDateValue(value: string): number | null {
    const lower = value.toLowerCase();

    // Special keywords
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    if (lower === 'today') {
      return now - day;
    }
    if (lower === 'yesterday') {
      return now - (2 * day);
    }
    if (lower === 'week') {
      return now - (7 * day);
    }
    if (lower === 'month') {
      return now - (30 * day);
    }

    // Try parsing as ISO date
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }

    return null;
  }

  /**
   * Normalize comparison operator
   */
  private normalizeOperator(operator: string): FilterCriteria['operator'] {
    switch (operator) {
      case '>': return 'gt';
      case '<': return 'lt';
      case '>=': return 'gte';
      case '<=': return 'lte';
      case '=':
      case '==': return 'equals';
      default: return 'equals';
    }
  }

  /**
   * Check if entry matches text filter
   */
  private matchesTextFilter(entry: FileInfo, text: string, caseSensitive?: boolean): boolean {
    const searchText = caseSensitive ? text : text.toLowerCase();
    const entryName = caseSensitive ? entry.name : entry.name.toLowerCase();
    return entryName.includes(searchText);
  }

  /**
   * Check if entry matches a criterion
   */
  private matchesCriterion(entry: FileInfo, criterion: FilterCriteria, caseSensitive?: boolean): boolean {
    switch (criterion.type) {
      case FilterType.NAME:
        return this.matchesNameCriterion(entry, criterion, caseSensitive);
      
      case FilterType.EXTENSION:
        return this.matchesExtensionCriterion(entry, criterion);
      
      case FilterType.TYPE:
        return entry.type === criterion.value;
      
      case FilterType.SIZE:
        return this.matchesSizeCriterion(entry, criterion);
      
      case FilterType.MODIFIED:
        return this.matchesModifiedCriterion(entry, criterion);
      
      case FilterType.GLOB:
        return this.matchesGlobPattern(entry.name, criterion.value);
      
      default:
        return true;
    }
  }

  /**
   * Match name criterion
   */
  private matchesNameCriterion(entry: FileInfo, criterion: FilterCriteria, caseSensitive?: boolean): boolean {
    const name = caseSensitive ? entry.name : entry.name.toLowerCase();
    const value = caseSensitive ? criterion.value : criterion.value.toLowerCase();

    switch (criterion.operator) {
      case 'equals': return name === value;
      case 'contains': return name.includes(value);
      case 'startsWith': return name.startsWith(value);
      case 'endsWith': return name.endsWith(value);
      default: return name.includes(value);
    }
  }

  /**
   * Match extension criterion
   */
  private matchesExtensionCriterion(entry: FileInfo, criterion: FilterCriteria): boolean {
    if (entry.type !== FileType.FILE) return false;
    
    const ext = this.getFileExtension(entry.name);
    return ext === criterion.value;
  }

  /**
   * Match size criterion
   */
  private matchesSizeCriterion(entry: FileInfo, criterion: FilterCriteria): boolean {
    const targetSize = parseInt(criterion.value, 10);
    const entrySize = entry.size;

    switch (criterion.operator) {
      case 'equals': return entrySize === targetSize;
      case 'gt': return entrySize > targetSize;
      case 'lt': return entrySize < targetSize;
      case 'gte': return entrySize >= targetSize;
      case 'lte': return entrySize <= targetSize;
      default: return entrySize === targetSize;
    }
  }

  /**
   * Match modified date criterion
   */
  private matchesModifiedCriterion(entry: FileInfo, criterion: FilterCriteria): boolean {
    const targetTime = parseInt(criterion.value, 10);
    const entryTime = entry.modified * 1000; // Convert to milliseconds

    switch (criterion.operator) {
      case 'equals': 
        // For date equality, check if same day
        return this.isSameDay(entryTime, targetTime);
      case 'gt': return entryTime > targetTime;
      case 'lt': return entryTime < targetTime;
      case 'gte': return entryTime >= targetTime;
      case 'lte': return entryTime <= targetTime;
      default: return this.isSameDay(entryTime, targetTime);
    }
  }

  /**
   * Match glob pattern
   */
  private matchesGlobPattern(name: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(name);
  }

  /**
   * Get file extension
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === 0) return '';
    return filename.substring(lastDot);
  }

  /**
   * Check if two timestamps are on the same day
   */
  private isSameDay(time1: number, time2: number): boolean {
    const date1 = new Date(time1);
    const date2 = new Date(time2);
    
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }
}
