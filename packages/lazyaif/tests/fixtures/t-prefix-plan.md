# Implementation Plan: Add clientName to monitoring pages

Branch: feature/monitoring-client-name
Created: 2026-07-03

## Settings
- Testing: yes
- Logging: standard
- Docs: no

## Tasks

### Phase 1: TypeScript Types

- [ ] **T1: Add `clientName` to all MonitoringClient/SessionDetail interfaces**
  - `packages/ui/src/pages/monitoring/list.tsx` — add `clientName?: string` to `MonitoringClient`
  - `packages/ui/src/pages/monitoring/show.tsx` — add `clientName?: string` to `SessionDetail`
  - `packages/ui/src/pages/monitoring/history.tsx` — add `clientName?: string` to `MonitoringClient`
  - `packages/api/resources/js/Pages/Admin/Monitoring/Index.tsx` — add `clientName?: string` to `MonitoringClient`

### Phase 2: UI Display Changes

- [ ] **T2: Update `show.tsx` — show clientName in session header**
  - In the session title section (around line 330), display `clientName` before the `sessionId`:
    - If `clientName` exists: `NY7KHTYW — f527d414-...` (with the sessionId shortened)
    - If not: just the full sessionId as before
  - Add `clientName` to the "Информация о сессии" card as a row

- [ ] **T3: Update `list.tsx` — show clientName in card headers + add search/filter**
  - In `ClientCard`, show `clientName` before `sessionId` in the `CardTitle`
  - Add a search input at the top of `MonitoringList` that filters clients by `clientName` or `sessionId`
  - Display format in card: if clientName exists show `clientName (shortened sessionId)`, otherwise full sessionId

- [ ] **T4: Update `history.tsx` — show clientName in rows + add search**
  - In the session row, show `clientName` before the sessionId
  - Add a search input to filter by `clientName` or `sessionId`

- [ ] **T5: Update Admin `Index.tsx` — add clientName column to table**
  - Add a `Client` column after `Session ID` in the table header
  - Display `clientName` in the table, or `—` if not present

### Phase 3: Verification

- [ ] **T6: Run linter/type check**
  - `pnpm --filter ui typecheck` or equivalent
  - Fix any type errors from added fields