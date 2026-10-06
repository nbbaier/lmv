# lmv — Agent Instructions

CLI tool for viewing local markdown files in the browser. Bun + React 19 + Tailwind v4.

## Where to look

For a change spanning files, follow the path in order. Test pointers describe
existing coverage; use browser checks for UI behavior.

| Task | Implementation path | Relevant checks |
| --- | --- | --- |
| CLI parsing/help | `src/cli-args.ts` (`parseCliArgs`) → `src/cli.ts` (help, startup) | `src/cli-args.test.ts`, `src/cli.test.ts` |
| Discovery option (hidden, ignored, recursive) | CLI path above → `src/lib/file-discovery.ts` (`discoverMarkdownFiles`) → `src/server.ts` (`StartServerConfig`, `rescan`); propagate options to both initial discovery and rescans | CLI tests above; `src/server.test.ts` covers refresh; manually check option-specific discovery |
| File API, allowlist, Gist sharing | `src/server.ts` routes → fetch handlers in `src/app.tsx` | `src/server.test.ts` covers file API; sharing needs manual verification |
| Sidebar tree, sorting, filtering, keyboard navigation | `src/lib/file-tree.ts` → `src/components/sidebar.tsx` → selection/search state in `src/app.tsx` | `src/lib/file-tree.test.ts`; browser keyboard/mobile checks |
| Code highlighting | `src/lib/syntax-highlighting.ts` (`rehypeHighlight`, bundled grammars) → `src/app.tsx` renderer | `src/lib/syntax-highlighting.test.ts` |
| TOC headings, IDs, active section | `src/lib/table-of-contents.ts` → `src/components/toc.tsx`; heading renderer in `src/app.tsx` uses the same slug helper | `src/lib/table-of-contents.test.ts`; browser scroll/link checks |
| Focus mode | `src/lib/focus-mode.ts` → keyboard/state handling and class application in `src/app.tsx` → `.focus-mode` visibility/layout rules in `src/index.html` | `src/lib/focus-mode.test.ts`; browser focus/layout checks |
| Last document persistence | `src/lib/state.ts` → `/api/last-document` in `src/server.ts` → startup/selection effects in `src/app.tsx` | Manually reopen the same directory; no direct persistence tests |
| Watch/reload/refresh | watchers, `rescan`, `/api/watch` in `src/server.ts` → `EventSource` handlers in `src/app.tsx` | `src/server.test.ts` covers refresh allowlist; browser checks for watch events/reload |
| Markdown appearance, theme, shell layout | `docs/agents/styling.md` maps CSS and component ownership | Browser with `docs/demo.md` |
| Frontmatter parsing/display | `src/lib/frontmatter.ts` → `src/components/frontmatter.tsx` → `src/app.tsx` | Browser with `docs/demo.md` |
| Binary build/install, missing browser assets | `docs/agents/runtime-debugging.md` distinguishes dev/built/installed binaries; build scripts in `package.json` and `scripts/` | `bun run build && bun run smoke:binary`; browser checks for rendering |

## Runtime: Bun (not Node.js)

Use Bun exclusively:

- `bun <file>` instead of `node`/`ts-node`; `bun test` instead of jest/vitest; `bun install`, `bun run <script>`, `bun build`
- `Bun.serve()` for the server (supports routes, WebSockets, HTML imports) — no Express, no Vite
- Frontend is served via HTML imports: `index.html` imports `.tsx` directly and Bun bundles/transpiles automatically
- Prefer `Bun.file` over `node:fs` readFile/writeFile; `Bun.$` for shell commands
- Bun auto-loads `.env` — don't use dotenv
- Full Bun API docs: `node_modules/bun-types/docs/**.md`

## Conventions

- **Components**: shadcn/ui style — Radix primitives + cva variants, `cn()` (clsx + tailwind-merge) for class conflicts
- **Markdown**: react-markdown + remark-gfm + the custom highlighting plugin mapped above; mermaid diagrams via `beautiful-mermaid` (SVG-only, dark-mode theme)
- **Strict TS**: `noUncheckedIndexedAccess: true` — index access returns `T | undefined`

## Anti-patterns

| Pattern               | Reason                                       |
| --------------------- | -------------------------------------------- |
| `as Type` assertions  | Violates type safety; use runtime validation |
| Non-null `!` operator | Use null checks (biome-ignore only with justification) |
| `any` type            | Never acceptable                             |
| Express/Vite          | Use Bun.serve() and HTML imports             |

### Known violations (technical debt)

- `src/server.ts` — type assertions on request/response bodies (lines ~212, ~327–328, ~364)

## Commands

```bash
bun run dev         # Start dev server with HMR
bun run build       # Build binary for current platform
bun run build:all   # Cross-compile all targets (darwin/linux)
bun run check       # Lint, type check, and run tests (same command as CI)
bun run lint        # Biome lint; warnings fail the command
bun run format      # Opt-in Biome formatting
```

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`nbbaier/lmv`), managed via the `gh` CLI. External PRs are not treated as a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — no custom mapping. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Notes

- `biome.json` owns lint rules and formatter settings for TypeScript/TSX and root JSON files; targeted suppressions explain intentional exceptions
- `bun test` covers CLI, server, and pure UI helpers; CI runs `bun run check` on Linux and macOS, plus smoke tests
- GitHub Gist sharing requires `GITHUB_TOKEN` env var
- Opened Markdown source files are read-only: there is no `PUT /api/file` route
- `module` field in package.json points to the CLI entry (atypical)
- For multi-file behavior, APIs, implementation ownership, and historical design changes, read `docs/multi-file.md`
- `docs/demo.md` is a markdown feature demo file for manually testing the viewer
