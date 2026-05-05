# Deferred Work

Items surfaced during reviews but classified out-of-scope of the originating spec. Each entry records the source spec, the finding, and why it was deferred rather than patched.

## From spec-multi-supplier-pricing-and-purchase-history (review iteration 1, 2026-04-27)

- **Inventory list rows lost the inline supplier-name + tap-to-call footer.** Previously each ingredient row on `/inventory` showed `Supplier: <name>` with a phone link. The multi-supplier rewrite moved supplier visibility behind the "Show all suppliers" panel toggle. Net effect: staff can no longer one-tap-call from `/inventory` — they must navigate to `/suppliers`. Trade-off, not strictly a bug; flag for product decision on whether to surface a "primary supplier" hint or quick-call shortcut on the inventory row.
  - Found by: Blind Hunter
  - Severity: medium (UX regression for staff)

- **Purchase-history fetch is unbounded on `/inventory`, `/settings/ingredients`, and `/suppliers/[id]`.** All three pages query `prisma.ingredientPurchase.findMany({ where: { ingredientSupplierId: { in: linkIds } } })` with no `take`/cursor/pagination/date-window. Within a year of active use the payload becomes the slowest part of the page. Add pagination or limit to last N (e.g., 20) per ingredient or per supplier. (Re-flagged on the supplier detail page review 2026-04-27.)
  - Found by: Blind Hunter, Edge Case Hunter (across two reviews)
  - Severity: medium (performance, future)

- **`priceInCents` and `totalPriceInCents` are PG `INTEGER` (32-bit max ~RM 21.4M) with no upper bound in zod.** Fat-finger inputs above the column max throw an opaque DB error rather than a friendly validation message. Either widen the column to `BIGINT` or add a zod `.max()` and a friendly UI guard.
  - Found by: Edge Case Hunter
  - Severity: low

- **Migration backfill has no embedded orphan-detection.** Spec's Ask First rule said "If the migration backfill detects rows where `Ingredient.supplierId` references a soft-deleted or missing `Supplier`: HALT and report counts." The implementation runner did this informally pre-flight (found 0 orphans), but the migration SQL doesn't codify the check. Future re-runs against other environments could hit a raw FK error mid-migration. Add a guarded `SELECT COUNT(*) FROM "Ingredient" i LEFT JOIN "Supplier" s ON s.id = i."supplierId" WHERE i."supplierId" IS NOT NULL AND s.id IS NULL` that aborts the migration with a clear message.
  - Found by: Blind Hunter
  - Severity: low (one-time concern; migration already applied successfully here)

- **`removeIngredientSupplier` "archive supplier instead" message points to a feature that doesn't exist.** The link entity has no archive/soft-delete flow. Either implement archive on `IngredientSupplier`, or change the error string to match what the manager can actually do (e.g., "Has purchase history; cannot remove. Edit price/unit to 0 if discontinued.").
  - Found by: Edge Case Hunter
  - Severity: low (misleading copy)

- **Optimistic `createdAt` uses client clock.** Newly logged purchases use `new Date().toISOString()` for in-memory sort, which can place them mid-list when client clock skews behind server. Refresh fixes it; cosmetic. Either accept refresh, or assign monotonically-increasing client-side sequence ids that always sort first until the next server refetch.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (degraded UX)

## From spec-purchases-tab (review iteration 1, 2026-04-27)

- **`totalPriceInCents` and inline-link `priceInCents` of `0` are accepted.** Schema is `int ≥ 0` (matches spec). A line with quantity ≥ 1 and total RM `0.00` persists a free-purchase row, polluting weighted-average cost reporting. Inline-link creation at price 0 is similarly accepted. Decide whether to enforce `> 0`, treat 0 as a "freebie" first-class concept, or warn on entry.
  - Found by: Edge Case Hunter
  - Severity: medium (data quality)

- **Server-side `unit` on linked rows is not validated against the `IngredientSupplier.unit` snapshot.** When the request supplies an `ingredientSupplierId`, the server writes `line.unit` straight onto the purchase row without comparing to the link's stored unit. A client (legit override or tampered) can send a divergent unit. Per-supplier per-unit cost analytics silently mix kg/g/ml. Decide whether to reject mismatch, snap to the link's unit, or warn.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (data quality)

- ~~**Concurrent inline-link race silently discards the staff-entered `priceInCents`/`unit`.**~~ **Resolved 2026-04-27** by `spec-restrict-purchase-picker-to-linked` — the inline-link-creation path was removed entirely, retiring this race surface.

- **Stale `IngredientSupplier` reference between page render and submit returns generic error.** If a manager unlinks an `IngredientSupplier` between the time staff opened `/purchases` and the time they submit, the whole batch fails with `"Ingredient supplier link not found"` and no indication of which line is stale. User must reload. Improve by naming the offending line, or by retrying that line through the unlinked-creation path with the user's typed price.
  - Found by: Edge Case Hunter
  - Severity: low (rare race; recoverable by reload)

- **Bulk purchases do not trigger `checkThresholds` recompute.** Consistent with the existing single-purchase `createIngredientPurchase` action (which also doesn't), so no regression — but worth a holistic decision: should logging stock arriving from a supplier feed into low-stock alert recomputation? Currently inventory counts and purchases are decoupled. Decide product-level whether they should be linked.
  - Found by: Blind Hunter, Edge Case Hunter, Acceptance Auditor
  - Severity: low (consistent with existing behavior)

## From split during /bmad-quick-dev intent — Ingredients tab (2026-04-27)

- **Strip manager-only role gating across the entire app.** During scoping of the new `/ingredients` top-level tab, the user requested that "anyone can use all features" globally — not just on the new tab. Deferred to its own spec because it's an independently shippable change with broad blast radius. Scope: remove `MANAGER_ONLY_PATHS` from `middleware.ts`; drop `requireRole("MANAGER")` (or equivalent) from server actions across `src/actions/**` (settings, wastage void/correction, comp budget, supplier CRUD, ingredient add/delete, etc.); remove `managerOnly` flags on nav items; remove `isManager`-conditional UI sections (or keep them and unconditionally enable). Risks: orphaned audit-log assumptions, settings being changed by junior staff, comp-budget caps becoming meaningless. Recommend explicit per-gate review when this is picked up — don't blanket-strip without reading each gate's intent.
  - Source: `/bmad-quick-dev` scoping conversation, 2026-04-27
  - Severity: deferred (out-of-scope of ingredients-tab spec)

## From spec-ingredients-tab-spreadsheet (review iteration 1, 2026-04-28)

- **Concurrent two-tab edits silently diverge.** When two managers (or two tabs) edit the same ingredient simultaneously, the implementation has no version field / optimistic concurrency check. Last-write-wins; the loser sees no warning, and a stale-display lingers until refresh. Affects all `Ingredient`-touching actions repo-wide, not just the spreadsheet — server actions don't take a `version` param either. Decide: add `Ingredient.version Int @default(0)` plus `if/`update-or-fail/` patterns on update, OR accept current behavior and document it.
  - Found by: Edge Case Hunter
  - Severity: medium (data correctness under multi-user editing)

- **`addIngredient` / `updateIngredient` server schemas have no `.max(N)` length cap and don't strip control characters.** Pasting a 10MB string or a value with embedded `\n`/`\t` saves verbatim. Predates this spec (the deleted `IngredientConfig` form had the same exposure via the same `setup.actions.ts`). Add `z.string().min(1).max(100)` and `.transform(v => v.replace(/[\r\n\t]/g, ' ').trim())` on `name`, `unit`, `containerProfile`, `category`. Likely worth a sweep across all string fields in `setup.actions.ts` and `supplier.actions.ts`.
  - Found by: Edge Case Hunter
  - Severity: medium (data quality / DOS mitigation)

- **`IngredientPurchase` IN-clause is unbounded on `/ingredients` page (and on `/inventory`, `/suppliers/[id]`).** `where: { ingredientSupplierId: { in: supplierLinkIds } }` has no `take`/cursor. Same shape as the prior pages so no regression — but as inventories grow this is the slowest part of each render. Add a date window or cap to last N per ingredient. Already noted under spec-multi-supplier-pricing — re-flagged here because the new `/ingredients` page inherits the pattern.
  - Found by: Blind Hunter, Edge Case Hunter (cross-spec)
  - Severity: medium (performance, future)

- **Pin-toggle optimistic order can drift from server `displayOrder`.** The page query orders by `[isPinned desc, displayOrder asc]`; client `handleTogglePin` only re-sorts by `isPinned` boolean. After several toggles the client view of unpinned-row order may not match server order until refresh. Cosmetic; refresh fixes. To resolve, either also send `displayOrder` adjustments from the action and reconcile, or add a "Refresh" button.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (cosmetic)

## From spec-ingredients-search-and-required-category (review iteration 1, 2026-04-28)

- **`Ingredient.category` Prisma column stays `String?` — "required" invariant is leaky.** The spec explicitly chose application-layer enforcement (zod on `addIngredient` + migration backfill + template seed). But: (1) the edit-cell category cell still allows `category` to be cleared back to `null` per Boundaries, (2) any non-`addIngredient` write path (a future server action, a SQL fix-up, a stale PWA client cached before this deploy) can reintroduce NULLs, (3) backfill is cosmetic without a column constraint. Tighten by adding `category String @default("Unassigned")` and a `NOT NULL` constraint after a longer deprecation cycle (during which all writers are confirmed to populate it). Today, accept the leakiness for shipping speed.
  - Found by: Blind Hunter
  - Severity: medium (data integrity hardening)

- **`addIngredient` / `updateIngredient` server schemas still lack `.max(N)` and control-char rejection on string fields (`name`, `unit`, `containerProfile`, `category`).** The spreadsheet UI guards client-side at 50 chars, but a direct call to the server action with a 10KB string saves verbatim. Predates this spec; re-flagged because adding required `category` widens the surface. Add `.max()` per field and a `.transform(v => v.replace(/[\r\n\t]/g, ' ').trim())`. Already noted in deferred-work from earlier specs — combining into one tightening pass.
  - Found by: Blind Hunter, Edge Case Hunter (cross-spec)
  - Severity: medium (data quality / DOS mitigation)

- **`selectTemplate` hardcodes `category: "Unassigned"` for every seeded ingredient.** Templates today (`src/lib/template-data.ts`) have no semantic category data on ingredients, so seeded ingredients land as "Unassigned" — meaning a fresh cafe sees the filter dropdown with one bucket only until a manager hand-categorizes everything. Future: extend `template-data.ts` schema to include `category` per ingredient, update `selectTemplate` to use the template's category (falling back to "Unassigned" only when missing), and seed each existing template with reasonable categories.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (UX regression for new cafes)

- **`addIngredient` server-action signature change is a breaking ABI for stale service-worker-cached PWA clients.** During deploy, an old cached client still calls `addIngredient(name, unit)` (2 args). The new server does `safeParse({ name, unit, category: undefined })` → returns "Category required". Affected users see add failures with no clear remediation until the SW updates. Same pattern applies to any server-action signature change; worth a project-wide convention for backwards-compatible action evolution (e.g., versioned actions, optional-with-default-on-server, or graceful fallback to "Unassigned").
  - Found by: Blind Hunter
  - Severity: low (transient; SW typically updates within 1–2 visits)

- **Category case-insensitive dedup / Unicode normalization.** Today the implementation case-sensitively buckets categories, so "Dairy" / "dairy" appear as separate filter chips and dropdown options; "café" (NFC) won't match "café" (NFD) on edit. Normalize on the server (`.trim().normalize("NFC")`) and dedupe display by case-insensitive equality. Mostly user-error correction; not blocking.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (cosmetic / data quality)

- **Search input is not locale-aware.** `name.toLowerCase()` fails for Turkish dotted-i and similar locale-sensitive cases. Switch to `.toLocaleLowerCase()` plus `.normalize("NFC")` on both sides if international users become a target.
  - Found by: Edge Case Hunter
  - Severity: low (out of current target audience)

## From spec-fractional-cost-storage (review iteration 1, 2026-04-28)

- **Variation column Int/Decimal asymmetry.** Spec migrated `RecipeIngredient.subtotalOverrideInCents` to `Decimal(12,4)` but left `VariationIngredient.subtotalOverrideInCents` as `Int` per the explicit "four columns only" scope. Result: base-recipe override can store fractional cents; variation override cannot. Probably wrong long-term — both should match. Migrate the variation column (and `RecipeVariation.sellingPriceInCents` if needed) to `Decimal(12,4)` in a follow-up spec, then add `.toNumber()` conversion at the existing `recipe.actions.ts` variation block.
  - Found by: Blind Hunter, Edge Case Hunter (false-flagged the leak; revealed the asymmetry on patch attempt)
  - Severity: medium (data-model inconsistency)

- **`parseRMToCents` vs `parseRMToCentsPrecise` duplication.** Spec added a local `parseRMToCentsPrecise` helper inline in `ingredient-suppliers-panel.tsx` and `supplier-detail.tsx` (truncates fractional cents preserved) while `parseRMToCents` in `lib/format.ts` still rounds to 2 decimal places (used by `purchases-form.tsx` and `call-outcome-prompt.tsx`). Two callers now silently truncate sub-cent precision the user might type into a multi-line purchase form — inconsistent UX vs. the two upgraded panels. Consolidate into a single `lib/format.ts` helper and migrate the remaining call sites.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (UX consistency)

- **Missing I/O Matrix test coverage on three rows.** Auditor noted three rows in the spec's I/O matrix lack direct test assertions: `"0.001"` persistence, recipe subtotal computation `0.5 × 200 = 100 → "$1.00"`, and large-value Decimal(12,4) upper-bound handling (`9999999.99`). Existing tests indirectly cover floor logic but no direct assertion. Add three quick unit tests next time these areas are touched.
  - Found by: Acceptance Auditor
  - Severity: low (coverage gap, not correctness)

- **Float-precision drift on cost-per-serving sums.** Decimal-sourced costs converted to JS `number` and summed via `+=` reintroduces IEEE-754 drift (`0.1 + 0.2`-style). For DB writes the `Math.round` at the persistence boundary now masks it (Patch 3 from the review iteration). Pure-display drift remains theoretically possible at the sub-cent tail. Long-term: keep arithmetic in `Decimal.js` and convert only at the formatter boundary. For shipping speed, current behavior is acceptable.
  - Found by: Edge Case Hunter
  - Severity: low (cosmetic at sub-cent scale; persistence path now protected by Math.round)

## From split during /bmad-quick-dev planning — FIFO Spec B2 (2026-04-28)

- **Spec B2: Wire FIFO consumption into wastage / comp / daily-report + recipe display.** Spec B1 (`spec-fifo-lots-and-override.md`) ships only the data model (lot remaining quantity, `LotConsumption` table, override toggle on `/ingredients`) and helper functions (`consumeFifo`, `restoreFifo`, `currentCostPerUnit`). The helpers are unused at ship time. B2 wires them in: `logWastage`, `logComp`, `submitDailyReport` call `consumeFifo` inside their existing transactions; `undoWastage`/`voidWastage`/`correctWastage`/`undoComp`/`voidComp` call `restoreFifo`. Over-deduction confirm-flow: server returns `{error:"OVER_DEDUCTION", available, requested}` unless caller passes `confirmOverDeduction:true`; `wastage`/`comp` UI handles via blocking `<ConfirmationDialog>`; sales (daily-report) silently over-deducts at most-recent-lot's price. `recipe.actions.ts` swaps raw `costPerUnitInCents` for `currentCostPerUnit` when computing `costPerServingInCents`; `/inventory` and `/recipes` pages pass derived cost. Action-test updates across wastage/comp/daily-report/recipe.
  - Source: `/bmad-quick-dev` split, 2026-04-28
  - Severity: deferred (depends on B1 landing first)

## From spec-fifo-lots-and-override (review iteration 1, 2026-04-28)

- **`LotConsumption.ingredientPurchaseId = null` is overloaded with two unrelated meanings.** A null FK currently signals BOTH (a) synthetic over-deduction rows (no lot was consumed; deficit costed at most-recent-lot's price) AND (b) orphaned rows where the original purchase was deleted post-hoc (`onDelete: SetNull`). Reports cannot distinguish. Add a column to disambiguate: `consumptionKind: "LOT" | "OVER_DEDUCTION" | "ORPHANED"` (or a `Boolean isOverDeduction`). When B2 wires consumption, emit the right kind and gate restore/audit logic on it.
  - Found by: Blind Hunter
  - Severity: high (data model clarity; will bite during reporting / void)

- **Pre-FIFO consumption history inflates backfilled `remainingQuantity`.** The migration sets `remainingQuantity = quantity` for every existing `IngredientPurchase` — but cafes have already deducted against these lots via wastage/comp/sales pre-FIFO. When B2 wires `consumeFifo` in, the first deductions will draw from these "phantom-stocked" lots and the cafe's books will show inflated cost-of-goods until lots run out. Decide pre-B2: (a) one-time admin "reset stock" UI per ingredient, (b) heuristic backfill (e.g., set `remainingQuantity = max(0, quantity - sum_of_pre_FIFO_consumption)`), or (c) accept and document the wash-out period.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (one-time data-quality concern at B2 launch)

- **`currentCostPerUnit` returns `null` when `manualCostOverride=true` AND `costPerUnitInCents=null`.** Defensible policy ("override means manual wins, no fallback to FIFO"), but UI offers no signal to managers that they've trapped a row in "no cost" state. When B2 lands, recipe and inventory cost displays will show "—" or empty for affected ingredients. Surface a 🔓 hint when override is locked but cost is null AND lots exist (suggest unlocking).
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (UX polish, surfaces only with a specific manager action)

- **Optimistic-concurrency tokens missing across actions.** Two manager tabs editing the same ingredient race. Affects `setManualCostOverride`, `updateIngredientConfig`, `togglePin`, and most other ingredient/supplier mutations. Cross-cutting concern; introduce an `expectedUpdatedAt` / `If-Match` pattern repo-wide rather than spec-by-spec.
  - Found by: Blind Hunter, Edge Case Hunter (re-flag)
  - Severity: low (single-manager workflow common; safety-net for multi-tab editing)

- **`setManualCostOverride` does not scope `update` by `cafeId` (defense-in-depth).** The pre-check via `findFirst` is cafe-scoped, but the subsequent `prisma.ingredient.update({ where: { id } })` isn't. TOCTOU window is theoretical (no cross-cafe move path), but every other mutation in this codebase double-scopes. Add to a sweep across action files when convenient.
  - Found by: Blind Hunter
  - Severity: low (defense-in-depth)

- **Negative-zero accepted by numeric guards.** `Number.isFinite(-0) === true` and `-0 < 0 === false`, so `-0` slips through as a valid cost. Persists as `-0` in `Decimal(12,4)`. Cosmetic, but inconsistent with `int().min(0)` semantics elsewhere. Coerce via `Object.is(value, -0) ? 0 : value` if it ever shows up in user-facing displays.
  - Found by: Edge Case Hunter
  - Severity: low (cosmetic)

## From spec-fifo-consumption-wiring (review iteration 1, 2026-04-28)

- **Cost-input upper-bound missing on inventory-list and recipe-editor parsers.** `ingredient-spreadsheet.tsx` correctly bounds cost to `1_000_000_000` cents (≈$10M); `inventory-list.tsx` and `recipe-editor.tsx` parsers only check `Number.isFinite`. User typing `9999999999.99` → 1e12 cents → exceeds `Decimal(12,4)` max → DB write throws. Mirror the upper-bound check in those two parsers. Pre-existing concern (also flagged in earlier deferred-work for this codebase under fractional-cost-storage).
  - Found by: Edge Case Hunter
  - Severity: low (rare path; DB throws cleanly)

- **`correctWastage` cannot reduce quantity to 0.** Schema enforces `quantity.min(1)`. Manager who wants to "neutralize" a wastage without voiding it must use `voidWastage` instead. Current behavior matches existing `correctWastage` semantics (pre-FIFO), but UX is mildly surprising. Lower bound to 0 if neutralization-without-void is desired; otherwise document.
  - Found by: Edge Case Hunter
  - Severity: low (documented behavior)

- **`applyRestoreFifo` doesn't validate `consumptionKind` enum value.** If a row's `consumptionKind` is somehow neither `LOT` nor `OVER_DEDUCTION` (data corruption / future enum extension), the helper falls through silently — no refill, but the row is still deleted. Add an explicit `else { throw new Error("Unknown consumptionKind") }` for defense-in-depth.
  - Found by: Edge Case Hunter
  - Severity: low (defensive)

- **Override toggle has no effect on FIFO consume path; SalesEntry cost always uses lot prices.** Per design: the override is a DISPLAY override (recipe / inventory / ingredients views) but consumption ALWAYS draws from real lots and records actual lot costs. This is intentional ("override = manual override of displayed price; lots track real stock"), but it means the cost a manager SEES on a recipe page may differ from the cost RECORDED on a SalesEntry when override is active. Surface this via documentation or a UI hint.
  - Found by: Edge Case Hunter, Acceptance Auditor (informational)
  - Severity: low (intentional behavior, may surprise managers)

- **Tie-break on identical-millisecond `createdAt`.** All FIFO orderings use `[{createdAt:"asc"},{id:"asc"}]` for deterministic stability — but cuid() ids are time-sortable only roughly, not strictly. If two purchases land in the exact same `createdAt` millisecond AND have ids that don't sort the same way as creation time, display vs. consume could pick different lots. Practically unlikely (millisecond collisions on a single cafe are rare). If it bites in production, add a monotonic seq column.
  - Found by: Blind Hunter
  - Severity: low (cosmetic, edge case)

## From spec-suppliers-list-inline-ingredient-picker (review iteration 1, 2026-04-28)

- **Confirmation dialog state singleton leaks across cards.** A single `removeTarget` state drives the modal at the page root. If the manager clicks ✕ on supplier A, then while the dialog is open clicks ✕ on supplier B, the dialog message swaps mid-flight and confirming now removes B's chip. UX confusion. Fix: lock removeTarget once a dialog opens until it closes (ignore subsequent ✕ clicks until then), or scope removeTarget per supplier card.
  - Found by: Blind Hunter
  - Severity: low (UX confusion)

- **Cross-card state leak: opening Add picker on B closes A's open picker.** `setAddingForSupplierId(null)` clears regardless of which card is editing. So opening a picker on supplier A, then clicking a chip on supplier B, closes A's picker and discards typed values. Mild data loss. Fix: track per-card open state OR warn before discarding unsaved input.
  - Found by: Blind Hunter
  - Severity: low (UX)

- **Brand-new-cafe empty state has no affordance.** When `availableToAdd.length === 0` AND `supplierLinks.length === 0` (a fresh cafe with zero ingredients in the system), the supplier card's "Supplies" section is hidden — no clear path to add ingredients. Add a hint pointing to `/ingredients` to seed ingredients first, OR allow inline-adding a brand-new ingredient from the picker.
  - Found by: Blind Hunter
  - Severity: low (onboarding edge case)

- **`handleSaveLink` fires the update action even if price/unit are unchanged.** Wasted server roundtrip; minor performance nit. Add an early-return when `priceInCents === link.priceInCents && unit === link.unit`.
  - Found by: Blind Hunter
  - Severity: low (perf)

- **Stale-removal race ("supplier not found").** If another tab deletes the link first, server returns "Supplier not found"; the client rolls back, restoring the chip — appears to come back from the dead. Fix: treat "not found" on remove as success-equivalent (don't rollback) and toast a softer message.
  - Found by: Edge Case Hunter
  - Severity: low (rare; observable mainly in multi-tab usage)

- **Cross-tab stale picker options.** `availableToAdd` is filtered client-side from `linkedIngredientIds` at render time. If another tab adds the same link, the picker still offers the option; submit returns "Supplier already added" and rollback fires. Fix: on duplicate-link error, call `router.refresh()` after rollback to re-pull server state.
  - Found by: Edge Case Hunter
  - Severity: low (rare; multi-tab)

- **Test coverage gaps for race conditions.** Existing tests use `mockResolvedValue` (synchronous next-microtask resolution) and never simulate two clicks before a pending action resolves. Add: rapid double-click on Add gated by `isPending`; update-action failure rollback; remove-action rollback. Acceptance Auditor and both hunters flagged this.
  - Found by: Blind Hunter, Edge Case Hunter, Acceptance Auditor
  - Severity: low (coverage)

## From spec-purchase-flow-fixes (review iteration 1, 2026-04-28)

- **Manual count vs concurrent purchase race.** `saveInventoryCount` overwrites today's `quantity` while `createIngredientPurchase` increments it. If the manager submits a count and a purchase concurrently, ordering determines outcome — purchase-first then count clobbers the increment; count-first then purchase increments correctly. Pre-existing pattern but newly-relevant given purchases now auto-bump. Options: (a) UI hint "you logged a purchase today; this count will overwrite it" before save; (b) make the count action increment-aware by reading the prior submitted-purchase total; (c) accept and document.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (multi-actor surprise)

- **`confirmedAt`/`confirmedById` audit trail staleness.** When a purchase auto-creates today's count with `confirmedById = purchaser`, then a manager later submits a manual count, the manual count's `confirmedById`/`confirmedAt` overwrite the auto-create attribution — losing the "auto-bumped from purchase" provenance. UI showing "last confirmed" lies in this case. Add a separate `lastAutoBumpedAt` column or a `consumptionKind`-like discriminator if attribution becomes important.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (informational)

- **Negative `prior.quantity` propagates into seed.** `baseQty = prior?.quantity ?? 0` could go negative if corrupt data exists. Defensive: `baseQty = Math.max(0, prior?.quantity ?? 0)`.
  - Found by: Edge Case Hunter
  - Severity: low (defense-in-depth)

- **Purchase form: dirty mini-form discarded silently on supplier change.** Switching the supplier picker mid-mini-form calls `closeAddNew()` and discards typed values without confirmation. Add a confirm dialog when the mini-form has dirty input and supplier changes.
  - Found by: Edge Case Hunter
  - Severity: low (UX)

- **Empty-state when cafe has zero ingredients (`allIngredients.length === 0`).** Existing "Add a supplier first…" message remains, but in the cafe-with-zero-ingredients case the manager has no actionable path on the purchase form. Add an explicit hint pointing to `/ingredients` to seed ingredients.
  - Found by: Edge Case Hunter
  - Severity: low (onboarding edge)

- **`addIngredientSupplier` duplicate from another tab keeps mini-form open with no fix path.** Local state never inserts the link (because action failed), but the link exists server-side. User retries forever. Fix: on "already added" / "Supplier already added" error, call `router.refresh()` after rollback so the link surfaces.
  - Found by: Edge Case Hunter
  - Severity: low (multi-tab)

- **Cafe lookup outside transaction.** `prisma.cafe.findUnique` runs before `$transaction` opens; if cafe is deleted between the read and the txn, lot + count rows write against a missing FK target. Theoretically prevented by FK constraint (cafe deletion would cascade or block), but the read-then-write pattern leaks one cycle. Move inside the txn or rely on FK enforcement.
  - Found by: Edge Case Hunter
  - Severity: low (theoretical race)

- **Test gap: bulk-purchase rollback doesn't assert per-line `inventoryCount.upsert` calls were rolled back.** Current rollback test asserts the parent action errors out, but doesn't verify the per-line auto-bump upserts were inside the same txn callback (rolled back vs leaked). Strictly speaking the test mock is also limited — `prisma.$transaction(callback)` mock either invokes the callback or rejects; there's no real DB to verify atomicity. Add an integration-style test or accept the limitation.
  - Found by: Edge Case Hunter, Blind Hunter
  - Severity: low (coverage limitation)

## From spec-purchase-inventory-countdate-tz-fix (review iteration 1, 2026-04-29)

- **`getCafeNow` returns a Date in *host* local time, not cafe local time.** `getCafeNow(tz)` extracts wall-clock fields in the cafe TZ via `Intl.DateTimeFormat`, then builds `new Date("YYYY-MM-DDTHH:MM:SS")` (no `Z`), which the JS engine interprets in **host** TZ. So `setHours(0,0,0,0)` snaps to host-local midnight of the cafe's wall-clock day — correct only when host TZ tracks cafe TZ. Multi-region deploys, container TZ drift, or serverless cold-starts in different regions can produce inconsistent `countDate` epochs for the same cafe-day. Project-wide convention; this story aligned with it but did not redesign it. Fix would be to make `getCafeNow` (or a new `getCafeToday` helper) return a true cafe-TZ date and update all 15+ call sites.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (architecture; latent until host-TZ ≠ cafe-TZ)

- **DST spring-forward gap in host TZ silently shifts `getCafeNow` result by an hour.** Building `new Date("2026-03-09T02:30:00")` on a host whose local TZ is in the DST gap on that date silently advances by one hour, so the resulting day key may be wrong. Independent of cafe TZ — depends on host. Fix lives in `getCafeNow` (use `Date.UTC` + tz offset, or a real date library).
  - Found by: Edge Case Hunter
  - Severity: medium (latent; manifests once a year per affected host)

- **Cross-midnight purchase + cafe DST fall-back can collide with prior-day countDate.** When the cafe TZ has a fall-back, the same wall-clock hour occurs twice; `getCafeNow` returns the same wall-clock value both times, and `countDate: { lt: today }` "prior" lookup may match itself. Same root cause as above.
  - Found by: Edge Case Hunter
  - Severity: medium (latent; rare)

- **CountDate test assertions become tautological on a UTC host.** New tests assert `countDate.getHours() === 0` etc — but on a UTC test runner, `setHours(0,…)` and `setUTCHours(0,…)` produce identical Dates so a regression to `setUTCHours` wouldn't fail. Caught the bug in dev (UTC+8 macOS) but not in a hypothetical UTC CI. Fix: pin `process.env.TZ` (e.g., `Asia/Kuala_Lumpur`) in vitest setup, or use `vi.setSystemTime` with explicit TZ.
  - Found by: Blind Hunter
  - Severity: low (test hardening; bug only manifests on non-UTC hosts anyway)

## From spec-ingredient-inventory-detail-popup (review iteration 1, 2026-04-29)

- **InventoryDetailDialog shows stale data while open if FIFO consumption happens elsewhere.** The popup reads from a snapshot held in `IngredientSpreadsheet` state (initialized once from `initialIngredients`). Wastage / comp / sales actions in another tab decrement `remainingQuantity` server-side via `applyConsumeFifo`, but the parent never refetches — the popup will show pre-consumption quantities until the user navigates away. Fix would be a `router.refresh()` on dialog open, or a polling/SSE pattern. Affects the broader Ingredients page state model, not just this dialog.
  - Found by: Edge Case Hunter
  - Severity: medium (multi-tab / concurrent-actor scenario)

- **"Suppliers (N)" toggle and "Details" button look identical on the spreadsheet row.** Both use `text-[var(--color-info)] font-medium`, separated by a 12px gap. On narrow viewports / dense rows, managers may not perceive them as distinct controls. Add an icon, a separator dot, or a different style for the secondary action.
  - Found by: Blind Hunter
  - Severity: low (UX polish)

- **`unitCostCents` rounding may disagree with raw lot per-unit shown elsewhere.** The dialog rounds `totalPriceInCents / quantity` to whole cents for display; other surfaces (e.g., FIFO consume math) use raw division. A power-user comparing screens may see a 1¢ difference for sub-cent purchases. Display-only.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (display drift)

## From spec-purchases-history-and-invoice-attach (review iteration 1, 2026-05-04)

- **`getPurchaseHistory` payload size unbounded — loads every 90-day row including invoice base64 columns.** `findMany` selects all columns by default and returns up to 90 days × N receipts × ~50–80 KB invoice each. For a busy cafe (1000+ receipts) every history page view ships tens of MB DB → server → client. Fix: split into two queries — first selects rows minus `invoiceImageUrl` for grouping/pagination; second fetches `invoiceImageUrl` only for the rows in the current page. Or move to cloud storage with on-demand fetch.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (performance at scale; latent in dev)

- **Optimistic attach + detach race overwrites `previousUrl` capture.** In `purchase-history-list.tsx`, `handleFile`/`handleDetach` snapshot `previousUrl` at handler entry. Rapid attach → detach (or vice versa) interleaving can leave the rollback restoring a stale value when the in-flight action fails. Fix: per-receipt sequence id or AbortController-style cancellation of stale operations.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (multi-click UX; rare but observable)

- **`?page=999` clamps server-side but URL stays at 999.** `getPurchaseHistory` returns `page: lastPage` (correct content), the footer shows "Page X of Y", and Previous/Next links use the clamped page. But the browser URL still says 999 — refresh shows the right content under a misleading URL. Fix: server-side `redirect()` to the canonical `?page=lastPage` when clamping happens, or accept the discrepancy.
  - Found by: Blind Hunter
  - Severity: low (cosmetic URL drift; content is correct)

- **`compressImage` divides by zero on 0×N images, silently producing a 1×1 placeholder.** A decoded image with `width === 0` (rare; corrupt file or unusual SVG) yields `NaN` height calc → 0×0 canvas → silent toDataURL output. Same bug exists in two pre-existing copies (`grab-and-go-list.tsx`, `recipe-editor.tsx`). Fix at extraction time when DRY-ing the helper into `src/lib/image.ts`.
  - Found by: Edge Case Hunter
  - Severity: low (defensive; same bug in pre-existing callers)

- **`formatReceiptTimestamp` uses browser locale + browser timezone.** Two staff in different timezones see different "minute" labels for the same `batchKey`. The batchKey itself is UTC-based, so cross-timezone collaboration shows a visual mismatch with the underlying anchor. Pin to cafe timezone via `getCafeNow`-based formatting if multi-timezone teams become a real workflow.
  - Found by: Edge Case Hunter
  - Severity: low (cosmetic; relevant only if cafes go multi-region)

- **Renamed ingredient/supplier shows the *current* name on past receipts, not the historical one.** Names come from joined rows at read time, so a 60-day-old "Acme Coffee" receipt re-labels itself as "Premium Roasters" if the supplier was renamed. Likely intentional (matches rest-of-app behavior; no historical-name snapshot anywhere). Document or take a snapshot at write time.
  - Found by: Edge Case Hunter
  - Severity: low (informational; intentional but undocumented)

- **By-design (not a bug, documented for future readers): MANAGER can attach an invoice to any cafe receipt regardless of who created it.** `attachPurchaseInvoice` matches by `(cafeId, supplierId, createdById from batchKey, minute window)` — but never checks `parsed.createdById === session.user.id`. This is intentional: managers manage cafe-wide and need to be able to add invoices to staff-logged purchases. The grouping uses `createdById` only to *separate* receipts in the UI display, not as a write-permission boundary.
  - Found by: Blind Hunter, Edge Case Hunter (flagged as concern)
  - Severity: design intent — not a defect

## From spec-unlock-price-recompute-from-lots (review iteration 1, 2026-05-04)

- **Stale `ingredientPurchases` snapshot during concurrent consumption.** `handleToggleOverride` recomputes `derivedCostPerUnitInCents` from the page-load snapshot of purchases. If wastage / comp / sales in another tab consumed the oldest lot since page load, the optimistic display shows a phantom "(Auto) $X" that doesn't reflect server reality until next refresh. Same root cause as the `InventoryDetailDialog` stale-data defer (no `router.refresh` wiring on the spreadsheet either). Affects the broader spreadsheet state model.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (multi-tab / concurrent-actor scenario)

- **Flip-flop rollback race on rapid toggle clicks.** Two in-flight `setManualCostOverride` actions both capture `wasOverride` / `wasDerivedCost` at handler entry; if the first succeeds and the second fails, the second's rollback restores the *original* state, silently undoing the first's successful flip. Fix: per-row sequence id or AbortController-style cancellation of stale optimistic operations.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (rapid-click UX edge; rare but observable)

## From spec-recipe-list-cost-range-for-variants (review iteration 1, 2026-05-04)

- **Schema inconsistency: `RecipeIngredient.subtotalOverrideInCents` is `Decimal? @db.Decimal(12, 4)` but `VariationIngredient.subtotalOverrideInCents` is `Int?`.** Pre-existing inconsistency. Pre-existing implications: variation-ingredient overrides can't store sub-cent values, while base-ingredient overrides can. The new `sumServingCost` helper papers over it via a union type, but the Prisma client returns different shapes for the two. If the project ever switches DB driver (or adds MySQL/MariaDB support) the `typeof === "number"` discrimination could break (Int → BigInt or Decimal in some drivers). Normalize the column types to match.
  - Found by: Edge Case Hunter
  - Severity: low (pre-existing; Postgres-only deploy)

- **Sub-cent precision lost when summing Decimal `totalPriceInCents` as JS number.** Pre-existing pattern across the codebase (recipe action, inventory action, etc.). `Decimal(12,4)` columns lose fractional cents at the JS-number boundary; cumulative drift is theoretically possible on very large sums but unobservable at cafe scale. If the team ever moves money math to Decimal arithmetic everywhere, this site is one of many to update.
  - Found by: Blind Hunter
  - Severity: low (pre-existing; cafe-scale safe)

- **Test coverage gap: `getRecipes` cost tests all use `manualCostOverride: true`, never exercising the FIFO-lot path through `currentCostPerUnit`.** The lot lookup logic (`fetchOldestLots` → `derivedCostByIngredientId`) is tested through `fifo.test.ts` and `inventory.actions.test.ts` separately, so the path is covered — but no test directly verifies `getRecipes` correctly passes lots through. Worth adding when next touching this file.
  - Found by: Edge Case Hunter
  - Severity: low (path covered by adjacent tests)

## From spec-cafe-enabled-units-picker (review iteration 1, 2026-05-04)

- **Optimistic-toggle race in EnabledUnitsEditor.** Two rapid checkbox clicks fire two `setCafeEnabledUnits` calls in flight. If the first fails after the second is optimistically applied, rollback writes the first's `previousList` snapshot — silently undoing the second's success. Fix: per-call sequence id or AbortController-style cancellation, or always reconcile to the action's returned `enabledUnits`. Same shape as the open `setManualCostOverride` race deferred earlier.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (rapid-click UX edge; rare but observable)

- **Case-sensitive dedup lets "kg" and "Kg" coexist as distinct enabled units.** Spec acknowledged this intentionally (manager's call), but the settings UI doesn't disambiguate visually — two near-identical chips appear. Downstream freeform DB rows then drift between the two casings; aggregations grouping by `unit` string split. Fix: normalize case at validation time, or warn in the UI when a case-only collision is added.
  - Found by: Blind Hunter
  - Severity: low (manager has to actively cause this; spec consciously chose case-sensitive)

- **Legacy `(custom)` values containing whitespace are a one-way display trap.** A row stored as `"fl oz"` (with internal space) renders as "fl oz (custom)" in the picker — manager can keep it. But because `validateCustomUnit` rejects internal whitespace, the same string can't be added through the settings input, so once the legacy data is gone the unit can never be re-enabled. Fix: tighter spec (forbid whitespace in stored unit strings going forward, with a one-time migration to clean up legacy rows), or relax the validator.
  - Found by: Edge Case Hunter
  - Severity: low (rare; legacy data fades naturally)

- **`aria-describedby` missing on the empty-state alert → picker association.** When no units are enabled, the `role="alert"` warning is rendered but isn't associated with the disabled selects via `aria-describedby`, so screen-reader users tabbing to a picker hear no explanation for why it's empty. UX polish.
  - Found by: Blind Hunter
  - Severity: low (a11y polish)

## From spec-recipe-margin-alert-cards (review iteration 1, 2026-05-04)

- **`getMarginAlertCards` runs `findMany` over all recipes + variations + ingredients on every action-feed render.** Same shape as `getRecipes` (and the other deferred unbounded-history concern). Cafes with 50–100 recipes are fine; multi-hundred-recipe operations will see noticeable TTFB on the home page. Fix would split into a lighter projection or cache the per-recipe cost computation; both are bigger refactors. Acceptable at cafe-scale today.
  - Found by: Blind Hunter
  - Severity: medium (perf at scale; latent today)

- **`Promise.allSettled` in feed `composer.ts` swallows source failures with no `logError` call.** A bug in `getMarginAlertCards` (or any other source) yields `status: "rejected"`, the result is silently dropped, and the operator has no observability — no alert appears, no error shows, manager assumes everything's healthy. Pre-existing pattern across all 6 feed sources. Fix: log rejected results in the composer's loop.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (cross-cutting observability gap)

- **`sumServingCost` is duplicated between `recipe.actions.ts:101` and `margin-alert-cards.ts:23`.** Verbatim re-implementation today (same null semantics, same Decimal-or-Int union for `subtotalOverrideInCents`). No test asserts equivalence — future fixes to one will not auto-propagate. Extract into a shared `src/lib/recipe-cost.ts` next time either site needs to change.
  - Found by: Edge Case Hunter
  - Severity: low (refactor opportunity; tested in both places)

- **Stale-snapshot race during settings save mid-feed-render.** `getMarginAlertCards` reads `cafe.minMarginPercent` then `recipes` in two sequential Prisma queries. A manager saving a new floor between them yields a card titled "below {old floor}%" while the data was scored against {old floor}%. Single-user-per-cafe makes this rare; mitigation would be a single transactional read or `Prisma.$transaction([...])`.
  - Found by: Edge Case Hunter
  - Severity: low (rare race; benign outcome — wrong number in title, correct comparison)

- **Float drift at the margin floor boundary.** `(450 - 360) / 450 = 0.19999999999999996`; strict `<` against floor 0.20 fires when arguably the recipe is "exactly at floor". Direction is safe (false-negative for a near-match, not false-positive), and `Number.EPSILON` tolerance would mask real cases. Documented; not patched.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (rare; safe direction)

- **No alert dismiss / snooze mechanism.** Margin cards re-fire on every feed load until the manager fixes the recipe pricing. Combined with the unbounded `findMany`, this risks alert fatigue on cafes with many under-priced legacy recipes. Proper dismiss-with-revert-on-edit is a separate feature.
  - Found by: Blind Hunter
  - Severity: low (UX; only painful when many cards stack up)

- **Test coverage gap: FIFO-derived cost path through `getMarginAlertCards`.** All margin tests use `manualCostOverride: true` so `currentCostPerUnit` returns the manual cost directly. The `findOldestNonEmptyLot → currentCostPerUnit` lot path isn't exercised through the feed source. Same gap exists in `getRecipes` tests (already deferred). Path covered by adjacent `fifo.test.ts` + `inventory.actions.test.ts` integrations.
  - Found by: Edge Case Hunter
  - Severity: low (path covered by adjacent tests)

## From spec-ingredient-display-unit-conversion (review iteration 1, 2026-05-04)

- **Per-unit cost label and low-stock threshold disagree with displayed quantity when displayUnit is set.** When milk's displayUnit=mL but ingredient.unit=L, the inventory row shows "≈ 1000 mL" above the stepper but the cost label still reads "$3.20/L" and the low-stock threshold chip still reads "5 L". Manager could mentally divide and get a 1000× wrong unit cost. Fix would convert cost-per-unit + threshold to displayUnit too. Out of original story scope (user asked specifically about quantity display).
  - Found by: Edge Case Hunter
  - Severity: medium (UX inconsistency on the very surface this story targeted)

- **Recipe `quantityPerServing` chip stays in storage unit on the inventory row's "Used in recipes" expansion.** Same family as the cost-label issue above — mixing storage and display units in one row is confusing.
  - Found by: Edge Case Hunter
  - Severity: low (only visible after expanding the row)

- **`addIngredient` doesn't accept a `displayUnit` parameter.** Acceptable today since the add-row UI doesn't expose it (manager configures after creation), but the action surface has no way to seed it at create time. Worth widening when the next caller needs it.
  - Found by: Edge Case Hunter
  - Severity: low (current UI doesn't need it)

- **Float drift on round-trip conversions.** `1 L → fl_oz → L` lands at ~0.99999..., absorbed by `formatConvertedQuantity`'s 1e-9 tolerance for whole numbers but can produce inconsistent display strings ("5.00" vs "5") for fractional results across rows. Cosmetic only — storage stays Int.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: low (cosmetic; storage unaffected)

## From spec-recipe-sub-recipes-phase-1-engine (review iteration 1, 2026-05-05)

- **Cycle TOCTOU race in `addRecipeIngredient`.** `wouldCreateCycle` runs OUTSIDE a transaction with the subsequent `recipeIngredient.create`. Two concurrent inserts (A→B and B→A) can both pass the check on stale registries and both commit, creating a cycle. The patches caught the engine's runtime cycle throw at integration sites so a bad edge doesn't break sales — but the cycle does exist in the data until a manager finds and removes it. Fix: wrap check + insert in a serializable transaction, OR add a periodic database-level cycle check + alert. Single-manager-per-cafe operation makes this rare in practice.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (rare race; defensive throw + log mitigates the worst impact)

- **No DB-level CHECK constraint enforcing the polymorphic XOR.** `RecipeIngredient` and `VariationIngredient` allow any combination of (ingredientId, subRecipeId) — both null, both set, exactly one set. The action layer enforces XOR at insert time but a direct DB write OR a future migration that loosens the action could leave malformed rows. The engine silently skips them at expansion. Fix: add a separate migration with raw SQL `ALTER TABLE ... ADD CONSTRAINT chk_xor CHECK ((ingredientId IS NULL) <> (subRecipeId IS NULL))` on both tables.
  - Found by: Blind Hunter, Edge Case Hunter
  - Severity: medium (defense-in-depth; current paths are clean but no safety net)

- **Test gap: action-layer wiring for sub-recipes is untested.** The pure engine has 22 tests but the action wrappers have none — `addRecipeIngredient` polymorphic branch (raw vs composite), `setRecipeYield` (both-or-neither, in-use rejection), cycle rejection at the action wrapper, composite expansion in the FIFO deduction loop. End-to-end ACs rely on un-asserted glue. Add when next touching these files.
  - Found by: Acceptance Auditor, self-disclosed
  - Severity: medium (real gap; engine is well-tested but integration isn't)

- **`getRecipesForReport` strips composite rows from the sale-entry UI.** A composite-only recipe (only sub-recipe rows, no raw rows) renders with `ingredients: []` even though the deduction loop will correctly deduct sub-recipe leaves on submit. Staff sees "no ingredients" → confusion or distrust. Phase 2 UI should expose composite rows or at minimum show a "uses sub-recipes" indicator.
  - Found by: Edge Case Hunter
  - Severity: medium (UX; deduction works correctly under the hood)

- **`getRecipe` (single recipe DETAIL) strips composite rows from the response.** The recipe-editor consumer would render zero indication that a composite row exists. Today the editor doesn't add composites (no Phase 1 UI), but a Phase 2 pickup needs to widen the response shape and add a separate `subRecipeRows` field so the editor can display them properly.
  - Found by: Edge Case Hunter
  - Severity: low (Phase 2 UI work)

- **`loadCafeRecipeRegistry` perf at scale.** Loads ALL recipes per request that needs the registry (sale submission, recipe list, margin alerts). For multi-hundred-recipe operations, the read scales linearly. Acceptable at cafe-scale today; same pattern as other unbounded `findMany` deferrals.
  - Found by: Edge Case Hunter
  - Severity: low (cafe-scale OK)

- **Override on composite row consumes leaves but bypasses leaf cost — semantic could surprise.** If `subtotalOverrideInCents` is set on a composite row, the override replaces the summed leaf cost in the cost report, but FIFO still consumes the underlying leaves at full quantity. Intentional per spec ("override = display/cost-only override, lots track real stock") but the same trap as the FIFO display-vs-consume divergence noted in earlier specs.
  - Found by: Blind Hunter
  - Severity: low (intentional; documented)

- **`addVariationIngredient` doesn't reject `subRecipeId` via schema; relies on schema absence of the field.** Direct DB writes (or a future loosening of the action) can put composite rows on `VariationIngredient`. The deduction + cost paths defensively skip such rows (`ingredientId === null` filter), so the worst outcome is silent under-deduction. Fix when adding Phase 2 variation-side composites: extend cycle detection + sale-time expansion to walk variation ingredients too.
  - Found by: Edge Case Hunter
  - Severity: low (Phase 1 limitation)

## From spec-recipe-sub-recipes-phase-2-ui (no review iteration; coverage gap)

- **No editor-component tests for the new `SubRecipesPanel` / `YieldEditor` UI.** No existing test file for `recipe-editor.tsx` to extend; the new sub-components are well-typed wrappers around tested actions, but there are no jsdom assertions for: yield set/clear UI flow, composite picker rendering when no other yield-having recipes exist, "📋 {name}" composite row label, picker filtering. Add when next touching the editor.
  - Severity: low (server actions tested + manual UI verified; no regression risk for raw-only recipes)

## From spec-lock-timezone-to-malaysia (review iteration 1)

- **`getCafeNow()` assumes the Node process runs in UTC.** Constructs a `Date` from a TZ-naive ISO-like string built via `Intl.DateTimeFormat` with `timeZone: "Asia/Kuala_Lumpur"`. `new Date("YYYY-MM-DDTHH:mm:ss")` is parsed in the **server's** local TZ. Works on UTC hosts (typical) and on KL hosts (incidentally), breaks if anyone deploys to a non-UTC, non-KL region. Pre-existing pattern, not introduced by this story.
  - Severity: medium (latent — only triggers on misconfigured deploy)
  - Fix: rebuild via `Date.UTC(...) - 8*3600*1000` to produce a true KL instant, or use a TZ-aware library (e.g. `@date-fns/tz`).

- **`getCafeSettings` server action is a dead export.** Zero callers anywhere in `src/`. Pre-dates this story; only narrowed (removed `timezone` from its return shape) here. Safe to delete next time this file is touched.
  - Severity: low (cosmetic dead code)

- **Two `period-detection.test.ts` blocks pass vacuously.** `it("returns OPENING during opening hours")` and `it("returns null outside all periods")` only call `vi.doMock` and never invoke `getCurrentPeriod` or `expect()`. Pre-existing — surfaced because the diff touched this file. The behavioural coverage of `getCurrentPeriod` is currently silent.
  - Severity: medium (false-confidence test)
  - Fix: add the missing `expect()` calls; assert the period boundaries actually drive the return.

- **Stale lazy `await import("@/lib/format")` in `checklist.actions.ts:401`.** Originally lazy to avoid a circular dep when timezone needed a cafe lookup. Now that `getCafeNow()` is arg-less and the cafe lookup is gone, the `getMyActivity` path can use a top-level static import.
  - Severity: low (cosmetic)
