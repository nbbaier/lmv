//! `lmv-app`: the native viewer process.
//!
//! Started with file paths it opens them directly. It also listens on the
//! lmv socket so later `lmv` CLI invocations hand their file set to this
//! process instead of starting another one.

mod colors;
mod document;
mod fonts;
mod viewer;

use gpui::{
    prelude::*,
    actions, px, size, App, Application, Bounds, Entity, KeyBinding, TitlebarOptions, WindowBounds,
    WindowOptions,
};
use lmv_core::ipc::{self, OpenRequest};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use viewer::Viewer;

actions!(lmv, [Quit]);

fn initial_request() -> OpenRequest {
    let cwd = std::env::current_dir().unwrap_or_default();
    let files: Vec<PathBuf> = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .map(|path| if path.is_absolute() { path } else { cwd.join(path) })
        .collect();
    OpenRequest { cwd, files }
}

fn open_viewer_window(viewer: Entity<Viewer>, cx: &mut App) {
    let bounds = Bounds::centered(None, size(px(1180.0), px(820.0)), cx);
    let options = WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(bounds)),
        titlebar: Some(TitlebarOptions {
            title: Some("Local Markdown Viewer".into()),
            ..Default::default()
        }),
        ..Default::default()
    };
    if let Err(error) = cx.open_window(options, move |_, _| viewer) {
        eprintln!("lmv-app: could not open a window: {error}");
    }
}

fn main() {
    let (tx, rx) = mpsc::channel::<OpenRequest>();
    match ipc::serve(move |request| {
        let _ = tx.send(request);
    }) {
        Ok(_) => {}
        Err(error) => eprintln!("lmv-app: not listening for the CLI: {error}"),
    }

    Application::new().run(move |cx: &mut App| {
        fonts::load(cx);
        cx.bind_keys([KeyBinding::new("cmd-q", Quit, None)]);
        cx.on_action(|_: &Quit, cx| cx.quit());

        let viewer = cx.new(|cx| Viewer::new(initial_request(), cx));
        open_viewer_window(viewer.clone(), cx);
        cx.activate(true);

        // Hand requests from the socket thread to the UI thread. GPUI has no
        // channel of its own; a short timer poll keeps the spike dependency-free.
        cx.spawn(async move |cx| loop {
            cx.background_executor()
                .timer(Duration::from_millis(100))
                .await;
            while let Ok(request) = rx.try_recv() {
                let viewer = viewer.clone();
                let _ = cx.update(|cx| {
                    viewer.update(cx, |viewer, cx| viewer.open(request, cx));
                    if cx.windows().is_empty() {
                        open_viewer_window(viewer, cx);
                    }
                    cx.activate(true);
                });
            }
        })
        .detach();
    });
}
