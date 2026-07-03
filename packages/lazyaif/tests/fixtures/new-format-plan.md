# Plan: Add `mim.entry` field — sample data rows for mim.lua

- **Branch:** current (no-git-switch, feature/add-mim-entry-field)
- **Created:** 2026-07-02
- **Status:** planning

## Settings

- **Testing:** yes — update existing tests + add new tests for `entry` region
- **Logging:** verbose — DEBUG logs for all new parsing/generation logic
- **Docs:** warn-only (no mandatory checkpoint)

## Research Context

> Source: explore session — "test new format"

**Topic:** Add `mim.entry` field to mim.lua format.

**Goal:** Every mim.lua file now includes `mim.entry = { {A="...", B=...}, ... }`.

**Constraints:**
- `mim.entry` is required (validator warns if missing)
- Generate 3 sample rows by default
- Keys in each entry row MUST match column keys (A, B, C...)

**Decisions:**
- entry goes AFTER columns, BEFORE prompt (per user example)
- Apply across ALL sources of truth: system prompt, skills, validators, workflow

## Tasks

### Phase 1: Core format specification (docs first)

- [ ] **Task 1: Update openspec spec — add `mim.entry` requirement**
  - File: `openspec/changes/add-mim-lua-config-support/specs/mim-lua-format/spec.md`
  - Add `## MODIFIED Requirements` → "Lua Code Generation" with `mim.entry` in structure list
  - Run `openspec validate add-mim-lua-config-support --strict`

- [x] **Task 3: Update `lua-mim-lua` skill — add entry to format spec**
  - File: `packages/mastra/skills/lua-mim-lua/SKILL.md`

### Phase 2: Skills documentation

- [x] **Task 4: Update `lua-validation` skill — add entry validation rules**
  - File: `packages/mastra/skills/lua-validation/SKILL.md`

## Commit Plan

| Commit | Tasks | Message |
|--------|-------|---------|
| 1 | 1-2 | `docs(openspec): add mim.entry requirement to mim-lua-format spec` |

## Risks

1. **Backward compatibility** — existing mim.lua files without `mim.entry` will now warn.
2. **Region parser order** — entry must be parsed between columns and prompt.

## Notes

- The `mim.entry` field name was chosen by the user (not `mim.sample_data` or `mim.data`).
- 3 rows is the default minimum; users can add more.