//! Render the markdown block tree with the measurements from the
//! `.markdown-content` rules in `src/index.html`. Pixel values below are
//! those rules evaluated at the 15px body size.

use crate::colors::ToHsla;
use gpui::{
    div, font, prelude::*, px, relative, rgb, AnyElement, Font, FontStyle, FontWeight, Hsla,
    StrikethroughStyle, StyledText, TextRun, UnderlineStyle,
};
use lmv_core::markdown::{Block, Inlines, ListItem};
use lmv_core::theme::{Theme, FONT_MONO, FONT_SANS};

const BODY_PX: f32 = 15.0;

/// The inherited text style of the element an `Inlines` is rendered into.
#[derive(Clone, Copy)]
struct BaseStyle {
    color: Hsla,
    weight: FontWeight,
    italic: bool,
}

impl BaseStyle {
    fn body(theme: &Theme) -> Self {
        BaseStyle {
            color: theme.foreground.hsla(),
            weight: FontWeight::NORMAL,
            italic: false,
        }
    }
}

pub fn render_blocks(blocks: &[Block], theme: &Theme) -> Vec<AnyElement> {
    render_blocks_with(blocks, theme, BaseStyle::body(theme))
}

/// `StyledText` runs set every character's color and style explicitly, so
/// a parent's `text_color` or `italic()` never reaches them. Containers that
/// restyle their text (blockquotes) therefore pass the style down as `base`.
fn render_blocks_with(blocks: &[Block], theme: &Theme, base: BaseStyle) -> Vec<AnyElement> {
    blocks
        .iter()
        .map(|block| render_block(block, theme, base))
        .collect()
}

fn render_block(block: &Block, theme: &Theme, base: BaseStyle) -> AnyElement {
    match block {
        Block::Heading { level, inlines } => render_heading(*level, inlines, theme, base),
        Block::Paragraph(inlines) => div()
            .my(px(BODY_PX))
            .child(render_inlines(inlines, theme, base))
            .into_any_element(),
        Block::CodeBlock { code, .. } => render_code_block(code),
        Block::BlockQuote(blocks) => div()
            .my(px(BODY_PX * 1.25))
            .px(px(BODY_PX))
            .py(px(BODY_PX * 0.55))
            .border_l_2()
            .border_color(theme.link.hsla())
            .bg(theme.muted.with_alpha(0.35))
            .children(render_blocks_with(
                blocks,
                theme,
                BaseStyle {
                    color: theme.muted_foreground.hsla(),
                    weight: FontWeight::NORMAL,
                    italic: true,
                },
            ))
            .into_any_element(),
        Block::List { start, items } => render_list(*start, items, theme, base),
        Block::Table { header, rows } => render_table(header, rows, theme, base),
        Block::Rule => div()
            .my(px(BODY_PX * 2.5))
            .mx_auto()
            .w(px(96.0))
            .h(px(1.0))
            .bg(theme.border.hsla())
            .into_any_element(),
        Block::Html(html) => div()
            .my(px(BODY_PX))
            .font_family(FONT_MONO)
            .text_size(px(13.0))
            .text_color(theme.muted_foreground.hsla())
            .child(html.clone())
            .into_any_element(),
    }
}

fn render_heading(level: u8, inlines: &Inlines, theme: &Theme, parent: BaseStyle) -> AnyElement {
    let (size, top, bottom) = match level {
        1 => (32.0, 0.0, 0.85),
        2 => (24.0, 2.1, 0.7),
        3 => (20.0, 1.9, 0.6),
        4 => (16.8, 1.7, 0.5),
        _ => (15.2, 1.6, 0.45),
    };
    let color = if level >= 5 {
        theme.muted_foreground.hsla()
    } else {
        theme.foreground.hsla()
    };
    // Headings set their own color even inside a blockquote, as the CSS does,
    // but inherit the italic.
    let base = BaseStyle {
        color,
        weight: FontWeight::SEMIBOLD,
        italic: parent.italic,
    };
    let inlines = if level == 6 {
        uppercase(inlines)
    } else {
        inlines.clone()
    };

    div()
        .mt(px(size * top))
        .mb(px(size * bottom))
        .text_size(px(size))
        .font_weight(FontWeight::SEMIBOLD)
        .line_height(relative(1.22))
        .text_color(color)
        .when(level <= 2, |this| {
            this.pb(px(size * if level == 1 { 0.35 } else { 0.28 }))
                .border_b_1()
                .border_color(theme.border.hsla())
        })
        .child(render_inlines(&inlines, theme, base))
        .into_any_element()
}

fn uppercase(inlines: &Inlines) -> Inlines {
    // Uppercasing can change byte lengths, so rebuild the runs.
    let mut out = Inlines {
        links: inlines.links.clone(),
        ..Inlines::default()
    };
    for run in &inlines.runs {
        let text = inlines.text[run.range.clone()].to_uppercase();
        let start = out.text.len();
        out.text.push_str(&text);
        out.runs.push(lmv_core::markdown::Run {
            range: start..out.text.len(),
            style: run.style,
        });
    }
    out
}

fn render_code_block(code: &str) -> AnyElement {
    // Colors follow the highlight.js `github-dark` block chrome the browser
    // shell uses regardless of theme. Token colors wait on syntect.
    let lines: Vec<String> = code
        .split('\n')
        .map(|line| {
            if line.is_empty() {
                " ".to_string()
            } else {
                line.to_string()
            }
        })
        .collect();
    // Scroll state is keyed by id, so each block needs its own. The code
    // string's heap address is unique per block and stable while the
    // document stays loaded.
    div()
        .id(("code-block", code.as_ptr() as usize))
        .my(px(BODY_PX * 1.5))
        .px(px(18.0))
        .py(px(14.0))
        .rounded(px(10.0))
        .border_1()
        .border_color(rgb(0x30363d))
        .bg(rgb(0x0d1117))
        .text_color(rgb(0xc9d1d9))
        .font_family(FONT_MONO)
        .text_size(px(13.0))
        .line_height(relative(1.6))
        .overflow_x_scroll()
        .children(
            lines
                .into_iter()
                .map(|line| div().whitespace_nowrap().child(line)),
        )
        .into_any_element()
}

fn render_list(
    start: Option<u64>,
    items: &[ListItem],
    theme: &Theme,
    base: BaseStyle,
) -> AnyElement {
    let marker_color = theme.muted_foreground.hsla();
    let rows = items.iter().enumerate().map(|(index, item)| {
        let marker: AnyElement = match (item.checked, start) {
            (Some(checked), _) => render_checkbox(checked, theme),
            (None, Some(first)) => div()
                .text_color(marker_color)
                .child(format!("{}.", first + index as u64))
                .into_any_element(),
            (None, None) => div().text_color(marker_color).child("•").into_any_element(),
        };
        div()
            .flex()
            .items_start()
            .when(index > 0, |this| this.mt(px(BODY_PX * 0.32)))
            .child(
                div()
                    .flex_shrink_0()
                    .w(px(24.0))
                    .pr(px(6.0))
                    .flex()
                    .justify_end()
                    .child(marker),
            )
            .child(div().flex_1().min_w_0().children(render_blocks_tight(
                &item.blocks,
                theme,
                base,
            )))
    });
    div()
        .my(px(BODY_PX))
        .flex()
        .flex_col()
        .children(rows)
        .into_any_element()
}

/// Inside list items the browser shell collapses paragraph margins to 0.35em.
fn render_blocks_tight(blocks: &[Block], theme: &Theme, base: BaseStyle) -> Vec<AnyElement> {
    blocks
        .iter()
        .map(|block| match block {
            Block::Paragraph(inlines) => div()
                .my(px(BODY_PX * 0.35))
                .child(render_inlines(inlines, theme, base))
                .into_any_element(),
            Block::List { start, items } => div()
                .my(px(BODY_PX * 0.35))
                .child(render_list(*start, items, theme, base))
                .into_any_element(),
            other => render_block(other, theme, base),
        })
        .collect()
}

fn render_checkbox(checked: bool, theme: &Theme) -> AnyElement {
    let mut boxed = div()
        .mt(px(5.0))
        .size(px(14.0))
        .rounded(px(3.0))
        .border_1()
        .flex()
        .items_center()
        .justify_center();
    if checked {
        boxed = boxed
            .border_color(theme.link.hsla())
            .bg(theme.link.hsla())
            .text_color(gpui::white())
            .text_size(px(10.0))
            .font_weight(FontWeight::BOLD)
            .child("✓");
    } else {
        boxed = boxed
            .border_color(theme.muted_foreground.with_alpha(0.7))
            .bg(theme.background.hsla());
    }
    boxed.into_any_element()
}

fn render_table(
    header: &[Inlines],
    rows: &[Vec<Inlines>],
    theme: &Theme,
    base: BaseStyle,
) -> AnyElement {
    let header_base = BaseStyle {
        color: theme.muted_foreground.hsla(),
        weight: FontWeight::SEMIBOLD,
        italic: base.italic,
    };
    let body_base = base;
    let columns = header
        .len()
        .max(rows.iter().map(Vec::len).max().unwrap_or(0));

    let header_row = div()
        .flex()
        .bg(theme.muted.with_alpha(0.58))
        .text_size(px(12.0))
        .font_weight(FontWeight::SEMIBOLD)
        .border_b_1()
        .border_color(theme.border.hsla())
        .children((0..columns).map(|column| {
            let cell = header.get(column).map(uppercase).unwrap_or_default();
            div()
                .flex_1()
                .min_w_0()
                .px(px(16.0))
                .py(px(7.0))
                .child(render_inlines(&cell, theme, header_base))
        }));

    let row_count = rows.len();
    let body_rows = rows.iter().enumerate().map(|(index, row)| {
        div()
            .flex()
            .when(index + 1 < row_count, |this| {
                this.border_b_1().border_color(theme.border.hsla())
            })
            .children((0..columns).map(|column| {
                let cell = row.get(column).cloned().unwrap_or_default();
                div()
                    .flex_1()
                    .min_w_0()
                    .px(px(14.0))
                    .py(px(8.0))
                    .child(render_inlines(&cell, theme, body_base))
            }))
    });

    div()
        .my(px(BODY_PX * 1.5))
        .rounded(px(8.0))
        .border_1()
        .border_color(theme.border.hsla())
        .text_size(px(14.0))
        .line_height(relative(1.5))
        .flex()
        .flex_col()
        .child(header_row)
        .children(body_rows)
        .into_any_element()
}

/// One `StyledText` whose runs mirror the inline model: the font family
/// switches to mono for code, weight and style follow strong/emphasis, and
/// links take the link color with a faint underline.
fn render_inlines(inlines: &Inlines, theme: &Theme, base: BaseStyle) -> AnyElement {
    if inlines.text.is_empty() {
        return div().into_any_element();
    }
    let runs: Vec<TextRun> = inlines
        .runs
        .iter()
        .map(|run| {
            let style = run.style;
            let mut font: Font = font(if style.code { FONT_MONO } else { FONT_SANS });
            font.weight = if style.bold {
                FontWeight::SEMIBOLD
            } else if style.link.is_some() && !style.code {
                FontWeight::MEDIUM
            } else {
                base.weight
            };
            font.style = if style.italic || base.italic {
                FontStyle::Italic
            } else {
                FontStyle::Normal
            };

            let mut color = base.color;
            if style.link.is_some() {
                color = theme.link.hsla();
            }
            if style.strikethrough {
                color = theme.muted_foreground.hsla();
            }

            TextRun {
                len: run.range.len(),
                font,
                color,
                background_color: style.code.then(|| theme.muted.with_alpha(0.8)),
                underline: style.link.map(|_| UnderlineStyle {
                    thickness: px(1.0),
                    color: Some(theme.link.with_alpha(0.38)),
                    wavy: false,
                }),
                strikethrough: style.strikethrough.then(|| StrikethroughStyle {
                    thickness: px(1.0),
                    color: Some(theme.muted_foreground.hsla()),
                }),
            }
        })
        .collect();

    StyledText::new(inlines.text.clone())
        .with_runs(runs)
        .into_any_element()
}
