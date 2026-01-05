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
- **Syntax highlighting** for 180+ languages
- **Dark/Light/System theme** toggle
- **Edit mode** with live preview toggle (Cmd+E)
- **Save to disk** (Cmd+S)
- **Share as GitHub Gist** (requires `GITHUB_TOKEN`)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+E` | Toggle edit mode |
| `Cmd+S` | Save changes |

## GitHub Gist Sharing

To enable the share feature, set your GitHub token:

```bash
export GITHUB_TOKEN=ghp_your_token_here
lmv README.md
```

The token needs the `gist` scope. [Create a token here](https://github.com/settings/tokens/new?scopes=gist).

## License

MIT
