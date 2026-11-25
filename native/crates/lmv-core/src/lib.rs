//! Platform-independent core of the native lmv viewer.
//!
//! Nothing in this crate depends on GPUI, so every module is unit-testable
//! with plain `cargo test` and reusable by the CLI.

pub mod discovery;
pub mod ipc;
pub mod markdown;
pub mod theme;
