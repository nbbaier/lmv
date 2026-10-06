# Runtime and compiled-asset debugging

## Identify the executable

Run these from the repository root, with a separate unused port for each mode:

```bash
bun run dev docs/demo.md --no-open --port 3101 > /tmp/lmv-dev.log 2>&1
```

In another terminal, open `http://localhost:3101`. Stop the server with Ctrl+C
before moving on. This runs source code with Bun's development/HMR mode.

Build a fresh production binary before testing compiled behavior:

```bash
bun run build
./dist/lmv docs/demo.md --no-open --port 3102 > /tmp/lmv-built.log 2>&1
```

Open `http://localhost:3102`. The installed command may be an older binary;
check its location before attributing its behavior to the current checkout:

```bash
command -v lmv
lmv docs/demo.md --no-open --port 3103 > /tmp/lmv-installed.log 2>&1
```

Building `dist/lmv` does not replace the installed executable. Preserve these
logs and record which command and URL reproduced the failure.

## Check compiled assets

```bash
bun run build
bun run smoke:binary
# Or check a specific executable:
bun run smoke:binary /absolute/path/to/lmv
```

The smoke check launches the binary in production mode with a temporary file,
waits up to 15 seconds for startup, and gives each HTTP request a one-second
timeout. It checks the root HTML and its same-origin scripts and stylesheets
for status, MIME type, and nonempty content. It rejects HTML masquerading as an
asset, stops the server, and retains the printed server log on failure.

This check does not execute JavaScript or fetch CDN resources. For rendering
failures, open the exact failing mode's URL in a browser and inspect Console
and Network. Use `docs/demo.md`, light/dark themes, and narrow/wide viewports;
use `docs --recursive` for sidebar behavior. In particular, check local script
responses and the external Tailwind, font, and highlight theme requests before
changing routes or HMR settings. An HTTP asset check cannot prove that the UI
renders or that external services are available.
