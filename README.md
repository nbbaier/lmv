# lmv - Local Markdown Viewer

View local markdown files in your browser with syntax highlighting and dark mode.

## Installation

### Homebrew (macOS/Linux)

```bash
brew install dmmulroy/tap/lmv
```

### From Release

Download the latest binary from [Releases](https://github.com/dmmulroy/lmv/releases).

### From Source

```bash
git clone https://github.com/dmmulroy/lmv.git
cd lmv
bun install
bun run build
```

## Usage

```bash
# Open a markdown file
lmv README.md

# Use a custom port
lmv docs/guide.md -p 8080

# Don't auto-open browser
lmv README.md --no-open
```

## Features

- **Markdown rendering** with GFM support (tables, task lists, strikethrough)
- **Syntax highlighting** for common web, scripting, and systems languages
- **Dark/Light/System theme** toggle
- **Focus mode** for distraction-free reading (`F`, then `F` or `Escape` to exit)
- **Read-only source handling** — LMV never modifies opened Markdown source files

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F` | Enter or exit focus mode while reading |
| `Escape` | Exit focus mode |
| `Cmd/Ctrl+B` | Toggle the file browser |
| `Cmd/Ctrl+K` or `/` | Search files |

Focus mode hides the top bar, file browser, and table of contents while preserving
the document's readable measure. Opening file search exits focus mode. The setting
lasts only for the current page session, so reopening LMV always restores the normal
shell; the file browser's collapsed/open and resized state is preserved while focus
mode is active.

## 0.3.0 Breaking Change

LMV 0.3.0 removes source editing. The desktop and mobile Read/Edit controls,
Markdown editor, dirty indicator, Save button, autosave preference, and the
`Cmd/Ctrl+E` and `Cmd/Ctrl+S` editing shortcuts are no longer available.
`PUT /api/file` has also been removed; requests now receive `404 Not Found`.
Existing `lmv-autosave` localStorage values are ignored.

“Read-only” here means LMV does not modify the opened Markdown source files. LMV
still stores UI preferences and the last selected document.

## License

MIT
