-- Checks tests/vi/cases.json against real nvim, so the expected results are
-- what vi actually does rather than what someone remembers it doing.
--
--   nvim --headless --clean -l tests/vi/nvim-oracle.lua
--
-- Cases marked "nvim": false describe omawrite-specific behavior (actions,
-- keys we deliberately ignore) and are skipped.

local here = debug.getinfo(1, "S").source:sub(2):match("(.*/)") or "./"
local file = assert(io.open(here .. "cases.json", "r"))
local cases = vim.json.decode(file:read("a"))
file:close()

-- Classic vi behavior, not nvim's defaults.
vim.o.showmode = false
vim.o.startofline = true
vim.o.whichwrap = "b,s"
vim.o.autoindent = false
vim.o.smartindent = false
vim.o.cindent = false
vim.o.formatoptions = ""
vim.o.virtualedit = ""

local function parse(s)
  local i = s:find("|", 1, true)
  assert(i, "no | cursor marker in: " .. s)
  return s:sub(1, i - 1) .. s:sub(i + 1), i - 1
end

local function show(text, cursor)
  return text:sub(1, cursor) .. "|" .. text:sub(cursor + 1)
end

local function set_cursor(lines, offset)
  local row = 1
  while offset > #lines[row] and row < #lines do
    offset = offset - #lines[row] - 1
    row = row + 1
  end
  vim.api.nvim_win_set_cursor(0, { row, offset })
end

local function get_offset(lines)
  local pos = vim.api.nvim_win_get_cursor(0)
  local offset = 0
  for r = 1, pos[1] - 1 do
    offset = offset + #lines[r] + 1
  end
  return offset + pos[2]
end

local esc = vim.api.nvim_replace_termcodes("<Esc>", true, false, true)
local failed, checked = 0, 0

for _, c in ipairs(cases) do
  if c.nvim ~= false then
    checked = checked + 1
    local text, cursor = parse(c.text)
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_set_current_buf(buf)
    local lines = vim.split(text, "\n", { plain = true })
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
    set_cursor(lines, cursor)

    -- Feeding with "x" would leave insert mode before we could look, so a
    -- <Cmd> probe at the end records the state while still in that mode.
    local got, mode
    _G.OracleProbe = function()
      mode = vim.api.nvim_get_mode().mode:sub(1, 1) == "i" and "insert" or "normal"
      local out_lines = vim.api.nvim_buf_get_lines(buf, 0, -1, false)
      got = show(table.concat(out_lines, "\n"), get_offset(out_lines))
    end
    local keys = vim.api.nvim_replace_termcodes(c.keys .. "<Cmd>lua OracleProbe()<CR>", true, false, true)
    vim.api.nvim_feedkeys(keys, "ntx", false)
    local want_mode = c.mode or "normal"

    if got ~= c.expect or mode ~= want_mode then
      failed = failed + 1
      io.stdout:write(("MISMATCH %s\n  keys: %s\n  want: %s (%s)\n  nvim: %s (%s)\n")
        :format(c.name, c.keys, vim.inspect(c.expect), want_mode, vim.inspect(got), mode))
    end

    vim.api.nvim_feedkeys(esc, "nx", false)
    vim.api.nvim_buf_delete(buf, { force = true })
  end
end

io.stdout:write(("%d checked against nvim, %d mismatched\n"):format(checked, failed))
os.exit(failed == 0 and 0 or 1)
