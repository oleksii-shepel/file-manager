import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private theme$ = new BehaviorSubject<Theme>(this.readInitialTheme());
  private compact$ = new BehaviorSubject<boolean>(this.readInitialCompact());

  constructor() {
    this.applyTheme(this.theme$.value);
    this.applyCompact(this.compact$.value);
  }

  setTheme(theme: Theme) {
    this.theme$.next(theme);
    this.applyTheme(theme);
    try { localStorage.setItem('app-theme', theme); } catch {}
  }

  toggleTheme() {
    this.setTheme(this.theme$.value === 'dark' ? 'light' : 'dark');
  }

  getTheme$() {
    return this.theme$.asObservable();
  }

  setCompact(compact: boolean) {
    this.compact$.next(compact);
    this.applyCompact(compact);
    try { localStorage.setItem('app-compact', compact ? '1' : '0'); } catch {}
  }

  toggleCompact() {
    this.setCompact(!this.compact$.value);
  }

  getCompact$() {
    return this.compact$.asObservable();
  }

  private applyTheme(theme: Theme) {
    const root = document.documentElement;
    root.classList.toggle('vscode-light', theme === 'light');
    root.classList.toggle('vscode-dark', theme === 'dark');
  }

  private applyCompact(compact: boolean) {
    const root = document.documentElement;
    root.classList.toggle('compact-mode', compact);
  }

  private readInitialTheme(): Theme {
    try {
      const stored = localStorage.getItem('app-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch {}
    // Detect prefers-color-scheme
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  }

  private readInitialCompact(): boolean {
    try {
      return localStorage.getItem('app-compact') === '1';
    } catch {}
    return false;
  }
}
