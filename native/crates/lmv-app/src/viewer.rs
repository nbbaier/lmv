//! The window's root view: top bar plus the document scroller. Measurements
//! follow the shell markup in `src/app.tsx` (3.25rem top bar, 54rem document
//! container, 78ch reading measure).

use crate::colors::ToHsla;
use crate::document::render_blocks;
use gpui::{
    div, prelude::*, px, relative, Context, FontWeight, IntoElement, Render, Window,
    WindowAppearance,
};
use lmv_core::ipc::OpenRequest;
use lmv_core::markdown::{self, Document};
use lmv_core::theme::{Theme, ThemeMode, FONT_MONO, FONT_SANS};
use std::path::PathBuf;

pub struct Viewer {
    files: Vec<PathBuf>,
    cwd: PathBuf,
    selected: Option<usize>,
    document: Option<Document>,
    error: Option<String>,
    theme_mode: ThemeMode,
}

impl Viewer {
    pub fn new(request: OpenRequest, cx: &mut Context<Self>) -> Self {
        let mut viewer = Viewer {
            files: Vec::new(),
            cwd: PathBuf::new(),
            selected: None,
            document: None,
            error: None,
            theme_mode: ThemeMode::System,
        };
        viewer.open(request, cx);
        viewer
    }

    /// Replace the file set and show its first document.
    pub fn open(&mut self, request: OpenRequest, cx: &mut Context<Self>) {
        self.cwd = request.cwd;
        self.files = request.files;
        self.selected = None;
        self.document = None;
        self.error = None;
        if !self.files.is_empty() {
            self.select(0, cx);
        }
        cx.notify();
    }

    fn select(&mut self, index: usize, cx: &mut Context<Self>) {
        let Some(path) = self.files.get(index) else {
            return;
        };
        match std::fs::read_to_string(path) {
            Ok(source) => {
                self.document = Some(markdown::parse(&source));
                self.error = None;
            }
            Err(error) => {
                self.document = None;
                self.error = Some(format!("Could not read {}: {error}", path.display()));
            }
        }
        self.selected = Some(index);
        cx.notify();
    }

    fn cycle_theme(&mut self, cx: &mut Context<Self>) {
        self.theme_mode = self.theme_mode.next();
        cx.notify();
    }

    fn selected_path(&self) -> Option<&PathBuf> {
        self.selected.and_then(|index| self.files.get(index))
    }

    fn display_name(&self) -> String {
        match self.selected_path() {
            Some(path) => path
                .strip_prefix(&self.cwd)
                .unwrap_or(path)
                .to_string_lossy()
                .to_string(),
            None => "No file selected".to_string(),
        }
    }

    fn render_top_bar(&self, theme: &Theme, cx: &mut Context<Self>) -> impl IntoElement {
        let file_label = self.display_name();
        let has_file = self.selected.is_some();
        div()
            .flex_shrink_0()
            .h(px(52.0))
            .px(px(12.0))
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.0))
            .border_b_1()
            .border_color(theme.border.hsla())
            .bg(theme.background.with_alpha(0.95))
            .child(
                div()
                    .flex()
                    .min_w_0()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        div()
                            .font_family(FONT_MONO)
                            .text_size(px(13.0))
                            .font_weight(FontWeight::SEMIBOLD)
                            .child("lmv"),
                    )
                    .child(div().w(px(1.0)).h(px(16.0)).bg(theme.border.hsla()))
                    .child(
                        div()
                            .min_w_0()
                            .truncate()
                            .text_size(px(12.0))
                            .font_weight(if has_file {
                                FontWeight::MEDIUM
                            } else {
                                FontWeight::NORMAL
                            })
                            .text_color(if has_file {
                                theme.foreground.hsla()
                            } else {
                                theme.muted_foreground.hsla()
                            })
                            .child(file_label),
                    ),
            )
            .child(
                div()
                    .id("theme-toggle")
                    .h(px(32.0))
                    .px(px(10.0))
                    .rounded(px(6.0))
                    .flex()
                    .items_center()
                    .text_size(px(12.0))
                    .text_color(theme.muted_foreground.hsla())
                    .cursor_pointer()
                    .hover(|this| {
                        this.bg(theme.accent.hsla())
                            .text_color(theme.foreground.hsla())
                    })
                    .on_click(cx.listener(|this, _, _, cx| this.cycle_theme(cx)))
                    .child(format!("Theme: {}", self.theme_mode.label())),
            )
    }

    fn render_document(&self, theme: &Theme) -> impl IntoElement {
        let body = if let Some(error) = &self.error {
            div()
                .text_color(theme.muted_foreground.hsla())
                .child(error.clone())
                .into_any_element()
        } else if let Some(document) = &self.document {
            div()
                .w_full()
                .max_w(px(640.0))
                .mx_auto()
                .flex()
                .flex_col()
                .children(render_blocks(&document.blocks, theme))
                .into_any_element()
        } else {
            div()
                .min_h(px(360.0))
                .flex()
                .items_center()
                .justify_center()
                .text_size(px(14.0))
                .text_color(theme.muted_foreground.hsla())
                .child("Select a file to view")
                .into_any_element()
        };

        div()
            .id("document-scroller")
            .flex_1()
            .min_h_0()
            .w_full()
            .overflow_y_scroll()
            .child(
                div()
                    .w_full()
                    .max_w(px(864.0))
                    .mx_auto()
                    .px(px(32.0))
                    .py(px(48.0))
                    .child(body),
            )
    }
}

impl Render for Viewer {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let system_is_dark = matches!(
            window.appearance(),
            WindowAppearance::Dark | WindowAppearance::VibrantDark
        );
        let theme = Theme::resolve(self.theme_mode, system_is_dark);

        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(theme.background.hsla())
            .text_color(theme.foreground.hsla())
            .font_family(FONT_SANS)
            .text_size(px(15.0))
            .line_height(relative(1.7))
            .child(self.render_top_bar(&theme, cx))
            .child(self.render_document(&theme))
    }
}
