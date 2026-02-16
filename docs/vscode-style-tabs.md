# VS Code Style Tabs - Implementation Guide

Replace the Tab Bar section in `client/angular-app/src/app/components/file-browser.component.scss` with this:

```scss
// ==================================================
// Tab Bar (VS Code Style)
// ==================================================

.tab-bar {
  display: flex;
  background: var(--vsc-editor-background);
  border-bottom: 1px solid var(--vsc-border);
  min-height: 35px;
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  z-index: 10;

  &::-webkit-scrollbar {
    height: 3px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--vsc-scrollbar-thumb);
    border-radius: 2px;

    &:hover {
      background: var(--vsc-scrollbar-thumb-hover);
    }
  }
}

.tabs {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  align-items: stretch;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: var(--vsc-padding-sm);
  padding: 0 var(--vsc-padding-lg);
  background: transparent;
  border-right: 1px solid transparent;
  cursor: pointer;
  transition: all var(--vsc-transition-fast);
  min-width: 120px;
  max-width: 200px;
  height: 35px;
  position: relative;
  color: var(--vsc-foreground-dim);

  // VS Code style: subtle border on right
  &::after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--vsc-border-subtle);
    opacity: 0.5;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.03);
    color: var(--vsc-foreground);

    .tab-title {
      color: var(--vsc-foreground);
    }
  }

  &.active {
    background: var(--vsc-editor-background);
    color: var(--vsc-foreground-bright);
    
    // Active tab top border (VS Code style)
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--vsc-accent-blue);
      z-index: 1;
    }

    &::after {
      opacity: 0;
    }

    .tab-title {
      color: var(--vsc-foreground-bright);
      font-weight: 400;
    }

    .tab-icon {
      opacity: 1;
    }
  }

  &.pinned {
    min-width: 40px;
    max-width: 40px;
    padding: 0 var(--vsc-padding-sm);
    
    // Pin indicator dot (VS Code style)
    .tab-icon::after {
      content: '';
      position: absolute;
      bottom: 2px;
      left: 50%;
      transform: translateX(-50%);
      width: 4px;
      height: 4px;
      background: var(--vsc-accent-blue);
      border-radius: 50%;
    }

    .tab-title {
      display: none;
    }

    .tab-close {
      display: none !important;
    }
  }

  &.pinned.active {
    .tab-icon::after {
      background: var(--vsc-foreground-bright);
    }
  }

  .tab-icon {
    font-size: 16px;
    flex-shrink: 0;
    line-height: 1;
    opacity: 0.7;
    position: relative;
    transition: opacity var(--vsc-transition-fast);
  }

  .tab-title {
    flex: 1;
    font-size: var(--vsc-font-size);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1;
    color: inherit;
    transition: color var(--vsc-transition-fast);
  }

  .tab-pin,
  .tab-close {
    display: none;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    color: var(--vsc-foreground-dim);
    cursor: pointer;
    font-size: 16px;
    opacity: 0;
    transition: all var(--vsc-transition-fast);
    border-radius: var(--vsc-border-radius-sm);
    line-height: 1;
    align-items: center;
    justify-content: center;
    position: relative;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--vsc-foreground);
    }

    &:active {
      background: rgba(255, 255, 255, 0.15);
    }
  }

  .tab-close {
    &::before {
      content: '✕';
      font-size: 14px;
      line-height: 1;
    }
  }

  .tab-pin {
    &::before {
      content: '📌';
      font-size: 11px;
      line-height: 1;
      filter: grayscale(1);
      opacity: 0.7;
    }
  }

  &:hover .tab-pin,
  &:hover .tab-close {
    display: inline-flex;
    opacity: 0.7;
  }

  &:hover .tab-close:hover,
  &:hover .tab-pin:hover {
    opacity: 1;
  }

  // Pinned tabs always show pin icon
  &.pinned .tab-pin {
    display: inline-flex;
    opacity: 0.5;

    &::before {
      filter: grayscale(0);
      opacity: 1;
    }
  }

  &.pinned:hover .tab-pin {
    opacity: 1;
  }
}

.tab-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 35px;
  min-width: 35px;
  max-width: 35px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--vsc-foreground-dim);
  cursor: pointer;
  font-size: 16px;
  transition: all var(--vsc-transition-fast);
  opacity: 0.5;
  height: 35px;

  &::before {
    content: '+';
    font-size: 18px;
    line-height: 1;
    font-weight: 300;
  }

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.05);
    color: var(--vsc-foreground);
  }

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }
}
```

## Key Features

### 1. **Transparent Background with Hover**
- Inactive tabs have transparent background
- Subtle hover effect: `rgba(255, 255, 255, 0.03)`
- Matches VS Code's minimalist approach

### 2. **Top Border Indicator**
- Active tab shows 2px blue border at top
- Uses `::before` pseudo-element
- Clean, modern look

### 3. **Pinned Tab Behavior**
- Collapses to 40px width showing only icon
- Blue dot indicator below icon
- Hides title and close button

### 4. **Smart Close Button**
- Only shows on hover
- Smooth fade-in animation
- Rounded hover background

### 5. **Subtle Separators**
- Right border with low opacity
- Disappears on active tab
- Cleaner visual separation

### 6. **Color Transitions**
- Inactive tabs: dimmed text color
- Hover: brighter text
- Active: brightest text
- Smooth transitions throughout

### 7. **Improved Scrollbar**
- 3px height for horizontal scroll
- Transparent track
- Visible thumb only when needed

## Compact Mode Support

Add to the `.compact-mode` section:

```scss
.compact-mode {
  .tab-bar {
    min-height: 30px;
  }

  .tab {
    height: 30px;
    min-width: 100px;
    max-width: 160px;

    &.pinned {
      min-width: 36px;
      max-width: 36px;
    }
  }

  .tab-new {
    height: 30px;
    width: 30px;
  }
}
```

## Visual Differences from Current

| Feature | Current | New (VS Code Style) |
|---------|---------|---------------------|
| Background | Sidebar color | Transparent |
| Active indicator | Bottom border | Top border (2px blue) |
| Hover | Background change | Subtle transparent overlay |
| Pinned | Left border | Icon only + dot indicator |
| Separators | Solid right border | Subtle transparent border |
| Close button | Shows on hover | Shows on hover with fade |
| Scrollbar | Hidden | Thin (3px) visible |

The new style is cleaner, more modern, and matches VS Code exactly!
