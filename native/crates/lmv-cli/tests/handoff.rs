//! End-to-end check of the CLI half of the handoff: the `lmv` binary resolves
//! inputs and delivers them to whatever listens on the lmv socket.

use lmv_core::ipc::{self, OpenRequest};
use std::path::PathBuf;
use std::process::Command;
use std::sync::mpsc;

fn scratch_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("lmv-cli-{name}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn hands_the_file_set_to_a_listening_app() {
    let dir = scratch_dir("handoff");
    std::fs::write(dir.join("guide.md"), "# Guide").unwrap();
    std::fs::write(dir.join("notes.markdown"), "# Notes").unwrap();
    let socket = dir.join("lmv.sock");
    std::env::set_var("LMV_SOCKET", &socket);

    let (tx, rx) = mpsc::channel::<OpenRequest>();
    let _server = ipc::serve(move |request| tx.send(request).unwrap()).unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_lmv"))
        .args(["guide.md", ".", "--no-launch"])
        .current_dir(&dir)
        .env("LMV_SOCKET", &socket)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    assert!(String::from_utf8_lossy(&output.stdout).contains("Opened 2 file(s)"));

    let request = rx.recv().unwrap();
    let names: Vec<String> = request
        .files
        .iter()
        .map(|file| file.file_name().unwrap().to_string_lossy().to_string())
        .collect();
    assert_eq!(names, vec!["guide.md", "notes.markdown"]);
    assert_eq!(request.cwd, dir.canonicalize().unwrap());

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn fails_clearly_without_a_running_app() {
    let dir = scratch_dir("no-app");
    std::fs::write(dir.join("a.md"), "# A").unwrap();

    let output = Command::new(env!("CARGO_BIN_EXE_lmv"))
        .args(["a.md", "--no-launch"])
        .current_dir(&dir)
        .env("LMV_SOCKET", dir.join("missing.sock"))
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&output.stderr).contains("no viewer is running"));

    std::fs::remove_dir_all(&dir).unwrap();
}

#[test]
fn reports_bad_inputs_and_options() {
    let missing = Command::new(env!("CARGO_BIN_EXE_lmv"))
        .args(["nope.md"])
        .output()
        .unwrap();
    assert_eq!(missing.status.code(), Some(1));
    assert!(String::from_utf8_lossy(&missing.stderr).contains("Input not found: nope.md"));

    let unknown = Command::new(env!("CARGO_BIN_EXE_lmv"))
        .args(["--port", "a.md"])
        .output()
        .unwrap();
    assert_eq!(unknown.status.code(), Some(2));
    assert!(String::from_utf8_lossy(&unknown.stderr).contains("Unknown option '--port'"));

    let help = Command::new(env!("CARGO_BIN_EXE_lmv")).arg("--help").output().unwrap();
    assert!(help.status.success());
    assert!(String::from_utf8_lossy(&help.stdout).contains("Usage: lmv"));
}
