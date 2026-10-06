# lmv is a read-only viewer

lmv began as a viewer that could also edit and save Markdown files, with autosave. In 0.3.0 we removed all editing so that lmv never modifies the Markdown files it opens. Editing belongs in the user's own editor, and lmv's job is to view. Supporting editing also meant maintaining save, autosave, and unsaved-change state, plus resolving conflicts when a file changed on disk while it was being edited. That cost outweighed the convenience of editing in the viewer.

## Consequences

- When a document changes on disk, lmv reloads it immediately; there are no unsaved edits to protect.
- Switching documents never prompts to save.
- lmv still writes its own data (the last document and UI preferences), and Gist sharing still sends the loaded content. Neither touches the Markdown files.
- Stale `lmv-autosave` preferences in existing browsers are deliberately ignored, not migrated.
- Proposals to add in-viewer editing reopen this decision; they are not small feature additions.
