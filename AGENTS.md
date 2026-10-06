# lmv — Agent Instructions

CLI tool for viewing local markdown files in the browser. Bun + React 19 + Tailwind v4.

Before exploring code, read `GLOSSARY.md` and any `docs/adr/` entries for the
area, and use glossary terms (`docs/agents/domain.md`).

- **Changing a feature**: `docs/agents/navigation.md` maps each area to its files and checks.
- **Issues and triage**: `gh` CLI; see `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md`.

## Runtime: Bun (not Node.js)

Use Bun exclusively:

- `Bun.serve()` for the server (supports routes, WebSockets, HTML imports) instead of Express
- Frontend is served via HTML imports instead of Vite: `index.html` imports `.tsx` directly and Bun bundles/transpiles automatically
- Prefer `Bun.file` over `node:fs` readFile/writeFile; `Bun.$` for shell commands
- Bun auto-loads `.env` — don't use dotenv
- Full Bun API docs: `node_modules/bun-types/docs/**.md`

## Conventions

- **Components**: shadcn/ui style — Radix primitives + cva variants, `cn()` (clsx + tailwind-merge) for class conflicts
- **Markdown**: react-markdown + remark-gfm + the custom highlighting plugin in `src/lib/syntax-highlighting.ts`; mermaid diagrams via `beautiful-mermaid` (SVG-only, dark-mode theme)
- **Strict TS**: `noUncheckedIndexedAccess: true` — index access returns `T | undefined`

## Anti-patterns

- Validate untyped data at runtime instead of using `as Type` assertions; Biome does not catch these (it already rejects `any` and `!`)

### Known violations (technical debt)

- `src/server.ts` `POST /api/share` handler — `as` assertions on the request body and the Gist API response

## Commands

```bash
bun run dev         # Start dev server with HMR
bun run check       # The CI gate: lint (warnings fail), type check, tests; CI runs it on Linux and macOS plus smoke tests
bun run format      # Opt-in Biome formatting; not part of check
```
