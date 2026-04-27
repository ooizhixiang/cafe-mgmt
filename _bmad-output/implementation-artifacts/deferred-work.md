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
