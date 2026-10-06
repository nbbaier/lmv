# Multi-file viewing: implementation reference

This document describes the implemented viewer and supersedes the original feature
proposal, retained in Git history. Historical design notes below explain changed
requirements. Use the implementation and check pointers here or in
[AGENTS.md](../AGENTS.md) when changing this feature.

## Inputs and discovery

Files, directories, and quoted glob patterns can be combined:

```bash
lmv README.md docs/guide.md
lmv docs/ --recursive
lmv 'docs/**/*.md'
lmv docs/ --hidden --ignored
```

- Discovery accepts `.md` and `.markdown` case-insensitively and deduplicates paths.
- Directory scanning is shallow by default. `-r`/`--recursive` traverses
  subdirectories; glob traversal follows the pattern.
- Directory discovery excludes hidden files/folders unless `--hidden` is set.
  Glob matches also pass through hidden-path filtering. Explicit file arguments
  can name hidden files.
- Git-ignore filtering uses `git check-ignore` when Git is available and the
  working directory is inside a repository. `--ignored` bypasses it; hidden-path
  filtering is separate.
- Missing explicit inputs fail startup, as does finding no files. Refresh rescans
  tolerate missing inputs.
- More than 500 files on initial list load produces an informational toast without
  preventing loading.

Parsing lives in [src/cli-args.ts](../src/cli-args.ts), help and startup in
[src/cli.ts](../src/cli.ts), and discovery in
[src/lib/file-discovery.ts](../src/lib/file-discovery.ts). Options must also reach
`StartServerConfig` and `rescan` in [src/server.ts](../src/server.ts).

## Startup, selection, and persistence

| Discovered file set | Initial behavior |
| --- | --- |
| Exactly one file | Auto-select it; omit the sidebar and file search |
| Multiple files with a valid saved document for this working directory | Restore it and expand its parent folders |
| Multiple files without a valid saved document | Show “Select a file to view” until selection |

The sidebar is rendered when `files.length > 1`, regardless of how many CLI
arguments were supplied. Single-file viewing retains the document's readable
width rather than stretching prose across the viewport.

`selectedPath` identifies the document; `cursorPath` identifies the tree's keyboard
cursor. Selecting a different file starts a read without a save prompt, cancels
an obsolete selection request, and closes the mobile drawer. Switching documents
resets scroll position and clears an existing heading hash.

Selection is persisted through `/api/last-document`, keyed by the server's working
directory. [src/lib/state.ts](../src/lib/state.ts) stores it in
`$XDG_DATA_HOME/lmv/state.json`, falling back to `~/.local/share/lmv/state.json`.
The API returns a saved path only if it is allowlisted; the app also checks it
against its current file list. Persistence failures do not block viewing.

Sidebar visibility, width fraction, sort order, and theme use localStorage.
Filter text, expanded folders, and focus mode are page state. Focus mode hides the
shell and TOC while preserving sidebar preferences; file search exits focus mode.

## Sidebar and search

- Rows show names, selection highlighting, symlink indicators, and metadata errors.
  Top-level folders start expanded; restoring a document expands its ancestors.
- Sort choices are name ascending/descending and modified newest/oldest. Folders
  precede files and use the newest descendant's modification time for date sorting.
  Name ascending is the default; the preference is persisted.
- Top-bar search matches paths case-insensitively, filters immediately, and
  auto-expands matching ancestors. Focusing search opens the sidebar. It searches
  file paths, not document contents.
- Desktop width is a persisted viewport fraction with size bounds. The resize
  separator supports dragging and Left/Right keys; Shift increases the keyboard
  step, and double-click resets the fraction to 0.25.
- The mobile sidebar is an overlay drawer closed by file selection or dismissal.
  The document is inert while a rendered drawer is open outside focus mode.
- On wide screens, folder breadcrumbs expand and scroll to the folder in the tree.

The tree container owns keyboard focus through `aria-activedescendant`; `TreeRow`
items stay outside the sequential tab order.

| Shortcut | Action |
| --- | --- |
| Cmd/Ctrl+B | Toggle the browser with multiple files; in focus mode, exit and open it |
| Cmd/Ctrl+K or `/` | Open file search with multiple files; `/` applies outside editable controls |
| Up/Down, Home/End in the tree | Move the cursor among visible rows |
| Right/Left in the tree | Expand/enter folders or collapse/move to the parent |
| Enter in the tree | Toggle the cursor's folder or open its file |
| Down in search | Move focus to the tree |
| Escape in search | Clear the query, or blur if it is already empty |

## Watching, reloads, and refresh

Filesystem watchers send server-sent events (SSE) through `/api/watch`. The app
subscribes with `EventSource`.

| Event | Behavior |
| --- | --- |
| `ready` | The SSE stream has connected |
| `file-changed` with an allowlisted path | Reload if the path is still selected; successful reads replace content and show a toast |
| `fs-changed` with `pendingRefresh` | Update the refresh indicator without adding new files automatically |

Watch roots derive from the original inputs: directory inputs use the recursive
option, explicit files watch their parent directory, and globs use a base directory
with recursive watching for `**`. Watch setup/runtime errors are ignored, so
automatic updates depend on watcher support. A notification for a new path does
not guarantee that it will survive discovery filtering.

An event for an unallowlisted markdown path, or without a filename, marks refresh
pending. Clicking the sidebar refresh button requests `/api/files?refresh=1`.
A successful rescan replaces the allowlist and clears the pending flag, adding
new matches and removing deleted paths. Metadata is collected on file-list
requests; notifications alone do not update sidebar metadata.

Before a rescan, inaccessible/deleted paths can remain allowlisted. A list request
reports metadata errors. Selecting an unreadable file shows an error toast and
clears document content; a failed automatic reload shows an error toast and
retains previously loaded content. A rescan can remove the selected path from the
list without clearing `selectedPath` or the displayed content. Selecting another
file updates the document normally.

## API and source handling

Routes live in [src/server.ts](../src/server.ts):

| Route | Purpose |
| --- | --- |
| `GET /api/files` | List allowlisted paths with metadata, `singleFile`, and `pendingRefresh` |
| `GET /api/files?refresh=1` (or `refresh=true`) | Rescan the original inputs/options, then list files |
| `GET /api/file?path=<relativePath>` | Read an allowlisted file; single-file mode permits omitting `path` |
| `GET /api/last-document` | Return a valid saved path for this working directory, or null |
| `PUT /api/last-document` | Persist an allowlisted selection in LMV state |
| `GET /api/watch` | SSE change and pending-refresh notifications |
| `GET /api/share` | Report whether Gist sharing is configured |
| `POST /api/share` | Share the currently loaded content and filename as a Gist |

LMV does not modify opened Markdown source files. `PUT /api/file` returns 404;
editing/save controls and stale `lmv-autosave` preferences are absent or ignored.
Gist sharing requires `GITHUB_TOKEN` and sends the content currently loaded by the
app; it does not reread the source at share time.

## Implementation ownership and checks

Run `bun run check` for type checking and existing tests.

| Concern | Implementation | Existing coverage |
| --- | --- | --- |
| CLI options/help | [src/cli-args.ts](../src/cli-args.ts), [src/cli.ts](../src/cli.ts) | [src/cli-args.test.ts](../src/cli-args.test.ts), [src/cli.test.ts](../src/cli.test.ts) |
| Refresh allowlist, read-only source handling, metadata | [src/server.ts](../src/server.ts) | [src/server.test.ts](../src/server.test.ts) |
| Tree construction, sorting, filtering, visible rows | [src/lib/file-tree.ts](../src/lib/file-tree.ts) | [src/lib/file-tree.test.ts](../src/lib/file-tree.test.ts) covers folder ordering and filtering/expansion |
| Tree UI, `TreeRow`, sort select, resize separator, drawer | [src/components/sidebar.tsx](../src/components/sidebar.tsx) | Browser keyboard, pointer, and mobile checks |
| Search, breadcrumbs, selection, restore/reload effects | [src/app.tsx](../src/app.tsx), [src/lib/state.ts](../src/lib/state.ts) | Manual restore/switch/watch checks; no direct persistence/watcher tests |
| Focus shortcuts and shell hiding | [src/lib/focus-mode.ts](../src/lib/focus-mode.ts), [src/app.tsx](../src/app.tsx), [src/index.html](../src/index.html) | [src/lib/focus-mode.test.ts](../src/lib/focus-mode.test.ts) covers shortcuts; browser checks cover visibility/focus |

For CSS ownership, see [docs/agents/styling.md](agents/styling.md). Use
`bun run dev docs --recursive --no-open` for manual multi-file checks, then open the
printed URL. Check valid/invalid saved selections, switching, search, keyboard
navigation, resizing, mobile dismissal, and external changes followed by refresh.
[docs/demo.md](demo.md) supplies rendering examples.

## Historical design notes

The original proposal requested no automatic selection, a sidebar-free single-file
view, a choice of WebSocket or SSE notifications, and separate `FileTree`,
`TreeNode`, `FilterInput`, `SortDropdown`, `ResizeHandle`, and `Breadcrumb`
components. The current implementation instead restores valid selections, uses
SSE, builds/filters/flattens tree data in `src/lib/file-tree.ts`, renders rows as
`TreeRow` within `Sidebar`, and keeps search/breadcrumb markup in `App`.

The original request to retain deleted files applies only before a rescan;
refresh currently removes them. These notes record design evolution and do not
instruct agents to reintroduce old requirements.

File creation/deletion/renaming, source editing, multi-file Gist sharing, document
content search, tabs, and split views remain outside the implemented feature.
