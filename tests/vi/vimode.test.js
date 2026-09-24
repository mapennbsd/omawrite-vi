// Tests for src/ViMode.js. Run with: node --test tests/vi/vimode.test.js
// The keystroke cases live in cases.json; see docs/vi-spec.md.

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ViMode = require(path.join(__dirname, "..", "..", "src", "ViMode.js"));
const cases = require("./cases.json");

const NAMED_KEYS = {
    "<Esc>": "Escape",
    "<CR>": "Return",
    "<BS>": "Backspace",
    "<Del>": "Delete",
    "<Tab>": "Tab",
    "<C-r>": "C-r",
};

function parse(marked) {
    const i = marked.indexOf("|");
    assert.ok(i >= 0, "no | cursor marker in " + JSON.stringify(marked));
    return { text: marked.slice(0, i) + marked.slice(i + 1), cursor: i };
}

function show(text, cursor) {
    return text.slice(0, cursor) + "|" + text.slice(cursor);
}

function tokenize(keys) {
    return keys.match(/<[^>]+>|[\s\S]/g).map(k => {
        if (k.length > 1 && !(k in NAMED_KEYS))
            throw new Error("unknown key name " + k);
        return NAMED_KEYS[k] || k;
    });
}

function checkResultShape(result, text, cursor, state, key) {
    const where = " (key " + JSON.stringify(key) + " at " + JSON.stringify(show(text, cursor)) + ")";
    assert.equal(typeof result.handled, "boolean", "handled must be a boolean" + where);
    assert.equal(typeof result.state, "object", "state must be an object" + where);
    assert.equal(typeof result.cursor, "number", "cursor must be a number" + where);
    assert.ok("edit" in result, "result needs an edit field (null when none)" + where);
    assert.ok("action" in result, "result needs an action field (null when none)" + where);
    if (!result.handled) {
        assert.deepEqual(result.state, state, "unhandled keys must not change state" + where);
        assert.equal(result.edit, null, "unhandled keys must not edit" + where);
        assert.equal(result.action, null, "unhandled keys must not return an action" + where);
        assert.equal(result.cursor, cursor, "unhandled keys must not move the cursor" + where);
    }
    if (result.edit !== null) {
        const e = result.edit;
        assert.ok(Number.isInteger(e.start) && Number.isInteger(e.end) && typeof e.text === "string",
                  "edit must be { start, end, text }" + where);
        assert.ok(0 <= e.start && e.start <= e.end && e.end <= text.length,
                  "edit range out of bounds" + where);
    }
}

// Feeds keys one at a time, the way Main.qml will. Keys the editor would
// handle itself in insert mode (handled: false) are typed into the text.
function run(start, keys) {
    let { text, cursor } = parse(start);
    let state = ViMode.createState();
    let action = null;
    for (const key of tokenize(keys)) {
        const frozen = JSON.parse(JSON.stringify(state));
        const result = ViMode.handleKey(state, text, cursor, key);
        assert.deepEqual(state, frozen, "handleKey must not mutate the state it is given");
        checkResultShape(result, text, cursor, state, key);

        if (!result.handled) {
            assert.equal(state.mode, "insert", "normal mode must handle key " + JSON.stringify(key));
            assert.equal(key.length, 1, "test cases only type printable characters in insert mode");
            text = text.slice(0, cursor) + key + text.slice(cursor);
            cursor += 1;
            action = null;
            continue;
        }
        if (result.edit !== null)
            text = text.slice(0, result.edit.start) + result.edit.text + text.slice(result.edit.end);
        assert.ok(0 <= result.cursor && result.cursor <= text.length,
                  "cursor out of bounds after key " + JSON.stringify(key));
        cursor = result.cursor;
        state = result.state;
        action = result.action;
        if (state.mode === "normal")
            assert.equal(cursor, ViMode.clampNormal(text, cursor),
                         "normal-mode cursor must be a legal position after key " + JSON.stringify(key)
                         + ": " + JSON.stringify(show(text, cursor)));
    }
    return { marked: show(text, cursor), mode: state.mode, action };
}

test("exports exactly createState, handleKey and clampNormal", () => {
    assert.deepEqual(Object.keys(ViMode).sort(), ["clampNormal", "createState", "handleKey"]);
});

test("createState starts in normal mode with nothing pending", () => {
    assert.deepEqual(ViMode.createState(), { mode: "normal", count: "", pending: "" });
    assert.notEqual(ViMode.createState(), ViMode.createState(), "each call returns a new object");
});

test("clampNormal", () => {
    const table = [
        ["", 0, 0],
        ["abc", 1, 1],
        ["abc", 3, 2],          // past the end of a non-empty last line
        ["abc\n", 3, 2],        // on the "\n" of a non-empty line
        ["abc\n", 4, 4],        // empty last line
        ["a\n\nb", 2, 2],       // empty line in the middle
        ["abc", -5, 0],
        ["abc", 99, 2],
        ["ab\ncd", 2, 1],
    ];
    for (const [text, pos, want] of table)
        assert.equal(ViMode.clampNormal(text, pos), want,
                     "clampNormal(" + JSON.stringify(text) + ", " + pos + ")");
});

test("insert mode lets every key but Escape through", () => {
    const insert = ViMode.handleKey(ViMode.createState(), "abc", 1, "i").state;
    assert.equal(insert.mode, "insert");
    for (const key of ["h", "x", "d", "G", "0", "Return", "Backspace", "Delete", "Tab", "C-r", " "]) {
        const result = ViMode.handleKey(insert, "abc", 1, key);
        assert.equal(result.handled, false, "insert mode must not handle " + JSON.stringify(key));
        checkResultShape(result, "abc", 1, insert, key);
    }
    const esc = ViMode.handleKey(insert, "abc", 1, "Escape");
    assert.equal(esc.handled, true);
    assert.equal(esc.state.mode, "normal");
});

test("pending and count are cleared after a command", () => {
    const after = ViMode.handleKey(ViMode.createState(), "abc\ndef", 0, "2").state;
    assert.equal(after.count, "2");
    const done = ViMode.handleKey(after, "abc\ndef", 0, "l").state;
    assert.equal(done.count, "");
    const g = ViMode.handleKey(ViMode.createState(), "abc", 0, "g").state;
    assert.equal(g.pending, "g");
    assert.equal(ViMode.handleKey(g, "abc", 0, "g").state.pending, "");
});

for (const c of cases) {
    test(c.name + "  [" + c.keys + "]", () => {
        const got = run(c.text, c.keys);
        assert.equal(got.marked, c.expect, "text and cursor");
        assert.equal(got.mode, c.mode || "normal", "mode");
        assert.deepEqual(got.action, c.action || null, "action");
    });
}
