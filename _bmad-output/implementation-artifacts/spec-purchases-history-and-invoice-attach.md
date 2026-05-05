---
title: 'Purchases tab — receipt history with invoice image attach'
type: 'feature'
created: '2026-04-29'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Purchases tab only lets managers log new purchases. There's no way to see past receipts, and there's no way to attach an invoice/receipt image to past purchases. Managers want a record they can refer back to with proof of payment.

**Approach:** Add a tabbed UI on `/purchases` (`?tab=log` default, `?tab=history` new) mirroring the existing `wastage-comp-tabs` pattern. The History tab shows past purchases grouped into "receipts" (heuristic: `(supplierId, createdById, createdAt floor-to-minute)` — option B from clarifying questions). Each receipt row lists its line items, total, and an invoice attach/replace control. Image upload uses the existing client-side Canvas-compress → base64 data URL pattern (matches `grab-and-go-list.tsx` and `recipe-editor.tsx`); image stored in a new `IngredientPurchase.invoiceImageUrl` column. Attach/replace/detach writes to every line in the batch and is restricted to MANAGER role; STAFF can view.

## Boundaries & Constraints

**Always:**
- Group purchases into a "receipt" by `(supplierId, createdById, createdAt rounded down to the minute)`. Server constructs and validates the batch key from these three fields.
- Image is compressed client-side to ≤ 800px on the longest edge, JPEG quality 0.7, stored as a base64 data URL in `IngredientPurchase.invoiceImageUrl` (mirrors existing `Recipe.imageUrl` / `GrabAndGoItem.imageUrl`).
- Attach / replace / detach: MANAGER only. STAFF can view receipts and invoice thumbnails.
- History scope: last 90 days, newest-receipt-first, paginated 25 receipts/page. Pagination via `?tab=history&page=N` query param.

**Ask First:**
- Whether to also surface the receipt history on `/inventory` or `/suppliers/[id]` (currently scoped to `/purchases` only — request expansion later).

**Never:**
- Don't introduce a `PurchaseBatch` entity or any FK migration in this story (option C was deferred — keep the schema change to one nullable column).
- Don't introduce cloud storage (S3 / Vercel Blob / Cloudinary). Reuse the established base64 pattern. Defer the storage upgrade until row-size becomes a problem.
- Don't extract the duplicated `compressImage` helper in this story — copy it into the new component (third copy is acceptable; refactor is out of scope).
- Don't allow editing the line items of a past purchase from the History tab (read-only except for the invoice itself).
- Don't accept `invoiceImageUrl` from an unauthenticated path or skip cafe-scoping; the action must verify all matching rows belong to the caller's `cafeId`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy view | Manager opens `?tab=history`; cafe has 5 receipts in last 90 days | Renders 5 grouped receipts newest-first with line items + supplier name + total RM | N/A |
| Empty history | No purchases in the last 90 days | Empty state: "No purchases logged in the last 90 days." | N/A |
| Attach invoice | Manager picks a JPEG file on a receipt with no invoice | Image compressed client-side, sent to `attachPurchaseInvoice(batchKey, dataUrl)`, all lines in the batch update; thumbnail appears on row | Toast on action failure; UI rolls back optimistic state |
| Replace invoice | Receipt already has an invoice; manager picks a new file | Old base64 is overwritten by new dataUrl on all lines in the batch | Same as above |
| Detach invoice | Manager clicks "Remove invoice" | All lines in the batch get `invoiceImageUrl = null` | Toast on failure |
| STAFF tries to attach | STAFF role | UI hides attach/replace/detach controls; if action somehow called, server returns `Unauthorized` | N/A |
| Cross-cafe injection | Caller passes a batchKey that resolves to another cafe's rows | Action returns "Receipt not found" — zero rows updated | Hard failure |
| Large image | User picks a 5 MB photo | Canvas compresses to ≤ 800px JPEG quality 0.7 (~50–80 KB) before transmit | If decode fails: toast "Could not read image" |
| Pagination boundary | History has 60 receipts; `?page=2` requested | Returns receipts 26–50 newest-first (page is 0-indexed: 0,1,2 → 25/page) | `page` < 0 or > last page → clamp to nearest valid page |
| Receipt spans the minute boundary | Bulk insert's first line at 12:00:59.900, last at 12:01:00.100 | Two receipts surface in history (one per minute window) — known limitation of the heuristic; flagged in deferred-work | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/prisma/schema.prisma:426` -- `IngredientPurchase`: add `invoiceImageUrl String?` column + migration
- `cafe-mgmt/src/actions/inventory.actions.ts` -- add `getPurchaseHistory`, `attachPurchaseInvoice`, `detachPurchaseInvoice` Server Actions; all return `ActionResult<T>`
- `cafe-mgmt/src/lib/purchase-batch.ts` -- **NEW** — pure helpers: `batchKeyFor(row)`, `parseBatchKey(key)`, `groupPurchasesIntoReceipts(rows)` (covered by unit tests so the heuristic is locked)
- `cafe-mgmt/src/app/(app)/purchases/page.tsx` -- read `searchParams.tab` ("log" default / "history"); render `<PurchaseTabs>` and conditionally `<PurchasesForm>` or `<PurchaseHistoryList>`
- `cafe-mgmt/src/components/purchases/purchase-tabs.tsx` -- **NEW** — mirrors `wastage-comp-tabs.tsx`
- `cafe-mgmt/src/components/purchases/purchase-history-list.tsx` -- **NEW** — receipt rows + pagination + attach/replace/detach controls (gated on `isManager` prop). Inline `compressImage` (third copy — see Boundaries)
- `cafe-mgmt/src/components/wastage/wastage-comp-tabs.tsx` -- pattern reference for tabs
- `cafe-mgmt/src/components/grab-and-go/grab-and-go-list.tsx` -- pattern reference for `compressImage`

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/prisma/schema.prisma` -- add `invoiceImageUrl String?` to `IngredientPurchase`. Migration `20260504012245_add_purchase_invoice_image` created and applied; Prisma client regenerated.
- [x] `cafe-mgmt/src/lib/purchase-batch.ts` -- **NEW** — exports `batchKeyFor`, `parseBatchKey`, `groupPurchasesIntoReceipts`, `floorToMinute` + types
- [x] `cafe-mgmt/src/lib/purchase-batch.test.ts` -- **NEW** — 19 tests covering all I/O Matrix grouping scenarios (key stability, key-difference axes, minute-boundary split, newest-first, line ordering, invoice rollup, supplier/creator separation)
- [x] `cafe-mgmt/src/actions/inventory.actions.ts` -- added `getPurchaseHistory`, `attachPurchaseInvoice`, `detachPurchaseInvoice`. All cafe-scoped via session; manager-gated for write; zod-validated; image data URL bounded to ≤3 MB and `data:image/(jpeg|png|webp);base64,…` shape
- [x] `cafe-mgmt/src/actions/inventory.actions.test.ts` -- 14 new tests (happy path attach/detach, STAFF rejected, cross-cafe rejection, pagination clamping, empty history, malformed batchKey rejection, oversized image rejection, non-image data URL rejection, cafeId + 90-day window scoping)
- [x] `cafe-mgmt/src/components/purchases/purchase-tabs.tsx` -- **NEW** — mirrors wastage-comp-tabs pattern with proper `role="tablist"` / `role="tab"` / `aria-selected`
- [x] `cafe-mgmt/src/components/purchases/purchase-history-list.tsx` -- **NEW** — receipt cards with line items, total, attach/replace/remove controls (manager-gated), thumbnail (clickable to open full-size in new tab), pagination
- [x] `cafe-mgmt/src/components/purchases/purchase-history-list.test.tsx` -- **NEW** — 12 tests (empty state, manager/staff visibility, attach calls action with compressed dataUrl, optimistic rollback on failure with toast, detach optimistic, pagination link generation incl. boundary cases)
- [x] `cafe-mgmt/src/app/(app)/purchases/page.tsx` -- now accepts `searchParams.tab` / `searchParams.page`; renders tabs; routes to `LogTab` (unchanged form) or `HistoryTab` (calls `getPurchaseHistory`, serializes Dates → ISO strings, hands off to client list)

**Acceptance Criteria:**
- Given a manager logs 3 lines via the bulk form (one transaction, same minute), when they switch to the History tab, then those 3 lines appear as a single receipt row.
- Given a receipt with no invoice, when a manager picks an image file under the receipt, then within 1 second the row shows the invoice thumbnail and a "Replace" / "Remove" control.
- Given a receipt with an invoice, when a manager clicks "Remove invoice", then the thumbnail disappears and the action call records `invoiceImageUrl = null` on every line in that batch.
- Given a STAFF user opens the History tab, when the receipts render, then no attach/replace/detach controls are visible (read-only view).
- Given the cafe has 60 receipts in the last 90 days, when the manager navigates to `?tab=history&page=2`, then receipts 26–50 (newest-first, 0-indexed pages) render and a "Previous" link is present.
- Given a request with `page=999` for a 60-receipt history, when the action runs, then it clamps to the last valid page (page 2) and returns those receipts — does not error.
- Given a malicious caller crafts a `batchKey` resolving to another cafe's purchases, when `attachPurchaseInvoice` is called, then it returns "Receipt not found" and zero rows are updated.

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name add_purchase_invoice_image` -- expected: migration created and applied; one new nullable column
- `cd cafe-mgmt && npm run build` -- expected: clean build, no TS errors
- `cd cafe-mgmt && npx vitest run src/lib/purchase-batch.test.ts src/actions/inventory.actions.test.ts src/components/purchases/` -- expected: all new tests + existing tests pass
- `cd cafe-mgmt && npx vitest run` -- expected: full unit suite still passes

**Manual checks:**
- Dev server on :4000 → log a new bulk purchase (3 lines) as a manager → switch to `?tab=history` → confirm one receipt row with the 3 lines + total. Click "Attach invoice", pick any image → confirm thumbnail appears. Click "Replace" with a different image → confirm thumbnail updates. Click "Remove invoice" → confirm thumbnail gone. Sign in as STAFF → confirm History tab is visible but attach controls are hidden.

## Spec Change Log

### Iteration 1 — review patches (2026-05-04)

Three patch-class findings applied:

1. **XSS-vector mitigation** — removed the `<a href={dataUrl}>` wrapper around the invoice thumbnail in `purchase-history-list.tsx`. Anchor navigation to `data:` URLs is a known XSS vector for SVG/HTML payloads sniffed despite the `image/jpeg` prefix; the `<img>` tag, by spec, enforces image-content-type rendering and is safe. Trade-off: lost click-to-zoom (acceptable; thumbnail is large enough to verify; deferred for cloud-storage upgrade).
2. **`parseBatchKey` requires canonical UTC ISO** — added a round-trip equality check (`minuteIso !== minuteStart.toISOString()`) to reject TZ offsets and non-canonical formats. Previously a tampered key like `2026-04-29T10:30:00+00:30` (parses to 10:00 UTC, minute-aligned) would have re-targeted a different update window than the UI showed. Defense-in-depth — the existing cafe + minute scoping was already preventing data leakage, but tightening the parser closes a UX-confusion vector.
3. **Test gaps closed** — added `parseBatchKey` rejection cases for TZ-offset / no-ms ISO inputs; added a "first-non-null wins" test for `groupPurchasesIntoReceipts` invoice rollup; added a `Page X of Y` label assertion on multi-page pagination to catch off-by-one regressions.

KEEP: the minute-floor heuristic as the single grouping source of truth (no `PurchaseBatch` entity); `requireRole("MANAGER")` on writes; cafe-scoped `updateMany`; the `data:image/(jpeg|png|webp);base64,` zod regex + 3 MB cap; the optimistic-with-rollback UX pattern.

Documented as design intent (not a defect): MANAGER can attach an invoice to any cafe receipt regardless of which user created the purchase. The action's `where` clause uses `createdById` from the parsed batchKey but never asserts equality to `session.user.id` — this is correct. Managers manage cafe-wide; the `createdById` segment is a grouping discriminator, not a write-permission boundary. Flagged in deferred-work for future readers.

## Suggested Review Order

**Entry point**

- The grouping heuristic that the rest of the feature builds on — pure, fully unit-tested.
  [`purchase-batch.ts`](../../cafe-mgmt/src/lib/purchase-batch.ts)

**Server actions (security-sensitive surface)**

- `parseBatchKey` defense — round-trip ISO check defeats TZ-offset window-shifting tampering.
  [`purchase-batch.ts:38`](../../cafe-mgmt/src/lib/purchase-batch.ts#L38)

- `attachPurchaseInvoice` — manager-gated, zod-validated, cafe-scoped `updateMany` over the parsed minute window.
  [`inventory.actions.ts:850`](../../cafe-mgmt/src/actions/inventory.actions.ts#L850)

- `getPurchaseHistory` — auth-required (STAFF can read), 90-day window, in-memory pagination over grouped receipts.
  [`inventory.actions.ts:781`](../../cafe-mgmt/src/actions/inventory.actions.ts#L781)

**UI: history list**

- Receipt cards + manager-vs-staff visibility + optimistic attach/detach + thumbnail rendering (no anchor — XSS mitigation).
  [`purchase-history-list.tsx`](../../cafe-mgmt/src/components/purchases/purchase-history-list.tsx)

- Page wiring — `?tab=` / `?page=` searchParams routing; serializes Date → ISO for client handoff.
  [`purchases/page.tsx`](../../cafe-mgmt/src/app/(app)/purchases/page.tsx)

**Tabs + schema**

- The new tabs component (mirrors `wastage-comp-tabs`).
  [`purchase-tabs.tsx`](../../cafe-mgmt/src/components/purchases/purchase-tabs.tsx)

- Schema + migration — single nullable `invoiceImageUrl` column.
  [`schema.prisma:435`](../../cafe-mgmt/prisma/schema.prisma#L435)

  [`migration.sql`](../../cafe-mgmt/prisma/migrations/20260504012245_add_purchase_invoice_image/migration.sql)

**Tests**

- Helper tests — every grouping invariant (key stability, minute-boundary split, ordering, rollup, parse rejections incl. TZ-offset).
  [`purchase-batch.test.ts`](../../cafe-mgmt/src/lib/purchase-batch.test.ts)

- Action tests — happy paths, role gating, cross-cafe rejection, pagination clamping, payload validation (size + content-type).
  [`inventory.actions.test.ts:919`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L919)

- Component tests — empty state, role-gated controls, optimistic + rollback, pagination link generation.
  [`purchase-history-list.test.tsx`](../../cafe-mgmt/src/components/purchases/purchase-history-list.test.tsx)
