# lmv - Local Markdown Viewer

View and edit markdown files in your browser with syntax highlighting, dark mode, and GitHub Gist sharing.

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
- **Edit mode** with live preview toggle (Cmd+E)
- **Save to disk** (Cmd+S)
- **Share as GitHub Gist** (requires `GITHUB_TOKEN`)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `F` | Enter or exit focus mode while reading |
| `Escape` | Exit focus mode |
| `Cmd/Ctrl+B` | Toggle the file browser |
| `Cmd/Ctrl+K` or `/` | Search files |
| `Cmd/Ctrl+E` | Toggle edit mode |
| `Cmd/Ctrl+S` | Save changes |

Focus mode is deliberately read-only: entering it hides the top bar, file browser,
and table of contents while preserving the document's readable measure. Switching
to edit mode or opening file search exits focus mode. The setting lasts only for
the current page session, so reopening LMV always restores the normal shell; the
file browser's collapsed/open and resized state is preserved while focus mode is
active.

## GitHub Gist Sharing

To enable the share feature, set your GitHub token:

```bash
export GITHUB_TOKEN=ghp_your_token_here
lmv README.md
```

The token needs the `gist` scope. [Create a token here](https://github.com/settings/tokens/new?scopes=gist).

## License

MIT
