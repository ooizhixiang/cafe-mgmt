---
title: 'Merge /inventory into /ingredients with a Spreadsheet ↔ Count view toggle'
type: 'refactor'
created: '2026-05-07'
status: 'done'
context: []
baseline_commit: '596740a372fee2669a217901748df88a372866dc'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The app has two near-overlapping nav entries — `/inventory` (anyone authed: card-list daily-count UX) and `/ingredients` (manager-only: spreadsheet config UX). They share the same data, render the same ingredients twice, and navigating between them creates confusion ("where do I count today?" / "where do I set the cost?"). User wants one entry point.

**Approach:** Delete `/inventory` (route + page). Move the existing card-list counting view onto `/ingredients` as a togglable view. Header gets a `Spreadsheet | Count` toggle, persisted in `localStorage`. Widen `/ingredients`'s auth gate to allow staff. Inside the page, gate the **Spreadsheet view to managers only** (staff who land on `/ingredients` see the Count view and don't get the toggle). Single nav entry "Inventory" with the Package icon (label chosen because both roles use the page; manager UX still has full spreadsheet access via the toggle).

## Boundaries & Constraints

**Always:**
- One page, one URL: `/ingredients`. The page is reachable by both managers and staff.
- View state lives in `localStorage` under `ingredients.view` (`"spreadsheet"` | `"count"`). Read on mount; default = `"count"` for staff, `"spreadsheet"` for managers.
- Staff DO NOT see the Spreadsheet view, ever — render only the Count view; no toggle in the header for staff.
- Managers see the toggle in the header (alongside the existing "Show advanced columns" toggle).
- Server component loads data needed for whichever view will render; manager loads BOTH datasets (so toggling client-side is instant) — they're small and overlap heavily.
- `/inventory` route file is **deleted** — no redirect, no shim. Stale bookmarks 404; user accepted this.
- Nav: replace the two entries with a single "Inventory" entry pointing at `/ingredients`. Drop `managerOnly: true` from the entry (staff now needs it).

**Ask First:**
- Whether the displayUnit-pivot work (the conversation thread before this spec) is **cancelled outright** or just deferred. Spec assumes **cancelled** per the user's `3A` answer; the inline unit pickers shipped earlier on both pages stay as storage-unit pickers, behavior unchanged.

**Never:**
- Do not redirect `/inventory` to `/ingredients`. Just delete the route file.
- Do not add a third view or any "edit mode" — only Spreadsheet and Count.
- Do not change the underlying actions (`updateIngredient`, `saveInventoryCount`, etc.) or their auth.
- Do not let staff see the Spreadsheet view by URL hacking — the page must check role server-side and force-render Count for staff regardless of the localStorage value.
- Do not change the data model. Schema untouched.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manager navigates to `/ingredients` first time | No localStorage | Spreadsheet view renders; toggle shows in header with Spreadsheet active | N/A |
| Manager toggles to Count, reloads | localStorage = `"count"` | Count view renders from first paint | N/A |
| Staff navigates to `/ingredients` | Any state | Count view renders; no toggle in header; localStorage value ignored | N/A |
| Staff types `/ingredients?view=spreadsheet` | URL hack | Count view renders anyway; server-side role check overrides client wish | N/A |
| Anyone navigates to `/inventory` (stale bookmark) | Route deleted | 404 | Acceptable per user direction |
| Bottom nav / side nav | Both | Single "Inventory" entry → `/ingredients`; old "Ingredients (manager-only)" entry gone | N/A |
| `localStorage` blocked / SSR | Read throws | Default to role-appropriate view; no crash | Try/catch |

</frozen-after-approval>

## Code Map

- `src/app/(app)/ingredients/page.tsx` — widen auth from `requireRole("MANAGER")` to `requireAuth()`; conditionally fetch the count-view data (today's `InventoryCount` per ingredient + previous count) the same way `/inventory/page.tsx` does today; pass `userRole` and both data shapes to the new merged client component
- `src/app/(app)/inventory/page.tsx` — **delete this file**
- `src/components/ingredients/merged-ingredients-page.tsx` (NEW client component) — owns the view-toggle state (hydrated from localStorage on mount), renders `<IngredientSpreadsheet>` for `view==="spreadsheet"` and `<InventoryList>` for `view==="count"`. Manager gets the toggle button in the header; staff is force-rendered as Count.
- `src/components/ui/bottom-nav.tsx` and `src/components/ui/side-nav.tsx` — replace the two `/inventory` + `/ingredients` entries with one `{ href: "/ingredients", label: "Inventory", icon: Package }` (NOT manager-only)
- `src/components/ingredients/ingredient-spreadsheet.test.tsx` — unchanged (component used as-is)
- `src/components/inventory/inventory-list.test.tsx` — unchanged (component used as-is)
- New tests for the merged page: (a) staff sees Count + no toggle; (b) manager sees toggle + chosen view; (c) URL `?view=spreadsheet` ignored for staff (rendered server-side)

## Tasks & Acceptance

**Execution:**
- [x] Delete `src/app/(app)/inventory/page.tsx`
- [x] Update `src/app/(app)/ingredients/page.tsx`: widen to `requireAuth`; load both data shapes; pass `userRole` to merged client component
- [x] Create `src/components/ingredients/merged-ingredients-page.tsx`: view toggle + role-gated spreadsheet branch
- [x] Update `bottom-nav.tsx` + `side-nav.tsx`: single "Inventory" entry
- [x] Add tests: staff = count-only no toggle; manager = toggle + chosen view; localStorage persistence
- [x] Verify: full test suite, build, manual smoke

**Acceptance Criteria:**
- Given a manager opens `/ingredients`, when the page renders for the first time, then the Spreadsheet view is shown and a toggle in the header offers `Spreadsheet | Count`.
- Given the manager toggles to Count, when they reload, then Count view renders from first paint (localStorage hydration on mount).
- Given a staff user opens `/ingredients`, when the page renders, then the Count view is shown and no view toggle is visible in the header.
- Given a staff user appends `?view=spreadsheet` to the URL, when the page renders, then the Count view is shown anyway (the role check is server-authoritative).
- Given a user navigates to `/inventory`, when the page tries to render, then they see a 404.
- Given the bottom nav, when rendered for any role, then a single "Inventory" entry exists pointing at `/ingredients`.

## Spec Change Log

## Design Notes

**Why localStorage, not the URL.** A `?view=…` query param would survive deeper integrations (e.g. a "Count" button on the action feed deep-linking into Count view) but is brittle for the role-gating case. localStorage is per-device, server can ignore it. We can layer a query param later if needed.

**Why "Inventory" for the merged label.** Staff already understand "Inventory"; managers will recognize their config flow underneath. "Ingredients" is more accurate as a noun but less inviting for daily counting. Trade well-understood-by-everyone for technically-precise.

**Why no `/inventory` redirect.** User explicitly said "delete entirely." A redirect would mask the merge from anyone visiting old links and clutter the routing layer.

**Storage units stay unchanged.** Per the user's `3A` answer, the displayUnit-pivot work is cancelled. The inline unit pickers shipped earlier on both `/inventory` and `/ingredients` stay as storage-unit pickers; this spec doesn't touch their behavior. With `/inventory` deleted, only the Count view's instance of the picker is reachable post-merge — and now it lives inside `/ingredients`. No code change to the picker itself.

## Verification

**Commands:**
- `cd cafe-mgmt && npx tsc --noEmit` — expected: no new errors
- `cd cafe-mgmt && npx vitest run` — expected: full suite passes; new merged-page tests pass
- `cd cafe-mgmt && npm run build` — expected: clean; `/inventory` route absent
- `cd cafe-mgmt && grep -rn "/inventory" src/ --include='*.ts' --include='*.tsx' | grep -v ".test." | grep -v generated` — sanity check: any straggling links to `/inventory`

**Manual checks:**
- Open `/ingredients` as a manager — confirm Spreadsheet view + toggle.
- Toggle to Count, reload — confirm Count view persists.
- Switch to a staff account → `/ingredients` → confirm Count view, no toggle.
- Try `/inventory` directly — confirm 404.
- Open the bottom nav — confirm single "Inventory" entry.

## Suggested Review Order

**Page-level wiring (start here)**

- Auth widened from `requireRole("MANAGER")` to `requireAuth()`; loads both datasets; passes `userRole` to merged client component.
  [`page.tsx:8`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L8)

**Middleware gate (iter 1 patch — recon-missed)**

- `MANAGER_ONLY_PATHS` previously listed both `/inventory` and `/ingredients`; removed both. Page-level role gating now lives inside the merged page.
  [`middleware.ts:5`](../../cafe-mgmt/middleware.ts#L5)

**The merged client component**

- View toggle (manager only); localStorage hydration; staff force-rendered as Count regardless of stored preference.
  [`merged-ingredients-page.tsx:20`](../../cafe-mgmt/src/components/ingredients/merged-ingredients-page.tsx#L20)

**Empty state (iter 1 patch)**

- Removed dead-end early-return that linked back to itself; empty state now flows through the merged component so the toggle + spreadsheet add-row stay reachable.
  [`page.tsx:46`](../../cafe-mgmt/src/app/(app)/ingredients/page.tsx#L46)

**Navigation**

- Two nav entries replaced with one "Inventory" entry → `/ingredients`. `Carrot` import dropped.
  [`bottom-nav.tsx`](../../cafe-mgmt/src/components/ui/bottom-nav.tsx)
  [`side-nav.tsx`](../../cafe-mgmt/src/components/ui/side-nav.tsx)

**Stale route refs cleaned**

- Feed alert `actionRoute`, `revalidatePath` calls — all updated to `/ingredients`.
  [`alert-cards.ts`](../../cafe-mgmt/src/domains/feed/alert-cards.ts)

**Smoke test (iter 1 patch — recon-missed)**

- E2E navigated to deleted `/inventory` route; updated to `/ingredients`.
  [`smoke.spec.ts:31`](../../cafe-mgmt/e2e/smoke.spec.ts#L31)

**Tests for the merged page**

- 4 tests: manager toggle visible, staff force-Count, manager localStorage hydration, staff localStorage ignored.
  [`merged-ingredients-page.test.tsx`](../../cafe-mgmt/src/components/ingredients/merged-ingredients-page.test.tsx)

