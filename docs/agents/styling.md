# Styling navigation

## Choose the active source

| Change | Source |
| --- | --- |
| Markdown spacing, lists, headings, tables, links | `.markdown-content` rules in `src/index.html` |
| Document width, scrolling, responsive TOC layout | `.markdown-body`, `.document-*`, and media queries in `src/index.html` |
| App shell and component layout | Tailwind classes in `src/app.tsx` and `src/components/` |
| Theme colors, fonts, reading measure | `:root` and `.dark` variables in `src/index.html`; `tailwind.config` maps tokens to utilities |
| Code block colors | Highlight.js theme stylesheet linked in `src/index.html` and local `pre`/`code` rules |
| Rendered markdown elements and Mermaid SVG | `ReactMarkdown` component overrides and `MermaidDiagram` in `src/app.tsx` |

## Rendering path

`src/server.ts` imports `src/index.html` as the Bun HTML entry. Its module script
loads `src/main.tsx`, which mounts `App`. Both development and compiled binaries
use this entry, including its inline CSS and external stylesheet links.

Tailwind utilities are generated in the browser by the CDN script linked in
`src/index.html`. The installed `tailwindcss` package does not determine that
script's version. Theme variables and custom rules live in the entry's
`<style type="text/tailwindcss">` block.

## Verify appearance

Use `docs/demo.md` for markdown examples. Run
`bun run dev docs/demo.md --no-open` and open the printed URL. For shell and sidebar
changes, use `bun run dev docs --recursive --no-open` so multiple files are present.
Check light/dark themes and narrow/wide viewports for the affected UI.
