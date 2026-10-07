//! The CLI-to-app protocol: one JSON line over a Unix domain socket.
//!
//! The app listens on [`socket_path`]. The CLI connects, writes one
//! [`OpenRequest`] followed by a newline, and reads one [`OpenReply`] line.
//! If nothing is listening the CLI launches the app itself.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::thread::JoinHandle;

/// Ask a running app to show these files. Paths are absolute. An empty
/// `files` only activates the app (a second `lmv-app` launched with no
/// arguments sends that), it never clears the current file set.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpenRequest {
    /// Working directory of the CLI, used as the key for the last document.
    pub cwd: PathBuf,
    /// The file set, in discovery order.
    pub files: Vec<PathBuf>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OpenReply {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Where the app listens. `LMV_SOCKET` overrides it, which the tests and
/// multiple side-by-side builds rely on.
pub fn socket_path() -> PathBuf {
    if let Some(path) = std::env::var_os("LMV_SOCKET") {
        return PathBuf::from(path);
    }
    if let Some(runtime_dir) = std::env::var_os("XDG_RUNTIME_DIR") {
        return PathBuf::from(runtime_dir).join("lmv.sock");
    }
    let user = std::env::var("USER").unwrap_or_else(|_| "default".to_string());
    std::env::temp_dir().join(format!("lmv-{user}.sock"))
}

/// Client side: deliver one request to a running app.
pub fn send_open(request: &OpenRequest) -> std::io::Result<OpenReply> {
    let mut stream = UnixStream::connect(socket_path())?;
    let mut line = serde_json::to_string(request)?;
    line.push('\n');
    stream.write_all(line.as_bytes())?;
    stream.flush()?;

    let mut reader = BufReader::new(stream);
    let mut reply = String::new();
    reader.read_line(&mut reply)?;
    let reply: OpenReply = serde_json::from_str(reply.trim_end())?;
    Ok(reply)
}

/// Server side: accept requests on a background thread and hand each one to
/// `handler`. A stale socket file from a crashed app is removed first.
pub fn serve(handler: impl Fn(OpenRequest) + Send + 'static) -> std::io::Result<JoinHandle<()>> {
    let path = socket_path();
    if path.exists() {
        if UnixStream::connect(&path).is_ok() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::AddrInUse,
                format!("another lmv app is listening on {}", path.display()),
            ));
        }
        std::fs::remove_file(&path)?;
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let listener = UnixListener::bind(&path)?;

    Ok(std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let mut reader = BufReader::new(&stream);
            let mut line = String::new();
            if reader.read_line(&mut line).is_err() {
                continue;
            }
            let reply = match serde_json::from_str::<OpenRequest>(line.trim_end()) {
                Ok(request) => {
                    handler(request);
                    OpenReply {
                        ok: true,
                        error: None,
                    }
                }
                Err(error) => OpenReply {
                    ok: false,
                    error: Some(format!("invalid request: {error}")),
                },
            };
            let mut writer = &stream;
            if let Ok(mut text) = serde_json::to_string(&reply) {
                text.push('\n');
                let _ = writer.write_all(text.as_bytes());
            }
        }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn round_trips_a_request_over_the_socket() {
        let socket = std::env::temp_dir().join(format!("lmv-ipc-test-{}.sock", std::process::id()));
        std::env::set_var("LMV_SOCKET", &socket);

        let (tx, rx) = mpsc::channel();
        let _server = serve(move |request| {
            tx.send(request).unwrap();
        })
        .unwrap();

        let request = OpenRequest {
            cwd: PathBuf::from("/tmp"),
            files: vec![PathBuf::from("/tmp/a.md")],
        };
        let reply = send_open(&request).unwrap();
        assert!(reply.ok);
        assert_eq!(rx.recv().unwrap(), request);

        let _ = std::fs::remove_file(&socket);
    }
}
