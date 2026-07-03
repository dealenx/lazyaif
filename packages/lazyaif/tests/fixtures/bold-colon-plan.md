# Implementation Plan: Reset LiteLLM Key Spend on Tariff Change

Branch: ai-1780453589
Created: 2026-06-17

## Settings
- Testing: yes
- Logging: verbose
- Docs: no

## Problem

When a user purchases a new tariff in `packages/tariffikk`, the S2S sync updates the LiteLLM key's `max_budget` but does NOT reset the `spend` counter. The old spend carries over, so if a user had spent $8 out of $10, and buys a new $10 plan, they only get $2 of available budget instead of $10. If accumulated spend exceeds the new budget, availability drops to 0%.

## Root Cause

`LitellmKeyService::updateExistingKey()` (`packages/api/app/Services/LitellmKeyService.php:238`) calls `LiteLLMService::updateKey()` to update `max_budget` and `duration`, but never calls `LiteLLMService::resetKeySpend()`. The method exists and works (used by admin UI) but is not called in the S2S sync flow.

## Approach

**Option A (chosen): Always reset spend when updating an existing key via S2S sync.** This is the simplest and most reliable fix. When a tariff is purchased or renewed, the user gets a fresh budget period, so resetting spend is correct behavior. The `resetKeySpend()` call is added directly in `updateExistingKey()`.

This means that `createKeyForUser()` (called by the S2S sync endpoint) will always reset spend for existing keys — matching the semantic that a tariff payment starts a fresh billing period.

## Tasks

### Phase 1: Core Fix

- [x] **Task 1**: Add `resetKeySpend()` call in `LitellmKeyService::updateExistingKey()`
  - File: `packages/api/app/Services/LitellmKeyService.php`
  - After the `updateKey()` call (line 262), add a call to `$this->liteLLMService->resetKeySpend($keyRef)`
  - Wrap in try/catch: if spend reset fails, log warning but do NOT fail the entire update (budget/expiry are already set)
  - LOGGING: DEBUG log before reset, INFO log on success, WARNING log on failure with full context (key_ref, error)
  - Log format: `[LitellmKeyService.updateExistingKey] resetting spend for key {key_ref_hash}`
  - On success: `[LitellmKeyService.updateExistingKey] spend reset successfully`
  - On failure: `[LitellmKeyService.updateExistingKey] failed to reset spend, continuing with budget update only`

### Phase 2: Tests

- [x] **Task 2**: Add test for spend reset in `LitellmKeyServiceTest`
  - File: `packages/api/tests/Unit/Services/LitellmKeyServiceTest.php` (added `resetKeySpend` mock to setUp)
  - New file: `packages/api/tests/Feature/S2S/LitellmKeyServiceSpendResetTest.php` (3 tests with `RefreshDatabase`)
  - Note: Tests moved from Unit to Feature because they need PG database (SQLite can't handle migrations)
  - `test_create_key_for_user_resets_spend_when_existing_key`: verify `createKeyForUser()` triggers `resetKeySpend`
  - `test_update_key_for_user_resets_spend`: verify `updateKeyForUser()` triggers `resetKeySpend`
  - `test_spend_reset_failure_does_not_fail_update`: verify `resetKeySpend` failure doesn't fail the update

- [x] **Task 3**: Add test for spend reset in `AiAccessControllerTest`
  - File: `packages/api/tests/Feature/S2S/AiAccessControllerTest.php`
  - Add mock for `resetKeySpend` method on the `LiteLLMService` mock in `setUp()`
  - Add test `test_sync_resets_spend_when_updating_existing_key`: POST to `/api/s2s/ai-access` for a user with an existing key, verify that `resetKeySpend` is called on the mock
  - Add test `test_sync_creates_new_key_without_spend_reset`: POST for a user with NO existing key, verify `resetKeySpend` is NOT called

### Phase 3: Integration Verification

- [x] **Task 4**: Run relevant test suites to verify no regressions
  - Run `packages/api/tests/Unit/Services/LitellmKeyServiceTest.php`
  - Run `packages/api/tests/Feature/S2S/AiAccessControllerTest.php`
  - Run `vendor/bin/pint --dirty` in packages/api