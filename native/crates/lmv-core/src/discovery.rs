//! Discovery: turning inputs into the file set.
//!
//! The spike supports explicit files and shallow directories. Globs,
//! `--recursive`, hidden-file and git-ignore filtering are listed in the
//! design document as later work.

use std::path::{Path, PathBuf};

/// True when the path has a Markdown extension, matched case-insensitively.
pub fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext = ext.to_ascii_lowercase();
            ext == "md" || ext == "markdown"
        })
        .unwrap_or(false)
}

/// Resolve inputs against `cwd` into an absolute, de-duplicated file set.
///
/// A missing explicit input is an error, as in the TypeScript CLI. A directory
/// contributes its direct Markdown children in name order.
pub fn resolve_inputs(cwd: &Path, inputs: &[String]) -> Result<Vec<PathBuf>, String> {
    if inputs.is_empty() {
        return Err("No inputs specified".to_string());
    }

    let mut files: Vec<PathBuf> = Vec::new();
    for input in inputs {
        let requested = cwd.join(input);
        let path = requested
            .canonicalize()
            .map_err(|_| format!("Input not found: {input}"))?;

        if path.is_dir() {
            let mut children: Vec<PathBuf> = std::fs::read_dir(&path)
                .map_err(|error| format!("Cannot read directory {input}: {error}"))?
                .filter_map(|entry| entry.ok().map(|entry| entry.path()))
                .filter(|child| child.is_file() && is_markdown_file(child))
                .filter(|child| !is_hidden(child))
                .collect();
            children.sort();
            files.extend(children);
        } else if path.is_file() {
            // Judge the name the user gave, not the symlink target, so
            // `alias.md -> notes` opens just as a directory scan would list it.
            if !is_markdown_file(&requested) {
                return Err(format!("Not a Markdown file: {input}"));
            }
            files.push(path);
        } else {
            return Err(format!("Input not found: {input}"));
        }
    }

    files.dedup();
    let mut seen = std::collections::HashSet::new();
    files.retain(|file| seen.insert(file.clone()));

    if files.is_empty() {
        return Err("No Markdown files found".to_string());
    }
    Ok(files)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognises_markdown_extensions_case_insensitively() {
        assert!(is_markdown_file(Path::new("a.md")));
        assert!(is_markdown_file(Path::new("a.MARKDOWN")));
        assert!(!is_markdown_file(Path::new("a.txt")));
        assert!(!is_markdown_file(Path::new("md")));
    }

    #[test]
    fn rejects_empty_inputs() {
        let error = resolve_inputs(Path::new("."), &[]).unwrap_err();
        assert_eq!(error, "No inputs specified");
    }

    #[test]
    fn rejects_missing_inputs() {
        let error = resolve_inputs(Path::new("."), &["does-not-exist.md".into()]).unwrap_err();
        assert_eq!(error, "Input not found: does-not-exist.md");
    }

    #[test]
    fn judges_markdown_by_the_supplied_name_not_the_symlink_target() {
        let dir = std::env::temp_dir().join(format!("lmv-core-symlink-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("notes"), "# extensionless").unwrap();
        std::os::unix::fs::symlink(dir.join("notes"), dir.join("alias.md")).unwrap();

        let direct = resolve_inputs(&dir, &["alias.md".into()]).unwrap();
        assert_eq!(direct, vec![dir.join("notes").canonicalize().unwrap()]);

        // A scan lists the alias by its own name, which is what the sidebar shows.
        let scanned = resolve_inputs(&dir, &[".".into()]).unwrap();
        assert_eq!(scanned, vec![dir.canonicalize().unwrap().join("alias.md")]);

        let error = resolve_inputs(&dir, &["notes".into()]).unwrap_err();
        assert_eq!(error, "Not a Markdown file: notes");

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn lists_shallow_directory_children_in_name_order() {
        let dir = std::env::temp_dir().join(format!("lmv-core-discovery-{}", std::process::id()));
        let nested = dir.join("nested");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::write(dir.join("b.md"), "# b").unwrap();
        std::fs::write(dir.join("a.markdown"), "# a").unwrap();
        std::fs::write(dir.join(".hidden.md"), "# hidden").unwrap();
        std::fs::write(dir.join("notes.txt"), "no").unwrap();
        std::fs::write(nested.join("deep.md"), "# deep").unwrap();

        let files = resolve_inputs(&dir, &[".".into()]).unwrap();
        let names: Vec<_> = files
            .iter()
            .map(|file| file.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["a.markdown", "b.md"]);

        std::fs::remove_dir_all(&dir).unwrap();
    }
}
