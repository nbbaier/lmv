//! Markdown model: pulldown-cmark events folded into a block tree that the
//! GPUI renderer walks. Inline content is flattened into one string plus
//! contiguous styled runs, which is exactly the shape GPUI's `StyledText`
//! wants (`with_runs`), so the renderer never re-parses.

use pulldown_cmark::{CodeBlockKind, Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use std::ops::Range;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Document {
    pub blocks: Vec<Block>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Block {
    Heading {
        level: u8,
        inlines: Inlines,
    },
    Paragraph(Inlines),
    CodeBlock {
        language: Option<String>,
        code: String,
    },
    BlockQuote(Vec<Block>),
    List {
        start: Option<u64>,
        items: Vec<ListItem>,
    },
    Table {
        header: Vec<Inlines>,
        rows: Vec<Vec<Inlines>>,
    },
    Rule,
    Html(String),
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ListItem {
    /// `Some` for GFM task items.
    pub checked: Option<bool>,
    pub blocks: Vec<Block>,
}

/// Flattened inline content. `runs` covers `text` exactly, in order.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Inlines {
    pub text: String,
    pub runs: Vec<Run>,
    /// Link destinations referenced by `InlineStyle::link`.
    pub links: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Run {
    pub range: Range<usize>,
    pub style: InlineStyle,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct InlineStyle {
    pub bold: bool,
    pub italic: bool,
    pub code: bool,
    pub strikethrough: bool,
    /// Index into `Inlines::links`.
    pub link: Option<usize>,
}

impl Inlines {
    fn push(&mut self, text: &str, style: InlineStyle) {
        if text.is_empty() {
            return;
        }
        let start = self.text.len();
        self.text.push_str(text);
        let end = self.text.len();
        match self.runs.last_mut() {
            Some(last) if last.style == style && last.range.end == start => last.range.end = end,
            _ => self.runs.push(Run {
                range: start..end,
                style,
            }),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    pub fn plain(text: &str) -> Inlines {
        let mut inlines = Inlines::default();
        inlines.push(text, InlineStyle::default());
        inlines
    }
}

/// Split a leading YAML frontmatter block from the body. The spike does not
/// display frontmatter; the browser shell renders it as a panel.
pub fn split_frontmatter(source: &str) -> (Option<&str>, &str) {
    let rest = source
        .strip_prefix("---\n")
        .or_else(|| source.strip_prefix("---\r\n"));
    let Some(rest) = rest else {
        return (None, source);
    };
    for terminator in ["\n---\n", "\n---\r\n", "\n---"] {
        if let Some(index) = rest.find(terminator) {
            let frontmatter = &rest[..index];
            let body = &rest[index + terminator.len()..];
            if terminator == "\n---" && !body.is_empty() {
                continue;
            }
            return (Some(frontmatter), body);
        }
    }
    (None, source)
}

/// Parse Markdown with the GFM extensions the browser shell enables through
/// `remark-gfm`: tables, strikethrough, and task lists.
pub fn parse(source: &str) -> Document {
    let (_, body) = split_frontmatter(source);
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;
    let mut builder = Builder::default();
    for event in Parser::new_ext(body, options) {
        builder.event(event);
    }
    builder.finish()
}

#[derive(Default)]
struct TableBuilder {
    header: Vec<Inlines>,
    rows: Vec<Vec<Inlines>>,
    current_row: Vec<Inlines>,
    in_head: bool,
}

#[derive(Default)]
struct Builder {
    /// One frame per open block container; the root is index 0.
    blocks: Vec<Vec<Block>>,
    /// Open inline accumulator (paragraph, heading, tight list item, cell).
    inline: Option<Inlines>,
    styles: Vec<InlineStyle>,
    lists: Vec<(Option<u64>, Vec<ListItem>)>,
    item_checked: Vec<Option<bool>>,
    code: Option<(Option<String>, String)>,
    html: Option<String>,
    table: Option<TableBuilder>,
}

impl Builder {
    fn current_style(&self) -> InlineStyle {
        self.styles.last().copied().unwrap_or_default()
    }

    fn push_block(&mut self, block: Block) {
        if self.blocks.is_empty() {
            self.blocks.push(Vec::new());
        }
        self.blocks.last_mut().unwrap().push(block);
    }

    fn open_container(&mut self) {
        if self.blocks.is_empty() {
            self.blocks.push(Vec::new());
        }
        self.blocks.push(Vec::new());
    }

    fn close_container(&mut self) -> Vec<Block> {
        self.blocks.pop().unwrap_or_default()
    }

    fn inline_mut(&mut self) -> &mut Inlines {
        self.inline.get_or_insert_with(Inlines::default)
    }

    fn push_text(&mut self, text: &str) {
        let style = self.current_style();
        self.inline_mut().push(text, style);
    }

    /// Tight list items carry text without a paragraph tag; flush it as one.
    fn flush_implicit_paragraph(&mut self) {
        if let Some(inlines) = self.inline.take() {
            if !inlines.is_empty() {
                self.push_block(Block::Paragraph(inlines));
            }
        }
    }

    fn event(&mut self, event: Event<'_>) {
        if let Some((_, code)) = self.code.as_mut() {
            match event {
                Event::Text(text) => code.push_str(&text),
                Event::End(TagEnd::CodeBlock) => {
                    let (language, mut code) = self.code.take().unwrap();
                    if code.ends_with('\n') {
                        code.pop();
                    }
                    self.push_block(Block::CodeBlock { language, code });
                }
                _ => {}
            }
            return;
        }
        if let Some(html) = self.html.as_mut() {
            match event {
                Event::Html(text) | Event::Text(text) => html.push_str(&text),
                Event::End(TagEnd::HtmlBlock) => {
                    let html = self.html.take().unwrap();
                    self.push_block(Block::Html(html.trim_end().to_string()));
                }
                _ => {}
            }
            return;
        }

        match event {
            Event::Start(tag) => self.start(tag),
            Event::End(tag) => self.end(tag),
            Event::Text(text) => self.push_text(&text),
            Event::Code(text) => {
                let mut style = self.current_style();
                style.code = true;
                self.inline_mut().push(&text, style);
            }
            Event::InlineHtml(text) => self.push_text(&text),
            Event::Html(text) => self.push_block(Block::Html(text.trim_end().to_string())),
            Event::SoftBreak => self.push_text(" "),
            Event::HardBreak => self.push_text("\n"),
            Event::Rule => self.push_block(Block::Rule),
            Event::TaskListMarker(checked) => {
                if let Some(slot) = self.item_checked.last_mut() {
                    *slot = Some(checked);
                }
            }
            Event::FootnoteReference(name) => self.push_text(&format!("[{name}]")),
            Event::InlineMath(text) | Event::DisplayMath(text) => {
                let mut style = self.current_style();
                style.code = true;
                self.inline_mut().push(&text, style);
            }
        }
    }

    fn start(&mut self, tag: Tag<'_>) {
        match tag {
            Tag::Paragraph | Tag::Heading { .. } => {
                self.flush_implicit_paragraph();
                self.inline = Some(Inlines::default());
            }
            Tag::CodeBlock(kind) => {
                self.flush_implicit_paragraph();
                let language = match kind {
                    CodeBlockKind::Fenced(info) => info
                        .split_whitespace()
                        .next()
                        .filter(|language| !language.is_empty())
                        .map(str::to_string),
                    CodeBlockKind::Indented => None,
                };
                self.code = Some((language, String::new()));
            }
            Tag::HtmlBlock => {
                self.flush_implicit_paragraph();
                self.html = Some(String::new());
            }
            Tag::BlockQuote(_) => {
                self.flush_implicit_paragraph();
                self.open_container();
            }
            Tag::List(start) => {
                self.flush_implicit_paragraph();
                self.lists.push((start, Vec::new()));
            }
            Tag::Item => {
                self.open_container();
                self.item_checked.push(None);
            }
            Tag::Table(_) => {
                self.flush_implicit_paragraph();
                self.table = Some(TableBuilder::default());
            }
            Tag::TableHead => {
                if let Some(table) = self.table.as_mut() {
                    table.in_head = true;
                    table.current_row.clear();
                }
            }
            Tag::TableRow => {
                if let Some(table) = self.table.as_mut() {
                    table.current_row.clear();
                }
            }
            Tag::TableCell => self.inline = Some(Inlines::default()),
            Tag::Emphasis => {
                let mut style = self.current_style();
                style.italic = true;
                self.styles.push(style);
            }
            Tag::Strong => {
                let mut style = self.current_style();
                style.bold = true;
                self.styles.push(style);
            }
            Tag::Strikethrough => {
                let mut style = self.current_style();
                style.strikethrough = true;
                self.styles.push(style);
            }
            Tag::Link { dest_url, .. } => {
                let mut style = self.current_style();
                let inlines = self.inline_mut();
                inlines.links.push(dest_url.to_string());
                style.link = Some(inlines.links.len() - 1);
                self.styles.push(style);
            }
            Tag::Image { dest_url, .. } => {
                // The spike has no image loading; show the destination as a link.
                let mut style = self.current_style();
                let inlines = self.inline_mut();
                inlines.links.push(dest_url.to_string());
                style.link = Some(inlines.links.len() - 1);
                style.italic = true;
                self.styles.push(style);
                self.push_text("[image: ");
            }
            _ => {}
        }
    }

    fn end(&mut self, tag: TagEnd) {
        match tag {
            TagEnd::Paragraph => {
                let inlines = self.inline.take().unwrap_or_default();
                self.push_block(Block::Paragraph(inlines));
            }
            TagEnd::Heading(level) => {
                let inlines = self.inline.take().unwrap_or_default();
                let level = match level {
                    HeadingLevel::H1 => 1,
                    HeadingLevel::H2 => 2,
                    HeadingLevel::H3 => 3,
                    HeadingLevel::H4 => 4,
                    HeadingLevel::H5 => 5,
                    HeadingLevel::H6 => 6,
                };
                self.push_block(Block::Heading { level, inlines });
            }
            TagEnd::BlockQuote(_) => {
                self.flush_implicit_paragraph();
                let blocks = self.close_container();
                self.push_block(Block::BlockQuote(blocks));
            }
            TagEnd::Item => {
                self.flush_implicit_paragraph();
                let blocks = self.close_container();
                let checked = self.item_checked.pop().flatten();
                if let Some((_, items)) = self.lists.last_mut() {
                    items.push(ListItem { checked, blocks });
                }
            }
            TagEnd::List(_) => {
                if let Some((start, items)) = self.lists.pop() {
                    self.push_block(Block::List { start, items });
                }
            }
            TagEnd::TableCell => {
                let inlines = self.inline.take().unwrap_or_default();
                if let Some(table) = self.table.as_mut() {
                    table.current_row.push(inlines);
                }
            }
            TagEnd::TableHead => {
                if let Some(table) = self.table.as_mut() {
                    table.header = std::mem::take(&mut table.current_row);
                    table.in_head = false;
                }
            }
            TagEnd::TableRow => {
                if let Some(table) = self.table.as_mut() {
                    let row = std::mem::take(&mut table.current_row);
                    table.rows.push(row);
                }
            }
            TagEnd::Table => {
                if let Some(table) = self.table.take() {
                    self.push_block(Block::Table {
                        header: table.header,
                        rows: table.rows,
                    });
                }
            }
            TagEnd::Emphasis | TagEnd::Strong | TagEnd::Strikethrough | TagEnd::Link => {
                self.styles.pop();
            }
            TagEnd::Image => {
                self.push_text("]");
                self.styles.pop();
            }
            _ => {}
        }
    }

    fn finish(mut self) -> Document {
        self.flush_implicit_paragraph();
        while self.blocks.len() > 1 {
            let blocks = self.close_container();
            self.blocks.last_mut().unwrap().extend(blocks);
        }
        Document {
            blocks: self.blocks.pop().unwrap_or_default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn runs(inlines: &Inlines) -> Vec<(&str, InlineStyle)> {
        inlines
            .runs
            .iter()
            .map(|run| (&inlines.text[run.range.clone()], run.style))
            .collect()
    }

    #[test]
    fn splits_frontmatter() {
        let (frontmatter, body) = split_frontmatter("---\ntitle: x\n---\n# Hi\n");
        assert_eq!(frontmatter, Some("title: x"));
        assert_eq!(body, "# Hi\n");
        assert_eq!(split_frontmatter("# Hi\n"), (None, "# Hi\n"));
    }

    #[test]
    fn flattens_inline_styles_into_runs() {
        let doc =
            parse("Here's **bold**, *italic*, ~~gone~~ and `code` with a [link](https://x.y).");
        let Block::Paragraph(inlines) = &doc.blocks[0] else {
            panic!("expected a paragraph");
        };
        let styles = runs(inlines);
        assert_eq!(styles[0].0, "Here's ");
        assert_eq!(
            styles[1],
            (
                "bold",
                InlineStyle {
                    bold: true,
                    ..Default::default()
                }
            )
        );
        assert_eq!(
            styles[3],
            (
                "italic",
                InlineStyle {
                    italic: true,
                    ..Default::default()
                }
            )
        );
        assert_eq!(
            styles[5].1,
            InlineStyle {
                strikethrough: true,
                ..Default::default()
            }
        );
        assert_eq!(
            styles[7],
            (
                "code",
                InlineStyle {
                    code: true,
                    ..Default::default()
                }
            )
        );
        assert_eq!(
            styles[9],
            (
                "link",
                InlineStyle {
                    link: Some(0),
                    ..Default::default()
                }
            )
        );
        assert_eq!(inlines.links, vec!["https://x.y"]);
        let covered: usize = inlines.runs.iter().map(|run| run.range.len()).sum();
        assert_eq!(covered, inlines.text.len());
    }

    #[test]
    fn builds_nested_lists_with_task_markers() {
        let doc = parse("- [x] done\n- [ ] todo\n  - nested\n");
        let Block::List { start, items } = &doc.blocks[0] else {
            panic!("expected a list");
        };
        assert_eq!(*start, None);
        assert_eq!(items[0].checked, Some(true));
        assert_eq!(items[1].checked, Some(false));
        assert_eq!(
            items[0].blocks,
            vec![Block::Paragraph(Inlines::plain("done"))]
        );
        assert!(matches!(items[1].blocks[1], Block::List { .. }));
    }

    #[test]
    fn captures_fenced_code_language_and_tables() {
        let doc = parse("```rust\nfn main() {}\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
        assert_eq!(
            doc.blocks[0],
            Block::CodeBlock {
                language: Some("rust".into()),
                code: "fn main() {}".into()
            }
        );
        let Block::Table { header, rows } = &doc.blocks[1] else {
            panic!("expected a table");
        };
        assert_eq!(header.len(), 2);
        assert_eq!(rows, &vec![vec![Inlines::plain("1"), Inlines::plain("2")]]);
    }

    #[test]
    fn nests_blockquotes_and_headings() {
        let doc = parse("# Title\n\n> quoted\n>\n> > deeper\n\n---\n");
        assert!(matches!(&doc.blocks[0], Block::Heading { level: 1, .. }));
        let Block::BlockQuote(inner) = &doc.blocks[1] else {
            panic!("expected a blockquote");
        };
        assert!(matches!(inner[1], Block::BlockQuote(_)));
        assert_eq!(doc.blocks[2], Block::Rule);
    }

    #[test]
    fn parses_the_demo_document_without_losing_text() {
        let demo = include_str!("../../../../docs/demo.md");
        let doc = parse(demo);
        assert!(doc.blocks.len() > 20);
        assert!(doc
            .blocks
            .iter()
            .any(|block| matches!(block, Block::Table { .. })));
        assert!(doc
            .blocks
            .iter()
            .any(|block| matches!(block, Block::CodeBlock { language: Some(language), .. } if language == "typescript")));
    }
}
