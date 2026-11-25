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
use std::ffi::OsString;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
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

struct SocketLocation {
    path: PathBuf,
    /// True when `lmv` owns the socket's immediate parent directory (`.../lmv`)
    /// and should enforce mode 0700 on it. False for caller-supplied
    /// `LMV_SOCKET` overrides so `lmv` never chmods a shared directory.
    owned_parent: bool,
}

fn non_empty(value: Option<OsString>) -> Option<OsString> {
    value.filter(|v| !v.is_empty())
}

fn resolve_socket_location(
    lmv_socket: Option<OsString>,
    xdg_runtime_dir: Option<OsString>,
    home: Option<OsString>,
) -> std::io::Result<SocketLocation> {
    if let Some(path) = non_empty(lmv_socket) {
        return Ok(SocketLocation {
            path: PathBuf::from(path),
            owned_parent: false,
        });
    }
    if let Some(runtime_dir) = non_empty(xdg_runtime_dir) {
        return Ok(SocketLocation {
            path: PathBuf::from(runtime_dir).join("lmv").join("lmv.sock"),
            owned_parent: true,
        });
    }
    if let Some(home) = non_empty(home) {
        return Ok(SocketLocation {
            path: PathBuf::from(home)
                .join(".local")
                .join("state")
                .join("lmv")
                .join("lmv.sock"),
            owned_parent: true,
        });
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "cannot determine socket path: set LMV_SOCKET, XDG_RUNTIME_DIR, or HOME",
    ))
}

/// Where the app listens. `LMV_SOCKET` overrides it, which the tests and
/// multiple side-by-side builds rely on. Otherwise the socket lives in a
/// dedicated `lmv` subdirectory only this user can enter:
/// `$XDG_RUNTIME_DIR/lmv/lmv.sock`, else `~/.local/state/lmv/lmv.sock`
/// (created with mode 0700). A shared temporary directory is never used; if
/// none of those environment variables are set, this returns an error.
pub fn socket_path() -> std::io::Result<PathBuf> {
    resolve_socket_location(
        std::env::var_os("LMV_SOCKET"),
        std::env::var_os("XDG_RUNTIME_DIR"),
        std::env::var_os("HOME"),
    )
    .map(|location| location.path)
}

/// Client side: deliver one request to the app listening on the default path.
pub fn send_open(request: &OpenRequest) -> std::io::Result<OpenReply> {
    send_open_to(&socket_path()?, request)
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
    let location = resolve_socket_location(
        std::env::var_os("LMV_SOCKET"),
        std::env::var_os("XDG_RUNTIME_DIR"),
        std::env::var_os("HOME"),
    )?;
    serve_with_location(&location, handler)
}

fn serve_with_location(
    location: &SocketLocation,
    handler: impl Fn(OpenRequest) + Send + Sync + 'static,
) -> std::io::Result<JoinHandle<()>> {
    if location.owned_parent {
        if let Some(parent) = location.path.parent() {
            std::fs::create_dir_all(parent)?;
            let metadata = std::fs::symlink_metadata(parent)?;
            if !metadata.is_dir() {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    format!(
                        "socket directory {} is not a real directory",
                        parent.display()
                    ),
                ));
            }
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))?;
        }
    }
    serve_at(&location.path, handler)
}

/// Server side: take ownership of `path` and hand each request to `handler`
/// from a background thread. Returns `AddrInUse` when another app owns it.
pub fn serve_at(
    path: &Path,
    handler: impl Fn(OpenRequest) + Send + Sync + 'static,
) -> std::io::Result<JoinHandle<()>> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }

    // The lock decides ownership; the socket file is only ever touched by
    // the holder, so a stale file can be removed without racing a live app.
    // Open without truncation or following symlinks so a pre-planted lock
    // symlink cannot clobber another file.
    let lock = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .custom_flags(libc::O_NOFOLLOW)
        .open(lock_path(path))?;
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
        let override_loc =
            resolve_socket_location(Some(OsString::from("/custom/lmv.sock")), None, None).unwrap();
        assert_eq!(override_loc.path, PathBuf::from("/custom/lmv.sock"));
        assert!(!override_loc.owned_parent);

        let runtime_loc =
            resolve_socket_location(None, Some(OsString::from("/run/user/1000")), None).unwrap();
        assert_eq!(runtime_loc.path, PathBuf::from("/run/user/1000/lmv/lmv.sock"));
        assert!(runtime_loc.owned_parent);

        let home_loc =
            resolve_socket_location(None, None, Some(OsString::from("/Users/alice"))).unwrap();
        assert_eq!(
            home_loc.path,
            PathBuf::from("/Users/alice/.local/state/lmv/lmv.sock")
        );
        assert!(home_loc.owned_parent);

        let missing = resolve_socket_location(None, None, None);
        assert!(missing.is_err());
        assert_eq!(
            missing.err().unwrap().kind(),
            std::io::ErrorKind::NotFound
        );

        let empty = resolve_socket_location(
            Some(OsString::new()),
            Some(OsString::new()),
            Some(OsString::new()),
        );
        assert!(empty.is_err());
    }

    #[test]
    fn owned_socket_dir_is_chmodded_but_unowned_parent_is_left_alone() {
        let base = std::env::temp_dir().join(format!("lmv-ipc-perms-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        std::fs::set_permissions(&base, std::fs::Permissions::from_mode(0o755)).unwrap();

        let owned = SocketLocation {
            path: base.join("lmv").join("lmv.sock"),
            owned_parent: true,
        };
        let _server = serve_with_location(&owned, |_| {}).unwrap();
        let lmv_mode = std::fs::metadata(base.join("lmv"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        let base_mode = std::fs::metadata(&base).unwrap().permissions().mode() & 0o777;
        assert_eq!(lmv_mode, 0o700);
        assert_eq!(base_mode, 0o755);

        let unowned = SocketLocation {
            path: base.join("direct.sock"),
            owned_parent: false,
        };
        let _server2 = serve_with_location(&unowned, |_| {}).unwrap();
        let base_mode_after = std::fs::metadata(&base).unwrap().permissions().mode() & 0o777;
        assert_eq!(base_mode_after, 0o755);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn refuses_a_symlink_at_the_lock_path() {
        let socket = scratch_socket("symlink-lock");
        let lock = lock_path(&socket);
        let target = socket.parent().unwrap().join("victim.txt");
        std::fs::write(&target, "precious").unwrap();
        let _ = std::fs::remove_file(&lock);
        std::os::unix::fs::symlink(&target, &lock).unwrap();

        assert!(serve_at(&socket, |_| {}).is_err());
        assert_eq!(std::fs::read_to_string(&target).unwrap(), "precious");
    }
}
