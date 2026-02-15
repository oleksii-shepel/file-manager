import { Component } from '@angular/core';
import { FileBrowserComponent } from './components/file-browser.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FileBrowserComponent],
  template: '<app-file-browser></app-file-browser>',
  styles: []
})
export class AppComponent {
  title = 'File Manager';
}
