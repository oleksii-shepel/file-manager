# Feature Roadmap

This document converts the requested feature set into an implementable plan.

## Principles

- Build in vertical slices that ship usable value every sprint.
- Keep all major features local-first and offline-friendly where possible.
- Stabilize core file operations and performance before advanced UX layers.

## Phase 1 - Core UX Foundation

Status: in progress

- Tabs
  - Per-pane tabs
  - Open/close/switch tabs
  - Persist tabs between sessions
  - Keyboard shortcuts for create/close/switch
- Workspaces
  - Multiple workspace profiles
  - Per-workspace tabs and hidden-files preference
  - Persist and switch workspaces quickly
- Address Bar (MVP)
  - Editable path input per pane
  - Enter-to-navigate
- Item Filter (MVP)
  - Fast in-pane text filtering by name/path
  - Glob patterns and property filters (`type:`, `ext:`, `size`, `modified`)

## Phase 2 - Search and Navigation Engine

- Status: started (global search MVP in progress)

- Smart Global Search
  - Build incremental local index (implemented MVP: in-memory global index cache with TTL refresh)
  - Background refresh worker (implemented: stale cache serves while async rebuild runs)
  - Background crawler with filesystem watchers
  - Relevance scoring with typo tolerance and token normalization
  - Query correction (case, token order, missing extension/symbols)
- Address Bar (Advanced)
  - Live autocomplete with suggestions (implemented: local + async server suggestions)
  - Path history and fuzzy matching (implemented: persisted history prefix matching)
- Shortcuts (Local)
  - Keyboard-first navigation for tabs, panes, actions

## Phase 3 - Preview, Info, Protection

- Info Panel
  - Metadata, dimensions, media duration, checksums (implemented MVP: selected item metadata panel)
  - Media preview pipeline (image/audio/video) (implemented MVP via Quick View modal data previews)
- Quick View
  - Space to preview selected item inline (implemented MVP: modal preview, Space shortcut)
- File Protection
  - Local policy layer for protected paths/items (implemented: server-enforced protected path set)
  - Block move/rename/delete with explicit override flow (implemented baseline block for create/write/move/delete/copy-into)

## Phase 4 - Sharing and Transfer

- Advanced Wireless File Sharing
  - Local HTTP share session with signed links
  - Browser access without native app install
  - Optional stream mode and expiration policies
- Smart Drag and Drop
  - Local copy/move semantics with conflict resolver
  - URL/file drop intake
- Advanced File Downloader
  - Job queue, resumable transfers, progress tracking
  - Provider adapters for direct links and stream sources

## Phase 5 - Productivity Layers

- Notes
  - Structured notes store (implemented MVP: local notes CRUD with tags/pin/protect)
  - Link notes to files/directories
- Dashboard
  - Timeline, recent activity, pinned/protected/tagged views (implemented MVP)
- Archiver
  - Read/write common archive formats
- Workspace Actions
  - Run scripts, open URLs, launch external programs (implemented MVP: per-workspace actions for URL, path navigation, global search)

## Phase 6 - Platform and Ecosystem

- Auto Updates
  - Signed update channel, staged rollout, rollback support
- Localization
  - i18n framework with community-editable packs
- Community Participation
  - Public RFC workflow, feature voting, contribution templates
- Design System
  - Infusive design tokens, theming, transparency effects

## Architecture Notes

- Search index should be a standalone local service in Rust with typed API exposed to Angular.
- Download/share subsystems should use a unified transfer engine and queue model.
- File protection should be enforced server-side, not only in UI.

## Near-Term Execution (next 3 slices)

1. Complete tabs/workspaces UX polish and keyboard shortcuts.
2. Implement global search indexer + query API with typo tolerance baseline.
3. Add advanced filter syntax (glob + property prefixes) and wire it into both panes.
