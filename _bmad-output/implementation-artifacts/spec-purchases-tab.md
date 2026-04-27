---
title: 'Purchases tab — supplier-first multi-line purchase entry'
type: 'feature'
created: '2026-04-27'
status: 'done'
baseline_commit: 'c6604a9793c9b0864f1d80d7089a723e34b1f48c'
context:
  - '{project-root}/cafe-mgmt/prisma/schema.prisma'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-multi-supplier-pricing-and-purchase-history.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-allow-staff-purchase-and-call-logging.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Logging purchases is one ingredient at a time, buried inside the per-ingredient supplier panel. An 8-line invoice means re-picking the same supplier 8 times.

**Approach:** New top-level "Purchases" tab. Pick supplier once, add N ingredient lines, submit all in one transaction. Per-supplier price and unit auto-fill from `IngredientSupplier`; user can override unit price or total. If a chosen ingredient isn't yet linked to that supplier, the user can create the link inline — staff get this power on this tab only.

## Boundaries & Constraints

**Always:**
- Single submit creates N `IngredientPurchase` rows in one `prisma.$transaction`. Any line failure rolls back everything.
- Auto-fill each line: `unitPriceInCents` and `unit` from the matching `IngredientSupplier` (cafe-scoped, by `ingredientId + supplierId`); total prefills as `unitPrice × quantity`. Manual overrides to unit price or total are honoured — do not re-derive after edit.
- Server stores only `totalPriceInCents`. Unit-price math stays client-side.
- `cafeId` and `createdById` always derived server-side from session. Money: integer cents; use `parseRMToCents`.
- For an unlinked ingredient: request must include `priceInCents` + `unit`. Server creates the `IngredientSupplier` row in the same transaction, then the purchase against it.
- Inline link creation is allowed for STAFF + MANAGER through this new bulk action only. The standalone `addIngredientSupplier` action stays MANAGER-only.
- Reject duplicate ingredient lines within one submission with a friendly message.

**Ask First:**
- If any existing call-site treats `IngredientSupplier` rows as immutable historical snapshots (e.g. for analytics), HALT — staff inline link creation would change that assumption.
- If 9 tabs overflow the bottom nav at 390px width, HALT and ask whether to drop a tab or shrink labels.

**Never:**
- No editing, voiding, or deleting past purchases. No backdating — `createdAt` is server `now()`.
- No receipt photo / file upload.
- No mutation of `Ingredient.costPerUnitInCents` from a purchase.
- No partial-success path. No new desktop/sidebar nav surface beyond what already mirrors `NAV_ITEMS`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|----------|---------------|----------|----------------|
| Happy path, all linked | supplier + N lines with existing `ingredientSupplierId` | N purchase rows created in one txn, attributed to caller | N/A |
| Unlinked ingredient line | line has `ingredientId` (no link) + `priceInCents` + `unit` | Create link, then purchase, in same txn | Missing price/unit → `"Set a price for <ingredient>"` |
| User overrides total | unit price prefilled, total field edited | Stored total = override (ignore client unit-price math) | N/A |
| Duplicate ingredient lines | two lines reference same ingredient | Reject before DB write | `"Ingredient X appears twice — combine the lines"` |
| Race on link creation | two staff add same link concurrently | One wins; loser catches P2002, re-reads existing link, then writes purchase | Second failure → rollback + friendly error |
| Cross-cafe id | supplierId/ingredientId from another cafe | Reject; nothing persists | `"Supplier not found"` / `"Ingredient not found"` |
| Invalid number / 0 lines / no session | bad qty / empty lines / no auth | Zod or auth rejects before DB | First-issue message / `"Add at least one line"` / `"Unauthorized"` |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/components/ui/bottom-nav.tsx` -- insert `Purchases` (icon `ShoppingCart`, route `/purchases`) at index 7, before `Revenue`.
- `cafe-mgmt/src/app/(app)/purchases/page.tsx` -- new server component. Fetch suppliers with `ingredientSuppliers` (incl. ingredient) + all cafe ingredients. Same query shape as `/suppliers/page.tsx:10–78`. Render `<PurchasesForm>` under `<h1>Purchases</h1>`.
- `cafe-mgmt/src/components/purchases/purchases-form.tsx` -- new client component. Supplier select → dynamic line list. Each line: ingredient select (alphabetical; suffix "(not linked — price required)" for unlinked options), quantity (int), unit (text, prefilled), unit price RM (prefilled, editable), total RM (prefilled `qty × unitPrice`, editable). Add/remove line buttons. Submit calls bulk action.
- `cafe-mgmt/src/actions/inventory.actions.ts` -- add `bulkCreateIngredientPurchases` action + zod schema. Single `prisma.$transaction` validates each line, looks up or creates the link, creates the purchase. `requireAuth()`. Mirror error handling of `createIngredientPurchase` and the P2002 retry pattern in `addIngredientSupplier` (setup.actions.ts:382–404). `logError` on unexpected failures.
- `cafe-mgmt/src/actions/inventory.actions.test.ts` -- add tests covering every row of the I/O & Edge-Case Matrix.
- `cafe-mgmt/src/components/purchases/purchases-form.test.tsx` -- new test file. Cover prefill on supplier change, total recompute before override, override stickiness, "add link" flow, duplicate-line guard, success/error toasts.

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/actions/inventory.actions.ts` -- add `bulkCreateIngredientPurchasesSchema` (supplierId + lines: each with `ingredientId`, optional `ingredientSupplierId`, `quantity` int ≥ 1, `unit` 1–20, `totalPriceInCents` int ≥ 0, optional `priceInCents` int ≥ 0) and `bulkCreateIngredientPurchases` action returning `ActionResult<{ ids: string[] }>`. All DB work in one transaction.
- [x] `cafe-mgmt/src/actions/inventory.actions.test.ts` -- add tests for every I/O Matrix row, plus full-rollback on any line failure.
- [x] `cafe-mgmt/src/app/(app)/purchases/page.tsx` -- new server component per Code Map.
- [x] `cafe-mgmt/src/components/purchases/purchases-form.tsx` -- form per Code Map. Use `parseRMToCents`; format display as `RM X.XX`. Toast on success/error; reset form and stay on page after success.
- [x] `cafe-mgmt/src/components/purchases/purchases-form.test.tsx` -- component tests per Code Map.
- [x] `cafe-mgmt/src/components/ui/bottom-nav.tsx` -- insert nav item at index 7; add `ShoppingCart` import.

**Acceptance Criteria:**
- Given a manager with a supplier that has 5 linked ingredients, when they open `/purchases`, pick that supplier, add 3 lines (one quantity-only, one with overridden unit price, one with overridden total), and submit, then 3 `IngredientPurchase` rows exist with correct `cafeId`, `createdById`, and totals (override values win), and the form resets.
- Given a staff member, when they open `/purchases`, then they see the same form as a manager (no role-locked controls hidden).
- Given a staff member adds a line for an ingredient not yet linked to the chosen supplier and supplies quantity + price + unit, when they submit, then a new `IngredientSupplier` row is created and the purchase row is created in the same transaction, both visible afterwards.
- Given any single line in a multi-line submission has invalid data, when the user submits, then no rows persist and the error toast names the first failing line.
- Given two lines reference the same ingredient, when the user submits, then the request is rejected before any DB write.
- Given the request is tampered to point at another cafe's supplier or ingredient, then the action returns `"Supplier not found"` / `"Ingredient not found"` and writes nothing.

## Spec Change Log

### Iteration 1 patches — 2026-04-27
- **Trigger:** review found three real bugs caused by the change.
- **Patch 1:** `purchases-form.tsx` `handleIngredientChange` now resets `totalTouched=false` and re-derives `totalRM` from the new ingredient's prefill. Avoids stale total carrying across ingredient changes on the same row.
- **Patch 2:** `handleSupplierChange` confirms with the user before wiping populated lines. Avoids accidental destruction of in-flight entry on dropdown bump.
- **Patch 3:** Added `submittingRef` synchronous guard in `handleSubmit` to bridge the gap between client validation and `startTransition`'s async body, preventing a fast double-click from firing the action twice.
- Five additional findings deferred to `deferred-work.md` under "From spec-purchases-tab (review iteration 1, 2026-04-27)" — they are either spec-compliant edge cases worth a future product decision, or rare concurrency races.

### Iteration 3 — 2026-04-27 (Q3 reversal)
- **Trigger:** product decision recorded in `spec-restrict-purchase-picker-to-linked.md`. The original Q3 ("a and b — show all ingredients, offer to add link inline") was reversed to "show only the supplier's linked ingredients".
- **Resulting impact:** the inline-link-creation server path in `bulkCreateIngredientPurchases`, the per-line `priceInCents` field, and the P2002 race-recovery code are removed. The form's ingredient picker is restricted to `currentSupplier.links`. When the chosen supplier has no linked ingredients, the line editor and submit button are replaced with a message pointing the user to Suppliers.
- **Reason recorded for future re-derivation:** keeping catalog mutation out of the daily-logging form retires the silent-discard race (already in deferred-work) and the unit-snapshot risk surface, and produces a clearer mental model — managers own the catalog, staff log against it.

### Iteration 2 patch — 2026-04-27 (post-merge regression catch)
- **Trigger:** user reported "I don't see the Purchases tab" on desktop. Investigation found a second nav array in `cafe-mgmt/src/components/ui/side-nav.tsx` (desktop side rail, `lg:flex`) that the original codebase exploration missed. Spec's hint "whatever else already mirrors `NAV_ITEMS`" failed to force the discovery.
- **Patch:** Added `ShoppingCart` import and the `{ href: "/purchases", label: "Purchases", icon: ShoppingCart }` entry to `side-nav.tsx`'s `NAV_ITEMS`, in the same logical slot (between Grab & Go and Revenue).
- **Postmortem note:** future quick-dev planning should grep for parallel `NAV_ITEMS` arrays (or any "duplicated source-of-truth lookup") before touching nav. Single-source nav config would prevent this class of regression entirely — defer as a refactor candidate.

## Verification

**Commands:**
- `cd cafe-mgmt && npm run build` -- expected: clean build.
- `cd cafe-mgmt && npm test` -- expected: full suite passes; new tests included.
- `cd cafe-mgmt && npm run lint` -- expected: no new errors.

**Manual checks:**
- On a 390px-wide viewport, confirm the bottom nav shows all 9 tabs without overflow worse than the existing tightest tab. If overflow, halt per Ask First.

## Suggested Review Order

**Server primitive — the new transactional bulk-write**

- Zod schema defines the line-level contract (linked vs unlinked branches via optional `ingredientSupplierId` / `priceInCents`).
  [`inventory.actions.ts:32`](../../cafe-mgmt/src/actions/inventory.actions.ts#L32)

- Action entry; `requireAuth()` allows staff per spec, `cafeId`/`userId` derived server-side.
  [`inventory.actions.ts:456`](../../cafe-mgmt/src/actions/inventory.actions.ts#L456)

- Pre-transaction duplicate-ingredient guard; rejects without touching the DB.
  [`inventory.actions.ts:475`](../../cafe-mgmt/src/actions/inventory.actions.ts#L475)

- Single `prisma.$transaction` covers ingredient pre-load, optional link creation, and all purchase rows — atomic rollback on any throw.
  [`inventory.actions.ts:497`](../../cafe-mgmt/src/actions/inventory.actions.ts#L497)

- Inline `IngredientSupplier.create` with P2002 race re-read — the only place staff can create supplier links.
  [`inventory.actions.ts:550`](../../cafe-mgmt/src/actions/inventory.actions.ts#L550)

**UI — form state machine and override semantics**

- Override-stickiness flags `unitPriceTouched` / `totalTouched` per line — both reset when ingredient changes (patch from review).
  [`purchases-form.tsx:129`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L129)

- Supplier change with populated lines now confirms before wiping (patch from review).
  [`purchases-form.tsx:101`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L101)

- Submit: synchronous double-click guard via `submittingRef` (patch from review), then payload build with linked/unlinked branching.
  [`purchases-form.tsx:201`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L201)

**Plumbing**

- Server component fetches suppliers + their links + all cafe ingredients; flattens into props.
  [`page.tsx:1`](../../cafe-mgmt/src/app/(app)/purchases/page.tsx#L1)

- Nav item inserted at index 7 (between Grab&Go and Revenue).
  [`bottom-nav.tsx:32`](../../cafe-mgmt/src/components/ui/bottom-nav.tsx#L32)

**Tests**

- Action tests cover every I/O Matrix row plus mid-transaction rollback.
  [`inventory.actions.test.ts:99`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L99)

- Form tests cover prefill, override stickiness, the new ingredient-change reset, and the new supplier-change confirm.
  [`purchases-form.test.tsx:60`](../../cafe-mgmt/src/components/purchases/purchases-form.test.tsx#L60)
