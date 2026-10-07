//! `lmv`: resolve inputs into a file set, then either hand it to the running
//! `lmv-app` over the socket or launch `lmv-app` with the files.

use lmv_core::discovery::resolve_inputs;
use lmv_core::ipc::{self, OpenRequest};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const HELP: &str = "\
lmv - Local Markdown Viewer

Usage: lmv <file-or-directory>... [options]

Options:
  -h, --help       Show this help
  --no-launch      Only hand files to a running app; fail if none is running

The viewer window belongs to `lmv-app`. The CLI connects to it over the lmv
socket (override with LMV_SOCKET) and launches it when nothing is listening
(override the binary with LMV_APP).
";

struct Args {
    inputs: Vec<String>,
    launch: bool,
}

fn parse_args(raw: impl Iterator<Item = String>) -> Result<Args, String> {
    let mut inputs = Vec::new();
    let mut launch = true;
    for arg in raw {
        match arg.as_str() {
            "-h" | "--help" => return Err(HELP.to_string()),
            "--no-launch" => launch = false,
            other if other.starts_with('-') => return Err(format!("Unknown option '{other}'")),
            other => inputs.push(other.to_string()),
        }
    }
    if inputs.is_empty() {
        return Err("No inputs specified".to_string());
    }
    Ok(Args { inputs, launch })
}

fn app_binary() -> PathBuf {
    if let Some(path) = std::env::var_os("LMV_APP") {
        return PathBuf::from(path);
    }
    if let Ok(exe) = std::env::current_exe() {
        let sibling = exe.with_file_name("lmv-app");
        if sibling.exists() {
            return sibling;
        }
    }
    PathBuf::from("lmv-app")
}

fn launch_app(request: &OpenRequest) -> Result<(), String> {
    let binary = app_binary();
    Command::new(&binary)
        .args(&request.files)
        .current_dir(&request.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not launch {}: {error}", binary.display()))
}

fn main() {
    let args = match parse_args(std::env::args().skip(1)) {
        Ok(args) => args,
        Err(message) if message == HELP => {
            print!("{HELP}");
            return;
        }
        Err(message) => {
            eprintln!("lmv: {message}");
            eprintln!("Run `lmv --help` for usage.");
            std::process::exit(2);
        }
    };

    let cwd = std::env::current_dir().unwrap_or_default();
    let files = match resolve_inputs(&cwd, &args.inputs) {
        Ok(files) => files,
        Err(message) => {
            eprintln!("lmv: {message}");
            std::process::exit(1);
        }
    };
    let request = OpenRequest { cwd, files };

    // A running app takes the file set directly.
    if let Ok(reply) = ipc::send_open(&request) {
        if reply.ok {
            println!(
                "Opened {} file(s) in the running viewer",
                request.files.len()
            );
            return;
        }
        eprintln!(
            "lmv: the viewer rejected the request: {}",
            reply.error.unwrap_or_default()
        );
        std::process::exit(1);
    }

    if !args.launch {
        eprintln!(
            "lmv: no viewer is running (socket {})",
            ipc::socket_path().display()
        );
        std::process::exit(1);
    }

    if let Err(message) = launch_app(&request) {
        eprintln!("lmv: {message}");
        std::process::exit(1);
    }

    // The app was given the files as arguments; waiting for its socket only
    // confirms it came up so a failed launch is reported here, not silently.
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if std::os::unix::net::UnixStream::connect(ipc::socket_path()).is_ok() {
            println!("Launched the viewer with {} file(s)", request.files.len());
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    eprintln!("lmv: launched the viewer but it did not start listening within 5s");
    std::process::exit(1);
}
