//! Bridge from the shared theme tokens to GPUI colors.

use gpui::{hsla, Hsla};
use lmv_core::theme::Hsl;

pub trait ToHsla {
    fn hsla(self) -> Hsla;
    fn with_alpha(self, alpha: f32) -> Hsla;
}

impl ToHsla for Hsl {
    fn hsla(self) -> Hsla {
        hsla(self.h / 360.0, self.s / 100.0, self.l / 100.0, 1.0)
    }

    fn with_alpha(self, alpha: f32) -> Hsla {
        hsla(self.h / 360.0, self.s / 100.0, self.l / 100.0, alpha)
    }
}
