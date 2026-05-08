---
title: 'Dashboard: 2-column layout with activity feed (left) + inventory log (right)'
type: 'feature'
created: '2026-05-08'
status: 'done'
context: []
baseline_commit: 'e89f0676efe8f9cd485561f6295e6a03d46c6b74'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The dashboard stacks everything full-width: stats → charts → activity feed at the bottom. Operators want at-a-glance awareness of *what just changed* in inventory (wastage logged, purchases received) without navigating away. Right now there's no chronological log surface — the wastage page shows only wastage, the purchases tab shows only purchases, neither is on the dashboard.

**Approach:** Below the existing stats + charts, switch the dashboard to a 2-column layout (`lg:grid-cols-2`, mobile stacks). Left column hosts the existing `FeedClient` (activity feed). Right column hosts a new **Inventory Log** component: chronological list of `WastageEntry` ("loss") and `IngredientPurchase` ("add") events for the cafe, newest first, with a "Show more" pagination button. Both roles can see it.

## Boundaries & Constraints

**Always:**
- Stats cards + the existing charts row (TopSelling / TopIngredients) remain ABOVE the new 2-column section, full-width as today.
- 2-column section uses `lg:grid-cols-2`; below `lg` breakpoint, columns stack (feed first, then log).
- Inventory log is a UNION of `WastageEntry` (with `voidedAt: null` AND `deletedAt: null`) and `IngredientPurchase`, scoped to `cafeId`, sorted by `createdAt` desc, default page size 30 with a "Show more" button that loads the next 30.
- Each row shows: type badge ("Loss" / "Add"), ingredient name, quantity + unit, dollar value (purchase: `totalPriceInCents`; wastage: `dollarValueInCents`), who logged it, relative timestamp.
- Both manager and staff can see the log (no role gate at the column level).
- Voided wastage is **excluded** (filtered server-side via `voidedAt: null`). Soft-deleted wastage is also excluded.

**Ask First:**
- Whether to show **voided** wastage entries with a strikethrough + "Voided" badge for audit visibility. Spec assumes **exclude** to keep the log focused on real changes.
- Whether the log should also include sales (consumption). Spec assumes **no** — sales already have their own surfaces (daily report + history). Including them would dominate the log on busy days.

**Never:**
- Do not change the data model — purely additive read path.
- Do not change the activity feed (`FeedClient`) component — only its container moves.
- Do not change stats / charts.
- Do not allow editing or void from the inventory log — it's read-only. Existing surfaces (wastage void via Sales History? no — wastage is voided from the wastage page) handle mutation.
- Do not add real-time push / polling. Server-rendered initial 30 + client "Show more" via a Server Action.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manager opens dashboard, log has 50 entries | Default | Shows newest 30; "Show more" button at bottom | N/A |
| Click "Show more" | First 30 visible | Append next 30 (or fewer); button hides when no more | Toast on action error |
| Empty log (no wastage, no purchases) | New cafe | Shows empty state: "No inventory changes yet" | N/A |
| Wastage entry voided after the log was loaded | Log has stale voided row | Stale row remains until reload — accepted (no auto-refresh) | N/A |
| Wastage with `dollarValueInCents = 0` | Edge | Row renders normally with "$0.00" cost | N/A |
| Purchase logged in `kg` for a `g`-stored ingredient (post-conversion fix) | Stored as 1000 g | Row shows "Add: 1000 g" (storage unit), not "1 kg" | N/A — by design |
| `lg` viewport (≥1024px) | Layout | Activity feed left, inventory log right (50/50) | N/A |
| Below `lg` (mobile/tablet) | Layout | Activity feed first (full-width), inventory log below it | N/A |
| Staff loads dashboard | Same data | Sees the same log with the same actions allowed (none — read-only) | N/A |

</frozen-after-approval>

## Code Map

- `src/actions/inventory.actions.ts` — new `getInventoryLog({ cursor?: number; limit?: number })`: returns `Array<{ kind: "loss" | "add"; id: string; ingredientName: string; ingredientUnit: string; quantity: number; dollarValueInCents: number; createdAt: string; createdByName: string }>` plus a `nextCursor: number | null` for "Show more". Cursor = offset (simple, fine at this volume); limit defaults to 30, capped at 100.
- `src/components/feed/inventory-log.tsx` (NEW client component) — initial server-fetched page (passed as prop) + "Show more" button that calls the action. Loss/Add badges, formatted timestamps via `formatDistanceToNow`-equivalent or a small inline helper.
- `src/app/(app)/page.tsx` — restructure JSX: stats + charts unchanged; below them wrap `<FeedClient>` and `<InventoryLog initialPage={…} />` in a `<div className="grid lg:grid-cols-2 gap-[var(--space-4)]">`. Server-fetch the initial 30 log entries via `getInventoryLog`.
- `src/actions/inventory.actions.test.ts` — add 2 tests for `getInventoryLog`: (a) returns merged + sorted page; (b) excludes voided + soft-deleted wastage.
- `src/components/feed/inventory-log.test.tsx` (NEW) — render test: renders rows, "Show more" appends.

## Tasks & Acceptance

**Execution:**
- [x] `src/actions/inventory.actions.ts` — add `getInventoryLog` server action with the shape above
- [x] `src/components/feed/inventory-log.tsx` — new client component (initial page from props + "Show more" calls action)
- [x] `src/app/(app)/page.tsx` — fetch initial log page server-side; restructure JSX into stats + charts (full-width) → 2-column row (feed left, log right)
- [x] `src/actions/inventory.actions.test.ts` — 2 tests for `getInventoryLog`
- [x] `src/components/feed/inventory-log.test.tsx` — 1 render + 1 "Show more" test
- [x] Verify (build, tests, manual smoke)

**Acceptance Criteria:**
- Given a manager opens `/`, when the page renders on a `≥lg` viewport, then the activity feed is on the left and the inventory log is on the right with newest 30 entries.
- Given the log has more than 30 entries, when the user clicks "Show more", then the next 30 entries append; the button hides when no more remain.
- Given a wastage entry is voided in the DB, when the dashboard loads, then that entry does not appear in the log.
- Given a wastage entry is soft-deleted (`deletedAt` set), when the dashboard loads, then it does not appear.
- Given the user is on a mobile viewport, when the page renders, then the columns stack with the feed first.
- Given a staff user opens `/`, when the page renders, then they see the same log (no role gate).
- Given there are zero wastage and zero purchase rows, when the log renders, then it shows "No inventory changes yet".

## Spec Change Log

## Design Notes

**Why offset cursor, not createdAt cursor.** A `createdAt`-based cursor would be more correct for stable pagination if rows are inserted between page loads, but the volume is low (a few entries per day). Offset-based pagination is simpler and the worst-case duplicate row across pages is a one-frame nuisance. Promote to keyset later if it ever matters.

**Why no real-time refresh.** Both wastage and purchases are user-initiated server actions; the dashboard is not the surface where they happen. A simple page refresh after logging a new entry is sufficient. Adding polling/SSE adds complexity not justified by the use case.

**Storage units in the log.** Quantities render in the ingredient's storage unit (after the recent purchase-conversion + backfill work). If the user's mental model is in a different unit, they can use the inline display unit on `/ingredients` or open the ingredient's detail dialog. Not duplicating display-unit conversion here.

## Verification

**Commands:**
- `cd cafe-mgmt && npx tsc --noEmit` — expected: no new errors
- `cd cafe-mgmt && npx vitest run src/actions/inventory.actions.test.ts src/components/feed/inventory-log.test.tsx` — expected: existing + new tests pass
- `cd cafe-mgmt && npm run build` — expected: clean

**Manual checks:**
- Open `/` on a desktop viewport — confirm 2-column layout below stats; feed left, log right.
- Resize to mobile — confirm columns stack (feed first).
- Log a fresh wastage from `/wastage` and a purchase from `/purchases`, return to `/` — confirm both appear at the top of the log on next reload.
- Void a wastage entry — refresh dashboard — confirm it disappears from the log.

## Suggested Review Order

**The action (start here)**

- New `getInventoryLog`: merges WastageEntry + IngredientPurchase, surfaces a `description` field per entry (wastage = formatted reason, purchase = supplier name).
  [`inventory.actions.ts:964`](../../cafe-mgmt/src/actions/inventory.actions.ts#L964)

**Entry shape**

- `InventoryLogEntry` now carries `description` instead of `createdByName` (iter 1 + user-direction pivot — log shows "why", not "who").
  [`inventory.actions.ts:941`](../../cafe-mgmt/src/actions/inventory.actions.ts#L941)

**Dashboard page restructure**

- Try/catch wraps the action call (iter 1 patch) so a thrown error doesn't crash the page; 2-column grid wraps `<FeedClient>` (left) + `<InventoryLog>` (right).
  [`page.tsx:46`](../../cafe-mgmt/src/app/(app)/page.tsx#L46)

**Inventory log component**

- Loss/Add badges, description rendered next to qty + cost, "Show more" pagination, hydration-safe timestamp (iter 1 patch — `mounted` flag swaps absolute → relative post-mount).
  [`inventory-log.tsx`](../../cafe-mgmt/src/components/feed/inventory-log.tsx)

**Tests**

- 2 action tests (merge order + filter) updated for the new `description` field; 3 component tests cover render + empty state + Show more behavior.
  [`inventory.actions.test.ts`](../../cafe-mgmt/src/actions/inventory.actions.test.ts)
  [`inventory-log.test.tsx`](../../cafe-mgmt/src/components/feed/inventory-log.test.tsx)

