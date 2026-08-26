# Multi-File Viewing Feature Specification

## Overview

Extend lmv from a single-file markdown viewer to support viewing multiple files with a collapsible file list sidebar.

---

## CLI Input

### Supported Input Methods
- **Directory path**: `lmv ./docs/` - discover all .md files within
- **Multiple file arguments**: `lmv file1.md file2.md file3.md`
- **Glob patterns**: `lmv 'docs/**/*.md'`
- All methods can be used interchangeably

### Directory Scanning
- **Shallow by default**: Only scan top-level of directories
- **`--recursive` flag**: Enable recursive scanning of subdirectories
- **Respect .gitignore**: Files/folders matching .gitignore patterns are excluded
- **Hidden files excluded**: Files/folders starting with `.` are excluded by default
- **`--hidden` flag**: Include hidden files when specified

### File Limits
- **Warning threshold**: Display toast warning when >500 markdown files are found
- **Non-blocking**: Warning is informational only, files still load

---

## Sidebar

### Layout & Behavior
- **Tree structure**: Collapsible folder hierarchy matching the file system
- **Collapsible**: Toggle sidebar visibility with **Cmd/Ctrl + B**
- **Resizable**: Drag handle to resize width, persisted to localStorage
- **Responsive**: Percentage-based width that adjusts with window size
- **Mobile**: Overlay drawer that slides over content, closes on file select

### Single-File Mode
- When only one file is passed, **hide the sidebar** entirely (backward compatibility)
- Full-width view matching current behavior

### Tree Display
- **Name only**: Show filenames without metadata
- **First level expanded**: Top-level folders expanded, nested folders collapsed by default
- **Symlinks**: Show with indicator icon, follow the link when clicked
- **Error files**: Keep in list with error icon, show error message when clicked

### Selection
- **Background color highlight** for currently selected file
- **Arrow keys navigation** when sidebar is focused (Up/Down to move, Enter to open)

### Sorting
User-selectable sort options (dropdown in sidebar header):
- Name (A-Z)
- Name (Z-A)
- Modified (newest first)
- Modified (oldest first)

**Folder sorting by date**: Folders sort by the most recently modified file within them

### Filter/Search
- **Filter box** centered in the application top bar; focusing it reveals the sidebar
- **Live filtering**: Updates immediately as user types
- **Full path matching**: Matches against `folder/subfolder/file.md`
- **Auto-expand tree**: All folders containing matches expand automatically

---

## File Viewing

### Initial State
- **No file auto-selected**: Show empty state when app loads
- **Empty state message**: Simple "Select a file to view" text

### Header
- **Breadcrumb navigation**: `folder > subfolder > file.md`
- **Clickable breadcrumb**: Clicking a folder scrolls to and expands it in the sidebar

### File Switching
- **Immediate selection**: Selecting a file switches to it without save or confirmation behavior

---

## File Watching

### Content Changes
- **Watch for external changes**: Detect when files are modified outside the app
- **Automatic reload**: Reload the selected document from disk when it changes

### New Files
- **Detect new files**: Watch directory for new markdown files
- **Refresh button**: Show "Refresh" button/indicator in sidebar when new files detected
- **User-initiated**: New files only appear after user clicks refresh

### Deleted/Inaccessible Files
- **Keep in sidebar**: Show file with error icon
- **Error on click**: Display error message when user tries to open

---

## Existing Features

### Share to Gist
- **Current file only**: Share button creates gist of the currently viewed file
- Behavior unchanged from single-file mode

### Viewer-Only Source Handling
- Opened Markdown source files are never modified by LMV
- Gist sharing uses the currently loaded disk content
- Stale `lmv-autosave` localStorage values are ignored

### Themes
- Light/Dark/System toggle unchanged
- Persisted to localStorage

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + B | Toggle sidebar visibility |
| Cmd/Ctrl + K or `/` | Focus file search |
| Arrow Up/Down | Navigate file list (when sidebar focused) |
| Enter | Open selected file |

---

## Implementation Notes

### API Endpoints (New/Modified)
- `GET /api/files` - List all discovered markdown files with metadata
- `GET /api/file?path=<relativePath>` - Read a specific allowlisted file
- `PUT /api/file` is not supported; source files cannot be written through LMV
- WebSocket or SSE for file watch notifications

### State Management
- Extend App state to track:
  - `files`: Array of discovered files with paths and metadata
  - `selectedFile`: Currently selected file path (or null)
  - `sidebarVisible`: Boolean for sidebar visibility
  - `sidebarWidth`: Number for sidebar width
  - `sortOrder`: Current sort preference
  - `filterText`: Current filter string
  - `expandedFolders`: Set of expanded folder paths

### Components (New)
- `Sidebar` - Main sidebar container with header and tree
- `FileTree` - Recursive tree component
- `TreeNode` - Individual file/folder node
- `FilterInput` - Search/filter input component
- `SortDropdown` - Sort option selector
- `ResizeHandle` - Draggable resize handle
- `Breadcrumb` - Header breadcrumb navigation

---

## Out of Scope

- File creation, deletion, or renaming within the app
- Any modification of opened Markdown source files
- Multi-file gist sharing
- Content search across files
- Tabs for multiple open files
- Split view for comparing files
