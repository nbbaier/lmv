# Coding standards

Rules for writing and reviewing code in this repo. Each rule is marked
**[tooling]** when `bun run check` already enforces it or **[judgement]** when
a writer or reviewer has to apply it. Configuration lives in `biome.json` and
`tsconfig.json`; read those for the exact rule set.

## Runtime: Bun

- **[judgement]** Serve HTTP and WebSockets with `Bun.serve()` routes.
- **[judgement]** Serve the frontend through Bun HTML imports: `src/index.html`
  imports `.tsx` directly and Bun bundles it. There is no separate bundler or
  dev server.
- **[judgement]** Read and write file contents with `Bun.file` and
  `Bun.write`; use `node:fs` for filesystem operations Bun has no API for
  (metadata, directory listing, watching, links, removal).
- **[judgement]** Run shell commands with `Bun.$`.
- **[judgement]** Read environment variables directly from `process.env`; Bun
  loads `.env` automatically.
- Bun API reference: `node_modules/bun-types/docs/**.md`.

## Types

- **[tooling]** Strict mode with `noUncheckedIndexedAccess`: index access
  returns `T | undefined`, so handle the `undefined` case at each access.
- **[tooling]** Biome rejects `any` and non-null assertions (`!`).
- **[judgement]** Validate untyped data (request bodies, `response.json()`,
  parsed files) at runtime before using it as a typed value. Biome does not
  flag `as Type` assertions, so a reviewer has to.

## Components and styling

- **[judgement]** Build components in shadcn/ui style: Radix primitives,
  variants declared with `cva`, and class names merged with `cn()` from
  `src/lib/utils.ts` (clsx + tailwind-merge) so conflicting Tailwind classes
  resolve predictably.

## Markdown rendering

- **[judgement]** Render markdown with react-markdown + remark-gfm plus the
  highlighting plugin in `src/lib/syntax-highlighting.ts`.
- **[judgement]** Render mermaid diagrams with `beautiful-mermaid` as SVG,
  using the palette for the resolved light or dark theme (`MERMAID_PALETTES`
  in `src/app.tsx`).

## Formatting

- `bun run format` (Biome) is opt-in and is not part of `bun run check`, so
  formatting is never a CI failure and never a review finding.

## Known violations

Existing technical debt. Reviewers should treat these as known, not as new
findings, unless a diff touches them.

- `src/server.ts` `POST /api/share` handler: `as` assertions on the request
  body and on the Gist API response.
- `src/server.test.ts` fixture setup writes files with `node:fs/promises`
  `writeFile` instead of `Bun.write`.
