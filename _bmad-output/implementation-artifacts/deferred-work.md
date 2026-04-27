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
