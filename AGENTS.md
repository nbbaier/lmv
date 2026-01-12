# LMV PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-12
**Commit:** f86a720

## OVERVIEW

CLI tool for viewing/editing local markdown files in browser. Bun + React 19 + Tailwind v4.

## STRUCTURE

```
lmv/
├── src/
│   ├── cli.ts          # CLI entry (parses args, spawns server)
│   ├── server.ts       # Bun.serve() backend + API routes
│   ├── index.html      # HTML entry (loads Tailwind CDN)
│   ├── main.tsx        # React root mount
│   ├── app.tsx         # Main UI (487 lines, largest file)
│   ├── components/     # shadcn/ui pattern (button, toggle, tooltip)
│   └── lib/utils.ts    # cn() helper (clsx + twMerge)
├── scripts/build.ts    # Cross-platform binary builder
└── CLAUDE.md           # Bun API reference (generic)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| CLI args/help | `src/cli.ts` | port, --no-open |
| API routes | `src/server.ts` | /api/file, /api/share |
| UI logic | `src/app.tsx` | theme, save, gist sharing |
| Add component | `src/components/` | cva + Radix pattern |
| Build binary | `scripts/build.ts` | darwin/linux targets |

## CONVENTIONS

- **Runtime**: Bun exclusively (see CLAUDE.md for API patterns)
- **Components**: shadcn/ui style - Radix primitives + cva variants
- **Styling**: Tailwind v4 via CDN in index.html, tw-merge for conflicts
- **Strict TS**: `noUncheckedIndexedAccess: true` - index access returns `T | undefined`

## ANTI-PATTERNS

| Pattern | Reason |
|---------|--------|
| `as Type` assertions | Violates type safety; use runtime validation |
| Non-null `!` operator | Use null checks or Option pattern |
| `any` type | Never acceptable |
| Express/Vite | Use Bun.serve() and HTML imports |

### Known Violations (technical debt)

- `src/main.tsx:4` - non-null assertion on getElementById
- `src/server.ts:75-76,112` - type assertions on request body

## COMMANDS

```bash
bun run dev         # Start dev server with HMR
bun run build       # Build binary for current platform
bun run build:all   # Cross-compile all targets (darwin/linux)
bun x tsc --noEmit  # Type check
```

## NOTES

- `src/styles.css` exists but unused (Tailwind CDN in HTML instead)
- No test suite yet; CI only runs typecheck + smoke tests
- GitHub Gist sharing requires GITHUB_TOKEN env var
- `module` field in package.json points to CLI (atypical)
