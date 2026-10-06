# lmv

A read-only viewer that renders local Markdown files in the browser, for one file or a whole collection.

## Language

### Finding files

**Input**:
A file path, directory, or glob pattern given on the command line.
_Avoid_: Argument, source

**Discovery**:
Turning the inputs and their options into the set of Markdown files that can be viewed.
_Avoid_: Scan, rescan, crawl

**Markdown file**:
Any `.md` or `.markdown` file found by discovery.
_Avoid_: Entry, item

**File set**:
The full collection of Markdown files that discovery found, and the only files the viewer will open.
_Avoid_: Allowlist, file list, discovered files

### Viewing

**Document**:
The single Markdown file that is currently selected and rendered.
_Avoid_: Page, open file, current file

**Last document**:
The document that was showing when this working directory was last viewed, restored on the next launch if it is still in the file set.
_Avoid_: Saved selection, saved document, last file

**Single-file view**:
The viewing mode used when the file set contains exactly one Markdown file; it has no sidebar or file filter.
_Avoid_: Single-file mode

**Focus mode**:
A reading state that hides everything except the document.
_Avoid_: Zen mode, distraction-free mode

### Navigating

**Sidebar**:
The panel that lists the file set; on narrow screens it appears as the drawer.
_Avoid_: Browser, file browser, file panel

**Tree**:
The folder hierarchy of the file set as shown inside the sidebar.
_Avoid_: File tree (when meaning the panel), explorer

**Drawer**:
The overlay form of the sidebar on narrow screens.
_Avoid_: Mobile sidebar, menu

**Cursor**:
The tree row that keyboard navigation currently points to, which may differ from the document.
_Avoid_: Focus, highlighted row

**File filter**:
The top-bar input that narrows the tree to Markdown files whose paths match; it never searches document contents.
_Avoid_: Search, file search, filter text

### Keeping up to date

**Reload**:
Re-reading the document after its file changes on disk.
_Avoid_: Refresh, update

**Refresh**:
Re-running discovery so the file set gains new Markdown files and drops deleted ones.
_Avoid_: Rescan, reload, re-discover

**Pending refresh**:
The state in which a change on disk might alter the file set and no refresh has run yet.
_Avoid_: Stale, dirty
