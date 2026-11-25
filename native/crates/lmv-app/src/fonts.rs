//! Bundle the same families the browser shell loads from Google Fonts, so the
//! native window renders identically without a network or system install.

use gpui::App;
use std::borrow::Cow;

macro_rules! font {
    ($name:literal) => {
        Cow::Borrowed(include_bytes!(concat!("../../../assets/fonts/", $name)) as &[u8])
    };
}

pub fn load(cx: &App) {
    let fonts = vec![
        font!("IBMPlexSans-Regular.ttf"),
        font!("IBMPlexSans-Italic.ttf"),
        font!("IBMPlexSans-Medium.ttf"),
        font!("IBMPlexSans-MediumItalic.ttf"),
        font!("IBMPlexSans-SemiBold.ttf"),
        font!("IBMPlexSans-Bold.ttf"),
        font!("JetBrainsMono-Regular.ttf"),
        font!("JetBrainsMono-Medium.ttf"),
        font!("JetBrainsMono-Italic.ttf"),
    ];
    if let Err(error) = cx.text_system().add_fonts(fonts) {
        eprintln!("lmv-app: could not load bundled fonts: {error}");
    }
}
