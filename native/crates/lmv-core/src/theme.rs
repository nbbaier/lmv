//! Theme tokens, copied from the `:root` and `.dark` variables in
//! `src/index.html` so the native shell and the browser shell share one
//! palette. Values are HSL in CSS units: hue 0–360, saturation and
//! lightness 0–100.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hsl {
    pub h: f32,
    pub s: f32,
    pub l: f32,
}

const fn hsl(h: f32, s: f32, l: f32) -> Hsl {
    Hsl { h, s, l }
}

/// Which palette the viewer uses. `System` follows the window appearance.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}

impl ThemeMode {
    /// The browser shell cycles system → light → dark → system.
    pub fn next(self) -> ThemeMode {
        match self {
            ThemeMode::System => ThemeMode::Light,
            ThemeMode::Light => ThemeMode::Dark,
            ThemeMode::Dark => ThemeMode::System,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            ThemeMode::System => "System",
            ThemeMode::Light => "Light",
            ThemeMode::Dark => "Dark",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Theme {
    pub background: Hsl,
    pub foreground: Hsl,
    pub primary: Hsl,
    pub primary_foreground: Hsl,
    pub secondary: Hsl,
    pub secondary_foreground: Hsl,
    pub muted: Hsl,
    pub muted_foreground: Hsl,
    pub accent: Hsl,
    pub accent_foreground: Hsl,
    pub border: Hsl,
    pub input: Hsl,
    pub ring: Hsl,
    pub link: Hsl,
    pub is_dark: bool,
}

impl Theme {
    pub const LIGHT: Theme = Theme {
        background: hsl(38.0, 35.0, 98.0),
        foreground: hsl(32.0, 15.0, 14.0),
        primary: hsl(31.0, 14.0, 16.0),
        primary_foreground: hsl(40.0, 40.0, 98.0),
        secondary: hsl(36.0, 24.0, 94.0),
        secondary_foreground: hsl(31.0, 14.0, 18.0),
        muted: hsl(36.0, 22.0, 94.0),
        muted_foreground: hsl(30.0, 7.0, 43.0),
        accent: hsl(35.0, 25.0, 91.0),
        accent_foreground: hsl(31.0, 15.0, 17.0),
        border: hsl(34.0, 16.0, 86.0),
        input: hsl(34.0, 16.0, 82.0),
        ring: hsl(202.0, 48.0, 42.0),
        link: hsl(204.0, 55.0, 38.0),
        is_dark: false,
    };

    pub const DARK: Theme = Theme {
        background: hsl(30.0, 10.0, 9.0),
        foreground: hsl(36.0, 17.0, 90.0),
        primary: hsl(38.0, 20.0, 92.0),
        primary_foreground: hsl(30.0, 13.0, 12.0),
        secondary: hsl(30.0, 8.0, 15.0),
        secondary_foreground: hsl(36.0, 16.0, 90.0),
        muted: hsl(30.0, 8.0, 15.0),
        muted_foreground: hsl(32.0, 8.0, 63.0),
        accent: hsl(30.0, 8.0, 18.0),
        accent_foreground: hsl(36.0, 16.0, 92.0),
        border: hsl(30.0, 7.0, 22.0),
        input: hsl(30.0, 7.0, 28.0),
        ring: hsl(198.0, 45.0, 66.0),
        link: hsl(198.0, 56.0, 68.0),
        is_dark: true,
    };

    /// Resolve a mode against the platform's current appearance.
    pub fn resolve(mode: ThemeMode, system_is_dark: bool) -> Theme {
        match mode {
            ThemeMode::Light => Theme::LIGHT,
            ThemeMode::Dark => Theme::DARK,
            ThemeMode::System => {
                if system_is_dark {
                    Theme::DARK
                } else {
                    Theme::LIGHT
                }
            }
        }
    }
}

/// Font families bundled with the app (see `native/assets/fonts`).
pub const FONT_SANS: &str = "IBM Plex Sans";
pub const FONT_MONO: &str = "JetBrains Mono";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_cycles_like_the_browser_shell() {
        assert_eq!(ThemeMode::System.next(), ThemeMode::Light);
        assert_eq!(ThemeMode::Light.next(), ThemeMode::Dark);
        assert_eq!(ThemeMode::Dark.next(), ThemeMode::System);
    }

    #[test]
    fn system_mode_follows_appearance() {
        assert!(Theme::resolve(ThemeMode::System, true).is_dark);
        assert!(!Theme::resolve(ThemeMode::System, false).is_dark);
        assert!(Theme::resolve(ThemeMode::Dark, false).is_dark);
    }
}
