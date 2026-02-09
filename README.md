# lmv - Local Markdown Viewer

View and edit markdown files in your browser with syntax highlighting, dark mode, and GitHub Gist sharing.
https://x.com/jainarvind/status/2019553277571190821?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/kevinrose/status/2019640020240593072?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/magi_jay/status/2019495798543724917?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/nathanflurry/status/2019528889643725176?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/nicopreme/status/2019647662174150816?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/pn46pn46/status/2019510427592601830?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/samuelcolvin/status/2019604402399768721?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/shuding/status/2019702844635689342?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/sirajahashmi/status/2019568390239842721?s=12&t=6MtvRH_rRZ9z3iep_OO15A
https://x.com/strike_dr/status/2019428354009731202?s=12&t=6MtvRH_rRZ9z3iep_OO15A
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
