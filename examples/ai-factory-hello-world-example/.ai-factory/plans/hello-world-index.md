# Implementation Plan: Hello World index.ts

Branch: none
Created: 2026-06-28

## Settings
- Testing: no
- Logging: verbose
- Docs: no  # yes => mandatory docs checkpoint in /aif-implement, no/unset => WARN [docs] only

## Tasks

### Phase 1: Setup
- [x] Task 1: Create `index.ts` with a "Hello, World!" program

  Create file `index.ts` at project root. The file must:
  - Print `Hello, World!` to stdout
  - Use TypeScript (Emit a runnable TS file; assume `ts-node` or `tsx` for execution, otherwise plain `tsc`-compatible)
  - Be minimal and self-contained

  LOGGING REQUIREMENTS:
  - Log program start at DEBUG level: `[main] starting hello-world`
  - Log before printing: `[main] printing message`
  - Log program end at DEBUG level: `[main] done`
  - Use `console.debug` for DEBUG and `console.log` for the actual message
  - Levels controllable via `LOG_LEVEL`/`DEBUG` environment (documented in code header comment if applicable)
  - Safety: production log level can be reduced without code edits

  Files: `index.ts`