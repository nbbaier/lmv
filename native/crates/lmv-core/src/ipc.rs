//! The CLI-to-app protocol: one JSON line over a Unix domain socket.
//!
//! The app listens on [`socket_path`]. The CLI connects, writes one
//! [`OpenRequest`] followed by a newline, and reads one [`OpenReply`] line.
//! If nothing is listening the CLI launches the app itself.
//!
//! Ownership of the socket is decided by an advisory lock on a sibling
//! `lmv.lock` file, held for the lifetime of the listener. Only the lock
//! holder removes a stale socket file and binds, so two apps starting at
//! once cannot clobber each other's socket; the loser sees `AddrInUse` and
//! hands its files to the winner.

use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::io::AsRawFd;
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::{Path, PathBuf};
use std::thread::JoinHandle;
use std::time::Duration;

/// Longest request line the app reads; anything longer is rejected.
const MAX_REQUEST_BYTES: u64 = 1024 * 1024;
/// How long either side waits on a peer before giving up on it.
const PEER_TIMEOUT: Duration = Duration::from_secs(5);

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
/// multiple side-by-side builds rely on. Otherwise the socket lives in a
/// directory only this user can enter: `$XDG_RUNTIME_DIR`, else
/// `~/.local/state/lmv` (created with mode 0700). A shared temporary
/// directory is never used, so no other local user can plant a listener.
pub fn socket_path() -> PathBuf {
    if let Some(path) = std::env::var_os("LMV_SOCKET") {
        return PathBuf::from(path);
    }
    if let Some(runtime_dir) = std::env::var_os("XDG_RUNTIME_DIR") {
        return PathBuf::from(runtime_dir).join("lmv.sock");
    }
    if let Some(home) = std::env::var_os("HOME") {
        return PathBuf::from(home)
            .join(".local")
            .join("state")
            .join("lmv")
            .join("lmv.sock");
    }
    std::env::temp_dir().join(format!("lmv-{}.sock", std::process::id()))
}

/// Client side: deliver one request to the app listening on the default path.
pub fn send_open(request: &OpenRequest) -> std::io::Result<OpenReply> {
    send_open_to(&socket_path(), request)
}

/// Client side: deliver one request to the app listening on `path`.
pub fn send_open_to(path: &Path, request: &OpenRequest) -> std::io::Result<OpenReply> {
    let mut stream = UnixStream::connect(path)?;
    stream.set_read_timeout(Some(PEER_TIMEOUT))?;
    stream.set_write_timeout(Some(PEER_TIMEOUT))?;
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

/// Server side: accept requests on the default path.
pub fn serve(
    handler: impl Fn(OpenRequest) + Send + Sync + 'static,
) -> std::io::Result<JoinHandle<()>> {
    serve_at(&socket_path(), handler)
}

/// Server side: take ownership of `path` and hand each request to `handler`
/// from a background thread. Returns `AddrInUse` when another app owns it.
pub fn serve_at(
    path: &Path,
    handler: impl Fn(OpenRequest) + Send + Sync + 'static,
) -> std::io::Result<JoinHandle<()>> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
        if std::env::var_os("LMV_SOCKET").is_none() {
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))?;
        }
    }

    // The lock decides ownership; the socket file is only ever touched by
    // the holder, so a stale file can be removed without racing a live app.
    let lock = File::create(lock_path(path))?;
    if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
        return Err(std::io::Error::new(
            std::io::ErrorKind::AddrInUse,
            format!("another lmv app owns {}", path.display()),
        ));
    }
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    let listener = UnixListener::bind(path)?;
    let handler = std::sync::Arc::new(handler);

    Ok(std::thread::spawn(move || {
        // Keep the lock for as long as the listener lives.
        let _lock = lock;
        for stream in listener.incoming() {
            let Ok(stream) = stream else { continue };
            let handler = handler.clone();
            // One thread per peer, so a stalled peer never blocks the next.
            std::thread::spawn(move || handle_peer(stream, &*handler));
        }
    }))
}

fn lock_path(socket: &Path) -> PathBuf {
    socket.with_extension("lock")
}

fn handle_peer(stream: UnixStream, handler: &dyn Fn(OpenRequest)) {
    let _ = stream.set_read_timeout(Some(PEER_TIMEOUT));
    let _ = stream.set_write_timeout(Some(PEER_TIMEOUT));

    let mut reader = BufReader::new((&stream).take(MAX_REQUEST_BYTES));
    let mut line = String::new();
    let reply = match reader.read_line(&mut line) {
        Ok(_) if !line.ends_with('\n') => OpenReply {
            ok: false,
            error: Some("request must be one newline-terminated line of at most 1 MiB".into()),
        },
        Ok(_) => match serde_json::from_str::<OpenRequest>(line.trim_end()) {
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
        },
        Err(error) => OpenReply {
            ok: false,
            error: Some(format!("could not read request: {error}")),
        },
    };

    let mut writer = &stream;
    if let Ok(mut text) = serde_json::to_string(&reply) {
        text.push('\n');
        let _ = writer.write_all(text.as_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    fn scratch_socket(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("lmv-ipc-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("lmv.sock")
    }

    fn request() -> OpenRequest {
        OpenRequest {
            cwd: PathBuf::from("/tmp"),
            files: vec![PathBuf::from("/tmp/a.md")],
        }
    }

    #[test]
    fn round_trips_a_request_over_the_socket() {
        let socket = scratch_socket("round-trip");
        let (tx, rx) = mpsc::channel();
        let _server = serve_at(&socket, move |request| tx.send(request).unwrap()).unwrap();

        let reply = send_open_to(&socket, &request()).unwrap();
        assert!(reply.ok);
        assert_eq!(rx.recv().unwrap(), request());
    }

    #[test]
    fn second_server_sees_the_socket_as_owned() {
        let socket = scratch_socket("owned");
        let _first = serve_at(&socket, |_| {}).unwrap();
        let error = serve_at(&socket, |_| {}).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::AddrInUse);
        // The first server still answers.
        assert!(send_open_to(&socket, &request()).unwrap().ok);
    }

    #[test]
    fn stale_socket_file_is_replaced() {
        let socket = scratch_socket("stale");
        std::fs::write(&socket, "not a socket").unwrap();
        let _server = serve_at(&socket, |_| {}).unwrap();
        assert!(send_open_to(&socket, &request()).unwrap().ok);
    }

    #[test]
    fn a_stalled_peer_does_not_block_others() {
        let socket = scratch_socket("stalled");
        let _server = serve_at(&socket, |_| {}).unwrap();
        // Connect and never send anything.
        let _idle = UnixStream::connect(&socket).unwrap();
        let reply = send_open_to(&socket, &request()).unwrap();
        assert!(reply.ok);
    }

    #[test]
    fn rejects_malformed_and_oversized_requests() {
        let socket = scratch_socket("malformed");
        let _server = serve_at(&socket, |_| panic!("handler must not run")).unwrap();

        let mut stream = UnixStream::connect(&socket).unwrap();
        stream.write_all(b"{\"nope\":1}\n").unwrap();
        let mut reply = String::new();
        BufReader::new(&stream).read_line(&mut reply).unwrap();
        let reply: OpenReply = serde_json::from_str(reply.trim_end()).unwrap();
        assert!(!reply.ok);
        assert!(reply.error.unwrap().starts_with("invalid request"));

        let mut stream = UnixStream::connect(&socket).unwrap();
        let oversized = vec![b'x'; MAX_REQUEST_BYTES as usize + 1];
        stream.write_all(&oversized).unwrap();
        let mut reply = String::new();
        BufReader::new(&stream).read_line(&mut reply).unwrap();
        let reply: OpenReply = serde_json::from_str(reply.trim_end()).unwrap();
        assert!(!reply.ok);
        assert!(reply.error.unwrap().contains("at most 1 MiB"));
    }

    #[test]
    fn default_path_never_falls_into_a_shared_temp_dir() {
        // With the override unset the path is under the runtime dir or HOME,
        // both private to the user.
        if std::env::var_os("LMV_SOCKET").is_some() {
            return;
        }
        let path = socket_path();
        let runtime = std::env::var_os("XDG_RUNTIME_DIR").map(PathBuf::from);
        let home = std::env::var_os("HOME").map(PathBuf::from);
        assert!(
            runtime.map(|dir| path.starts_with(dir)).unwrap_or(false)
                || home.map(|dir| path.starts_with(dir)).unwrap_or(false)
        );
    }
}
