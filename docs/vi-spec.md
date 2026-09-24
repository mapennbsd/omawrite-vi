# Vi mode — phase 1 spec

Phase 1 adds normal and insert modes with basic motions and edits. Visual mode,
operators with motions (`dw`, `cw`), yank/put, `.` and `:` commands are later
phases and are out of scope here.

The work is split in two:

- `src/ViMode.js` — pure logic. Given the text, the cursor and one key, it says
  what should happen. No Qt, no DOM, no Node APIs. Tested with
  `node --test tests/vi/vimode.test.js`.
- `src/Main.qml` — applies the result to the real `TextEdit` (see
  "Integration" below). Checked by building and trying it.

## Model

- `text` is the whole document as a string; lines are separated by `"\n"`.
  A trailing `"\n"` means there is an empty last line.
- `cursor` is an index into `text` (0..text.length), the same as
  `TextEdit.cursorPosition`.
- In **normal** mode the cursor sits *on* a character: the block cursor covers
  `text[cursor]`. It may never sit on the `"\n"` that ends a non-empty line, or
  at `text.length` when the last line is non-empty. On an empty line it sits on
  that line's `"\n"` (or at `text.length` if the empty line is last).
- In **insert** mode the cursor is between characters, as in any text editor.

## API

`src/ViMode.js` exports exactly these three functions.

### `createState()`

Returns a fresh state object:

```js
{ mode: "normal", count: "", pending: "" }
```

- `count` — digits typed so far (`"12"` for `12j`), `""` when none.
- `pending` — first key of an unfinished two-key command (`"g"` or `"d"`), `""`
  when none.

### `handleKey(state, text, cursor, key)`

Processes one key. **Never mutates `state`**; returns a new state in the result.

`key` is one of:

- a single printable character: `"h"`, `"G"`, `"$"`, `"0"`, `" "` …
- a named key: `"Escape"`, `"Return"`, `"Backspace"`, `"Delete"`, `"Tab"`,
  `"C-r"` (Ctrl+R).

Returns:

```js
{
  handled: true,        // false = caller should let the key through untouched
  state:   { ... },     // new state
  edit:    null,        // or { start, end, text }: replace text.slice(start, end) with text
  cursor:  12,          // cursor position after the edit has been applied
  action:  null         // or { type, count }, see "Actions"
}
```

When `handled` is `false`, `state` is unchanged, `edit` and `action` are `null`
and `cursor` equals the input cursor.

At most one edit is returned per key. `cursor` always refers to the text
*after* the edit.

### `clampNormal(text, pos)`

Returns `pos` moved to the nearest legal normal-mode position on the same line:
if `pos` is on the `"\n"` ending a non-empty line, or at `text.length` after a
non-empty last line, it moves back one character. Otherwise `pos` is returned
unchanged (also clamped into `0..text.length`). `clampNormal("", 0)` is `0`.

## Insert mode

- `"Escape"` → switch to normal mode. The cursor moves one character left,
  unless it is already at the start of its line.
- Every other key → `handled: false`. The existing editor handles typing.

## Normal mode

Every key is handled (`handled: true`) and never inserts text, except the
"pass-through" keys listed below.

### Counts

Digits `1`–`9` start a count; `0` extends a count that has already started
(otherwise `0` is the "start of line" motion). The count applies to the next
command and is then cleared. Without a count, commands behave as count 1.
`Escape` clears any count and pending key.

### Entering insert mode (counts are ignored)

| Key | Cursor goes to |
|---|---|
| `i` | stays (insert before the character under the cursor) |
| `a` | one right (after the character); stays on an empty line |
| `I` | first non-blank character of the line |
| `A` | end of line (just before its `"\n"`, or `text.length`) |
| `o` | opens a new empty line below: edit inserts `"\n"` at the end of the current line; cursor on the new line |
| `O` | opens a new empty line above: edit inserts `"\n"` at the start of the current line; cursor at the start of the new (empty) line |

No autoindent and no Markdown list continuation for `o`/`O` in phase 1.

### Motions

"Blank" means space or tab. A line's "first non-blank" is its first character
that is not blank; on an all-blank or empty line it is the last legal normal
position on that line.

| Key | Moves to |
|---|---|
| `h` | count characters left, stopping at the start of the line |
| `l` | count characters right, stopping at the last character of the line |
| `0` | start of line |
| `^` | first non-blank of line |
| `$` | last character of the line; with a count, of the line count−1 lines down |
| `w` | start of next word (count times) |
| `b` | start of previous word (count times) |
| `e` | end of word (count times) |
| `gg` | first non-blank of line *count* (1-based, default line 1) |
| `G` | first non-blank of line *count* (default: last line) |
| `j` / `k` | down / up count **screen** lines — returned as an action (see below) |

`h` and `l` never cross a line break. Counts larger than possible stop at the
boundary. Line numbers past the end go to the last line.

**Words** (same as vim's default): a word is either a run of word characters
(letters, digits, `_`) or a run of other non-blank characters (punctuation).
Blanks and line breaks separate words. An empty line counts as a word.

- `w` goes to the start of the next word, skipping blanks and line breaks; it
  stops on an empty line. If there is no next word it goes to the last
  character of the text.
- `e` moves at least one character, skips blanks, line breaks and empty lines,
  then goes to the last character of that word.
- `b` moves at least one character back, skips blanks and line breaks (stopping
  on an empty line), then goes to the first character of that word.

### Edits

| Key | Does |
|---|---|
| `x` | deletes count characters under and after the cursor, never past the end of the line; no-op on an empty line. The cursor stays, then is clamped with `clampNormal` |
| `Delete` | same as `x` |
| `dd` | deletes count whole lines, starting with the current one (fewer if the text runs out). Cursor goes to the first non-blank of the line that is now at that position, or of the new last line if the deleted lines were at the end. Deleting every line leaves `""` |

For `dd`, the edit removes each line *with* its following `"\n"`; when the
deleted lines include the last line, it removes the `"\n"` *before* them
instead.

### Actions

Some commands need the real editor, so `handleKey` returns an `action` and
leaves `cursor` and the text unchanged:

| Key | action |
|---|---|
| `j` | `{ type: "screenLine", count: n }` |
| `k` | `{ type: "screenLine", count: -n }` |
| `u` | `{ type: "undo", count: n }` |
| `C-r` | `{ type: "redo", count: n }` |

`n` is the count (default 1).

### Two-key commands

`g` and `d` set `pending`. The next key completes the command (`gg`, `dd`). Any
other key cancels it silently: no movement, no edit, count and pending cleared.

### Other keys

- `"Return"`, `"Backspace"`, `"Tab"`, and any printable key not listed in this
  spec: handled, do nothing, clear count and pending.
- Pass-through: the caller never sends arrow keys, Home/End, PageUp/PageDown or
  Ctrl/Alt/Meta shortcuts (other than Ctrl+R) to `handleKey`; they keep their
  existing behavior.

## Module format

The file is loaded both by QML (`import "ViMode.js" as ViMode`) and by Node
(`require`). So:

- No `.pragma library` line (it is a syntax error in Node).
- No `import`, `require`, or Node/browser globals.
- Declare the three functions at the top level and end the file with:

```js
if (typeof module !== "undefined")
    module.exports = { createState: createState, handleKey: handleKey, clampNormal: clampNormal };
```

## Tests

- `tests/vi/cases.json` — keystroke cases. `|` in `text` and `expect` marks the
  cursor (it sits just before the character under the block cursor). Cases
  without `"nvim": false` have been checked against real nvim.
- `tests/vi/vimode.test.js` — runs the cases plus API checks:
  `node --test tests/vi/vimode.test.js`.
- `tests/vi/nvim-oracle.lua` — checks every case against nvim:
  `nvim --headless --clean -l tests/vi/nvim-oracle.lua`. Use it when adding
  cases.

Do not change the tests to make them pass.

## Integration (Main.qml)

1. Add `ViMode.js` to `src/resources.qrc`; `import "ViMode.js" as ViMode` in
   `Main.qml`.
2. Keep `property var viState: ViMode.createState()` and
   `property real viGoalX: -1` on the editor. Start in normal mode.
3. At the top of the editor's `Keys.onPressed`:
   - Insert mode: only `Escape` goes to `handleKey`.
   - Normal mode: send Escape, Return, Backspace, Delete, Tab, Ctrl+R, and any
     key with a one-character `event.text` and no Ctrl/Alt/Meta modifier. Let
     everything else fall through to the existing code.
   - Apply the result: if `edit`, use `EditorMutations.replaceRange` (or
     `editor.remove`/`editor.insert`); set `editor.cursorPosition = cursor`;
     run the action; store `state`; set `event.accepted = true` when
     `handled`.
4. `screenLine`: step one visual line at a time, `|count|` times. Take
   `r = editor.positionToRectangle(editor.cursorPosition)`, and if
   `viGoalX < 0` set `viGoalX = r.x`. Down: `editor.positionAt(viGoalX, r.y +
   r.height + 1)`; up: `editor.positionAt(viGoalX, r.y - 1)`. Stop if the
   position doesn't change. Finally apply `ViMode.clampNormal`. Any other
   result resets `viGoalX` to `-1`, so the column is remembered only across
   consecutive `j`/`k`.
5. `undo`/`redo`: call `editor.undo()`/`editor.redo()` count times, then
   `clampNormal` the cursor.
6. Cursor: in normal mode the `cursorDelegate` is a block one character wide;
   in insert mode it stays the current 1px line.
7. Show `NORMAL` or `INSERT` in the `footerStatus` row.
8. Mouse clicks in normal mode must not leave the cursor on a line's `"\n"`:
   apply `clampNormal` when the cursor moves while in normal mode.
