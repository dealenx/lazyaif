# Plan: Support new ai-factory plan format (bold metadata, issue #5)

Branch: 0.x
Created: 2026-07-03
Status: done

## Settings

- Testing: yes
- Logging: standard
- Docs: no

## Tasks

### Phase 1: Parser updates

- [x] Task 1: Update title, branch, created regexes for new format
- [x] Task 2: Update settings regexes for new bold format
- [x] Task 3: Update task regex for bold task names
- [x] Task 4: Parse `Status` field from new format
- [x] Task 5: Handle `Docs: warn-only` in PlanSettings

### Phase 2: TUI meta line

- [x] Task 6: Update TUI meta line to show status

### Phase 3: Tests

- [x] Task 7: Add new-format fixture and parser tests
- [x] Task 8: Run full test suite + typecheck — 62 pass, 0 fail, typecheck clean