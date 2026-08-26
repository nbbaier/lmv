# lmv — Agent Instructions

CLI tool for viewing local markdown files in the browser. Bun + React 19 + Tailwind v4.

## Structure

```
lmv/
├── src/
│   ├── cli.ts          # CLI entry (parses args, spawns server)
│   ├── server.ts       # Bun.serve() backend + API routes
│   ├── index.html      # HTML entry (loads Tailwind + highlight.js via CDN)
│   ├── main.tsx        # React root mount
│   ├── app.tsx         # Main UI (largest file)
│   ├── components/     # shadcn/ui pattern (button, sidebar, toc, frontmatter, tooltip)
│   └── lib/            # file-discovery, file-tree, frontmatter, state, utils (cn helper)
├── scripts/build.ts    # Cross-platform binary builder
└── docs/               # Specs and agent docs
```

## Where to look

| Task          | Location           | Notes                          |
| ------------- | ------------------ | ------------------------------ |
| CLI args/help | `src/cli.ts`       | port, --no-open                |
| API routes    | `src/server.ts`    | GET /api/file, /api/files, /api/share |
| UI logic      | `src/app.tsx`      | viewing, theme, gist sharing   |
| Add component | `src/components/`  | cva + Radix pattern            |
| File tree/discovery | `src/lib/`   | sidebar data layer             |
| Build binary  | `scripts/build.ts` | darwin/linux targets           |

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
- **Styling**: Tailwind v4 via CDN in `index.html` (`src/styles.css` exists but is unused)
- **Markdown**: react-markdown + remark-gfm + rehype-highlight; mermaid diagrams via `beautiful-mermaid` (SVG-only, dark-mode theme)
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
bun x tsc --noEmit  # Type check
```

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`nbbaier/lmv`), managed via the `gh` CLI. External PRs are not treated as a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — no custom mapping. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Notes

- `bun test` covers server and pure UI helpers; CI currently runs typecheck + smoke tests
- GitHub Gist sharing requires `GITHUB_TOKEN` env var
- Opened Markdown source files are read-only: there is no `PUT /api/file` route
- `module` field in package.json points to the CLI entry (atypical)
- `docs/multi-file.md` is the spec for the multi-file/sidebar feature
- `docs/demo.md` is a markdown feature demo file for manually testing the viewer
