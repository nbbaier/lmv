# Feature navigation

Each section lists the implementation path for a feature area, in the order a
change usually flows through the files, and the checks that cover it. Test
pointers describe existing coverage. For multi-file behavior, the API route
table, and historical design changes, see `docs/multi-file.md`.

Browser checks: run `bun run dev docs/demo.md --no-open` (`docs/demo.md`
exercises every markdown feature) or `bun run dev docs --recursive --no-open`
when multiple files are needed, then open the printed URL.

## CLI parsing and help

- Path: `src/cli-args.ts` (`parseCliArgs`) → `src/cli.ts` (help, startup)
- Checks: `src/cli-args.test.ts`, `src/cli.test.ts`

## Discovery options (hidden, ignored, recursive)

- Path: the CLI path above → `src/lib/file-discovery.ts`
  (`discoverMarkdownFiles`) → `src/server.ts` (`StartServerConfig`, `rescan`)
- Propagate each option to both initial discovery and refresh.
- Checks: the CLI tests above; `src/server.test.ts` covers refresh; manually
  check option-specific discovery.

## File API and file set

- Path: `src/server.ts` routes → fetch handlers in `src/app.tsx`
- Opened Markdown source files are read-only: there is no `PUT /api/file`
  route. Adding editing reopens `docs/adr/0001-read-only-viewer.md`.
- Checks: `src/server.test.ts` covers the file API.

## Sidebar tree, sorting, file filter, and keyboard navigation

- Path: `src/lib/file-tree.ts` → `src/components/sidebar.tsx` → selection and
  file filter state in `src/app.tsx`
- Checks: `src/lib/file-tree.test.ts`; browser keyboard and drawer checks

## Code highlighting

- Path: `src/lib/syntax-highlighting.ts` (`rehypeHighlight`, bundled grammars)
  → `src/app.tsx` renderer
- Checks: `src/lib/syntax-highlighting.test.ts`

## TOC headings, IDs, and active section

- Path: `src/lib/table-of-contents.ts` → `src/components/toc.tsx`; the heading
  renderer in `src/app.tsx` uses the same slug helper.
- Checks: `src/lib/table-of-contents.test.ts`; browser scroll and link checks

## Focus mode

- Path: `src/lib/focus-mode.ts` → keyboard/state handling and class application
  in `src/app.tsx` → `.focus-mode` visibility/layout rules in `src/index.html`
- Checks: `src/lib/focus-mode.test.ts`; browser focus and layout checks

## Last document persistence

- Path: `src/lib/state.ts` → `/api/last-document` in `src/server.ts` →
  startup/selection effects in `src/app.tsx`
- Checks: manually reopen the same directory; there are no direct persistence
  tests.

## Watch, reload, and refresh

- Path: watchers, `rescan`, and `/api/watch` in `src/server.ts` →
  `EventSource` handlers in `src/app.tsx`
- Checks: `src/server.test.ts` covers refresh of the file set; browser checks
  for watch events and reload

## Markdown appearance, theme, and shell layout

- Path: `docs/agents/styling.md` maps CSS and component ownership.
- Checks: browser with `docs/demo.md`

## Frontmatter parsing and display

- Path: `src/lib/frontmatter.ts` → `src/components/frontmatter.tsx` →
  `src/app.tsx`
- Checks: browser with `docs/demo.md`

## Binary build, install, and missing browser assets

- Path: `docs/agents/runtime-debugging.md` distinguishes dev, built, and
  installed binaries; build scripts are in `package.json` and `scripts/`.
- The `module` field in `package.json` points to the CLI entry
  (`src/cli.ts`), which is atypical.
- Checks: `bun run build && ./dist/lmv --help && bun run smoke:binary` (the CI
  build job, which `bun run check` does not cover); browser checks for
  rendering

## Native viewer exploration (GPUI)

- Path: `docs/native-gpui.md` (design and porting map) → `native/`
  (Rust workspace: `lmv-core`, `lmv-app`, `lmv-cli`)
- The exploration shares no code with the browser app; the TypeScript gate
  does not cover it.
- Checks: `cd native && cargo test && cargo clippy --all-targets -- -D warnings`
