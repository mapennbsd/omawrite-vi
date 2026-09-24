# Omawrite-vi Coding Guidelines

Omawrite-vi is a Markdown editor fork built with Qt 6 Quick (QML) and C++,
adding vi-style editing to the original omawrite.

## Source Layout

- `src/main.cpp` - Application entry point, sets up Qt engine and loads Main.qml
- `src/backend.{h,cpp}` - C++ backend handling file I/O, dialogs, theme
- `src/systemtheme.{h,cpp}` - System dark/light mode and text scale detection
- `src/markdownhighlighter.{h,cpp}` - Markdown syntax highlighting
- `src/Main.qml` - Main UI with TextEdit (id "editor") and key handling
- `src/EditorMutations.js` - Text manipulation helpers (replaceRange, etc.)
- `src/resources.qrc` - QRC resource file bundling QML/JS assets

## Building and Testing

- Build: `bin/build` → produces `build/omawrite-vi`
- Test: `bin/test` → runs `tst_omawrite` unit tests
- Vi mode: spec in `docs/vi-spec.md`; tests with
  `node --test tests/vi/vimode.test.js` (no Qt needed, runs in seconds)

## QML Resource Management

QML/JS files are bundled via `src/resources.qrc`. Adding a new file requires:
1. Add the file entry to `src/resources.qrc`
2. Rebuild with `bin/build`

## Editor Key Handling

Key handling lives in:
- `src/Main.qml` lines 734-771: `Keys.onPressed` handler for the editor
- `src/EditorMutations.js`: Text mutation utilities called from Main.qml

## Rules

- Keep vi logic in `src/ViMode.js` (new file)
- Keep Main.qml changes minimal; delegate to ViMode.js for vi behavior
- Never edit tests to make them pass
- Do not run `git commit` or `git push`
