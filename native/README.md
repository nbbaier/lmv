# lmv native (GPUI spike)

Exploration of a native viewer on [GPUI](https://www.gpui.rs/). Read
`docs/native-gpui.md` first; this file is only the how-to.

## Build

```bash
cd native
cargo build            # lmv-core, lmv-app, lmv
cargo test             # unit tests plus the CLI handoff tests
cargo clippy --all-targets -- -D warnings
```

macOS needs Xcode command-line tools for Metal. Linux needs Vulkan,
fontconfig, xkbcommon, and X11 or Wayland development libraries (on
Ubuntu: `libxkbcommon-dev libxkbcommon-x11-dev` on top of the usual
`libfontconfig-dev libxcb*-dev libwayland-dev libvulkan-dev`). The
workspace patches `xattr` (see `Cargo.toml`) so gpui builds against
current `libc`.

## Run

```bash
# Start the viewer directly
cargo run -p lmv-app -- ../docs/demo.md

# Or go through the CLI; it launches lmv-app when none is running
# and hands the files to the running one otherwise.
cargo build
./target/debug/lmv ../docs/demo.md
./target/debug/lmv ../README.md ../docs     # replaces the file set in the open window
```

Environment:

- `LMV_SOCKET` overrides the socket path (default `$XDG_RUNTIME_DIR/lmv.sock`
  or `$TMPDIR/lmv-<user>.sock`).
- `LMV_APP` points the CLI at a specific `lmv-app` binary.

## Layout

- `crates/lmv-core`: discovery, markdown model, theme tokens, socket protocol.
- `crates/lmv-app`: GPUI window; `viewer.rs` is the shell, `document.rs` the
  Markdown renderer.
- `crates/lmv-cli`: the `lmv` command.
- `assets/fonts`: IBM Plex Sans and JetBrains Mono, embedded by `fonts.rs`.
