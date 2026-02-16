import { Component } from '@angular/core';
import { FileBrowserComponent } from './components/file-browser.component';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FileBrowserComponent],
  template: `
    <app-file-browser></app-file-browser>
  `,
  styles: [`
    .app-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.5rem 1rem;
      background: var(--vsc-panel-background);
      border-bottom: 1px solid var(--vsc-border);
    }

    .tool-btn {
      margin-left: 0.5rem;
      padding: 0.25rem 0.5rem;
      background: transparent;
      color: var(--vsc-text);
      border: 1px solid var(--vsc-border);
      border-radius: 4px;
      cursor: pointer;
      font-size: var(--vsc-font-size);
    }
  `]
})
export class AppComponent {
  title = 'File Manager';
  constructor(public theme: ThemeService) {}
}
