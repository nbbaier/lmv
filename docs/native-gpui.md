# Exploration: a native lmv on GPUI

Status: exploration, not a decision. The spike lives in `native/`; nothing in
the TypeScript app changed. Target platform is macOS only: the owner is the
main user and uses a Mac. Linux is kept compiling solely so cloud sessions
(which run Linux) can type-check and test the Rust code. Reopening this as a roadmap item means turning the
"Milestones" section into issues.

## The question

Today lmv is a Bun CLI that starts a local server and opens a React page.
The alternative explored here is a native desktop viewer written in Rust on
[GPUI](https://www.gpui.rs/), Zed's UI framework, that:

1. runs on its own, as an app a user can open without the CLI,
2. looks the same as the browser shell does now, and
3. still has an `lmv` command that opens files in it.

## Verdict in short

Feasible, and the spike proves the three risky parts: GPUI compiles and
renders Markdown with the current typography and palette, the fonts can be
bundled, and a Unix-socket handoff gives a single-instance app that the CLI
targets the way `code .` targets VS Code. The cost is that every piece of the
browser shell is rebuilt by hand, because GPUI has no HTML, CSS, or DOM. The
parts that are cheap in the browser and expensive natively are text
selection, the file filter input, Mermaid, and accessibility. Two front-ends
would then share only the feature vocabulary, not code.

If "looks the same" matters more than "no browser engine", the honest
comparison is a Tauri or WebKit wrapper around the existing React app, which
reaches a standalone app at a fraction of the cost. This document does not
pursue that, since GPUI was the ask, but it is the alternative to beat.

## Architecture

```
native/
  crates/lmv-core   discovery, markdown model, theme tokens, socket protocol
  crates/lmv-app    the GPUI window (binary `lmv-app`)
  crates/lmv-cli    the `lmv` command
  assets/fonts      IBM Plex Sans + JetBrains Mono (OFL), embedded at build time
  vendor/xattr      one-line patch so gpui builds on Linux cloud sessions (see Build)
```

### Process model and CLI handoff

- `lmv-app` is the long-lived viewer. On start it takes an advisory lock
  on `lmv.lock`, binds the Unix domain socket next to it
  (`$XDG_RUNTIME_DIR/lmv.sock`, else `~/.local/state/lmv/lmv.sock` in a
  mode-0700 directory, override with `LMV_SOCKET`), and opens a window for
  any files given as arguments. A second app that loses the lock forwards
  its files to the owner and exits. Each peer is served on its own thread
  with a five-second timeout and a one-megabyte request limit.
- `lmv <inputs>` resolves inputs into the file set, then sends one JSON line
  (`{cwd, files}`) over the socket and reads one reply. If nothing listens
  it launches `lmv-app` (sibling binary, `LMV_APP` override, or `PATH`)
  with the files as arguments and waits up to five seconds for the socket.
- The app polls a channel from the socket thread on the UI thread. When a
  request arrives it replaces the file set, reopens a window if the user
  closed it, and activates the app.

The socket keyed by user, not by working directory, means one window per
machine. "Open in a new window" would need a flag on the request.

### Rendering pipeline

```
file → split_frontmatter → pulldown-cmark events → Block tree → GPUI elements
                                                    └ Inlines { text, runs, links }
```

`Inlines` flattens every inline run into one string plus contiguous styled
ranges. That maps one-to-one onto GPUI's `StyledText::with_runs`, so the
renderer sets a `TextRun` per range (mono font for code, semibold for strong,
italic, link color plus underline, strikethrough) and never re-parses. The
block renderer carries the `.markdown-content` measurements from
`src/index.html` evaluated at the 15px body size.

### Theme

`lmv_core::theme` copies the `:root` and `.dark` HSL tokens from
`src/index.html`. The viewer resolves `System` from the window appearance on
every render, and the toggle cycles system → light → dark exactly as the
browser shell does.

## What GPUI gives and what it does not

Facts checked against gpui 0.2.2 sources during the spike.

| Need | GPUI answer |
| --- | --- |
| Layout | `div()` builder with Tailwind-named methods (`flex`, `gap_2`, `px`, `border_b_1`, `overflow_y_scroll`); flexbox only, no grid, no container queries |
| Styled text | `StyledText::with_runs(Vec<TextRun>)`: per-run font family, weight, style, color, background, underline, strikethrough |
| Clickable text | `InteractiveText` with click handlers on byte ranges |
| Fonts | `cx.text_system().add_fonts(...)` loads embedded TTFs; `.font_family("IBM Plex Sans")` then works on every platform |
| Keyboard | `actions!` + `KeyBinding::new("cmd-b", ...)` + `key_context`; same model Zed uses |
| Text input | Nothing built in. The crate's `input.rs` example is ~700 lines of custom element; `gpui-component` on crates.io ships one |
| Lists | `uniform_list` virtualises rows of equal height, the right tool for the sidebar tree |
| Tooltips, hover, cursors | `.tooltip()`, `.hover()`, `.cursor_pointer()` on stateful elements |
| SVG | `svg()` renders a path in one color: fine for icons, not for Mermaid output |
| Images | `img()` loads files and data; usable for Markdown images |
| Animation | `with_animation` for the focus-mode slide |
| System appearance | `window.appearance()` and `observe_window_appearance` |
| Accessibility | Minimal. No equivalent of the ARIA tree, live region, or `inert` the browser shell uses |
| Text selection | Not built in for rendered text. Zed implements selection in its own `markdown` crate, which is not published |
| Platforms | macOS (Metal) is GPUI's primary target, which matches the scope here |

## Build facts

- `gpui` is published (0.2.2 on crates.io, Apache-2.0). It is pre-1.0 and
  the API moved between 0.1 and 0.2 (for example `spawn` now takes async
  closures). Expect churn.
- macOS needs only Xcode command-line tools (Metal). No patches apply there.
- Linux matters only for cloud sessions. There, `gpui` fails to build with
  current `libc` because its tar dependency pins `xattr 0.2.3`, which
  references a removed constant; the workspace patches `xattr` from
  `native/vendor` (a no-op on macOS). The container also needed
  `libxkbcommon-dev libxkbcommon-x11-dev` to link. Under Xvfb the app
  starts, binds its socket, and accepts a CLI handoff, but nothing is drawn;
  GPUI's own `hello_world` behaves the same, so screenshots have to come
  from the Mac.
- macOS was not available in this session. The window has not been seen.
  Treat the pixel measurements as a starting point to tune against the
  browser shell side by side.
- A clean debug build of the workspace compiles roughly 600 crates and took
  several minutes on the cloud container; an incremental rebuild of the app
  crate takes a few seconds. The debug `lmv-app` binary is 618 MB because of
  debug info; a release build with symbols stripped was not measured.
- `cargo clippy --all-targets -- -D warnings` and `cargo test` (16 tests:
  core units plus CLI handoff) pass.

## Feature porting map

Effort is relative to the spike. "Regression" marks places where the native
app would do less than the browser shell without extra work.

| Area (navigation.md) | Browser implementation | Native approach | Effort | Risk |
| --- | --- | --- | --- | --- |
| CLI parsing and help | `parseCliArgs` | `lmv-cli`; `-p` and `--no-open` disappear, `-r`, `--hidden`, `--ignored`, globs port into `lmv_core::discovery` | small | none |
| Discovery | `discoverMarkdownFiles`, `git check-ignore` | same algorithm in Rust; `ignore` crate replaces shelling to git | small | none |
| File API and file set | HTTP routes | direct file reads in the app process | none | none |
| Sidebar tree, sort, cursor | `file-tree.ts`, `TreeRow`, `aria-activedescendant` | `uniform_list` of rows, cursor as index, actions for arrows/Home/End/Enter | medium | keyboard parity is work; accessibility regression |
| File filter | `<input>` in the top bar | custom text input element or `gpui-component` | medium | the single biggest UI gap in GPUI |
| Sidebar resize | pointer drag, keyboard step | `on_drag` plus mouse move; persist fraction | small | none |
| Drawer (narrow) | overlay under 768px | drop; a desktop window just gets a minimum width | none | none |
| Code highlighting | lowlight + highlight.js `github-dark` | `syntect` with a converted theme, or tree-sitter via Zed's crates | medium | grammar coverage differs from the bundled highlight.js set |
| TOC and active section | `table-of-contents.ts`, scroll listener | headings from the block tree; `ScrollHandle` and element bounds for the active section | medium | sticky rail needs manual layout |
| Focus mode | class toggle, CSS transitions | state flag plus `with_animation` | small | none |
| Last document | `state.json` under `$XDG_DATA_HOME/lmv` | identical file and key, so both apps share it | small | none |
| Watch, reload, refresh | `fs.watch` + SSE | `notify` crate on the same roots, same pending-refresh semantics | small | none |
| Frontmatter panel | `frontmatter.tsx` | `split_frontmatter` exists; render a key-value panel | small | none |
| Theme | CSS variables | done in spike | done | none |
| Markdown appearance | `.markdown-content` CSS | done in spike for headings, paragraphs, inline styles, code, quotes, lists, tasks, tables, rules | done | tables use equal flex columns; sizing to content needs text measurement |
| Links | `<a>` | `InteractiveText` + `cx.open_url`; relative `.md` links select the file | small | none |
| Images | `<img>` | `img()` with file path | small | none |
| Mermaid | `beautiful-mermaid` in the browser | no Rust renderer; options are shelling to `mmdc` and showing the PNG with `img()`, or a webview just for diagrams | large | likely stays "shown as code" |
| Tooltips and toasts | Radix tooltip, toast list | `.tooltip()`, overlay with timers | small | none |
| Text selection and copy | browser default | custom selection over `TextLayout`, per element | large | regression until built |
| Binary build and install | `bun build --compile`, Homebrew formula | `cargo build --release`, a `.app` bundle with `Info.plist` and icon so Finder, Dock and `open -a lmv` work; ad-hoc codesign is enough for a personal install | small | none for a single user |

## The spike

`native/` builds three things:

- `lmv-core` with unit tests for discovery, the markdown model (including
  `docs/demo.md`), the theme, and the socket round trip.
- `lmv-app`, a window with the top bar (wordmark, current file, theme
  toggle) and a scrolling document in the reading measure.
- `lmv`, the CLI, with integration tests that run the binary against an
  in-process socket server and check the file set it delivers.

See `native/README.md` for commands. What it does not do: sidebar, file
filter, TOC, focus mode, highlighting, watching, persistence, link clicks,
selection, or a macOS bundle.

## Open questions for the owner

1. Is a webview wrapper acceptable? It is the cheapest route to "looks the
   same" and keeps one UI codebase. If not, say why, because the answer
   shapes how much of the table above is worth doing.
2. Does the browser version survive? Keeping both means two implementations
   of every feature in `docs/agents/navigation.md`.
3. Text selection and copy: must-have for 1.0 of the native app, or later?
4. Mermaid: drop, shell out, or webview island?

## Milestones if this proceeds

1. **Reading parity**: links, images, syntect highlighting, frontmatter
   panel, TOC rail with active section, focus mode, watch and reload. Ends
   with a side-by-side screenshot review against the browser shell.
2. **Navigation parity**: sidebar tree with keyboard cursor, sort, resize,
   file filter input, Cmd/Ctrl+B and Cmd/Ctrl+K, last document.
3. **Native fit and finish**: text selection and copy, `.app` bundle, Dock
   icon, `open -a`, a `build:cp`-style install script into `~/.local/bin`
   and `/Applications`.
4. **Decide the browser version's fate** and update the ADR set either way.
