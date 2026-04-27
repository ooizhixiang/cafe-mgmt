---
title: 'Allow staff to log purchases and call outcomes'
type: 'feature'
created: '2026-04-27'
status: 'done'
baseline_commit: '58282095dba89b409d6b9bbe2c4155dfa7ee6425'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-multi-supplier-pricing-and-purchase-history.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** During the multi-supplier review pass we tightened `logCallOutcome` and kept `createIngredientPurchase` at `requireRole("MANAGER")` to close a privilege-escalation hole. The cafe trust model is different from what was assumed — staff are expected to record their own purchases and call outcomes as part of normal counter work. Today they can view but not log, which forces every entry through a manager bottleneck.

**Approach:** Relax the role gate from `requireRole("MANAGER")` to `requireAuth()` on exactly two server actions — `logCallOutcome` and `createIngredientPurchase` — and surface their corresponding UI affordances (the "Log purchase" button, the call-outcome prompt) to staff. Supplier-link CRUD (add / edit price / remove) stays manager-only. This is a deliberate, scoped reversal of one prior security patch with clear-eyed acceptance of the trade-off.

## Boundaries & Constraints

**Always:**
- Both relaxed actions still tenant-scope on `session.user.cafeId` and verify resource ownership before writing. Never accept `cafeId`/`userId` from the client.
- The actions still record `createdById` from `session.user.id`, so every purchase and call log is attributable.
- Manager-only writes that remain manager-only: `addIngredientSupplier`, `updateIngredientSupplier`, `removeIngredientSupplier`, `addSupplier`, `updateSupplier`, `deleteSupplier`, `updateIngredientConfig`. Don't relax these.
- Money still stored as integer cents; use the existing `parseRMToCents` helper end-to-end. No re-introducing `parseFloat * 100`.
- No `revalidatePath` calls; use the existing client-state-update + toast pattern.

**Ask First:**
- If you discover any other action that depends on the manager-gate-on-purchase invariant (e.g., a feed card, a report) and would break with staff entries: HALT.

**Never:**
- Don't introduce a new role or modify the `Role` enum.
- Don't relax any action other than `logCallOutcome` and `createIngredientPurchase`.
- Don't show the "Edit price" pencil or the "Remove supplier" trash icon to staff in the suppliers table.
- Don't surface the "Add supplier" form on the panel to staff.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Staff opens ingredient panel on `/inventory` | logged-in STAFF, ingredient with linked suppliers | Suppliers table renders. Each row shows the "Log purchase" button. NO Edit pencil or Remove trash. NO Add-supplier form. | N/A |
| Staff clicks "Log purchase" | sub-form valid (qty>0, unit, total≥0) | New `IngredientPurchase` row stored with `createdById = staff user.id`. Toast `"Purchase logged"`. History list updates. | invalid → existing zod error path |
| Staff taps Call on `/suppliers` | logged-in STAFF | Call-outcome prompt opens; staff picks NO_ANSWER, CALL_BACK, or ORDERED (with optional sub-form). | invalid sub-form → existing inline error |
| Staff submits ORDERED with purchase sub-form | valid payload | `SupplierCallLog` + linked `IngredientPurchase` created in one transaction, `lastOrderDate` updated. Both rows attributed to the staff user. | partial failure → existing transaction rollback |
| Staff submits ORDERED + Skip | valid | Only the call log is created. Existing one-click semantics preserved. | N/A |
| Staff attempts to add/edit/remove a supplier link | direct call to `addIngredientSupplier` / `updateIngredientSupplier` / `removeIngredientSupplier` | Server returns `"Unauthorized"` (existing `requireRole("MANAGER")` enforcement). UI never exposes the buttons to begin with. | N/A |
| Manager flow | logged-in MANAGER | Behavior unchanged: full CRUD on suppliers, full call/purchase logging. | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/actions/supplier.actions.ts` -- `logCallOutcome`: change `requireRole("MANAGER")` → `requireAuth()`. Everything else (cafe scoping, `purchase` payload validation, `prisma.$transaction`) stays.
- `cafe-mgmt/src/actions/inventory.actions.ts` -- `createIngredientPurchase`: change `requireRole("MANAGER")` → `requireAuth()`. Everything else stays.
- `cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx` -- restructure the per-row action cluster so the "Log purchase" button renders for both `mode === "manager"` and `mode === "readonly"`, while the Pencil (edit) and Trash (remove) icons stay gated to `isManager`. The "Add supplier" footer form remains gated to manager.
- `cafe-mgmt/src/actions/supplier.actions.test.ts` -- update existing test fixtures that assume `logCallOutcome` requires a MANAGER session (zod schema tests are unaffected; only any role-shape tests need the role flipped to STAFF). If no such test exists, no change.
- `cafe-mgmt/src/actions/inventory.actions.test.ts` -- same check for `createIngredientPurchase`.
- `_bmad-output/implementation-artifacts/spec-multi-supplier-pricing-and-purchase-history.md` -- append a Spec Change Log entry noting the two-action relaxation introduced by THIS spec, with a back-reference. Do NOT edit the frozen-after-approval block.

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/actions/supplier.actions.ts` -- swap `requireRole("MANAGER")` for `requireAuth()` in `logCallOutcome`
- [x] `cafe-mgmt/src/actions/inventory.actions.ts` -- swap `requireRole("MANAGER")` for `requireAuth()` in `createIngredientPurchase`
- [x] `cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx` -- pull the "Log purchase" button OUT of the `{isManager && (...)}` block; keep Pencil and Trash inside it
- [x] Audit `cafe-mgmt/src/actions/supplier.actions.test.ts` and `cafe-mgmt/src/actions/inventory.actions.test.ts` for assertions tied to the manager-only gate; update if any
- [x] Append a Spec Change Log entry to `spec-multi-supplier-pricing-and-purchase-history.md` cross-referencing this spec
- [x] Run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` and confirm no regressions

**Acceptance Criteria:**
- Given a STAFF user logged into cafe A, when they open `/inventory` and expand an ingredient with at least one linked supplier, then the "Log purchase" button appears on each supplier row and the Edit pencil / Remove trash do NOT appear.
- Given a STAFF user clicks "Log purchase" and submits a valid sub-form, then a new `IngredientPurchase` row exists in the DB with `createdById = staff user.id`, the toast reads `"Purchase logged"`, and the history table updates.
- Given a STAFF user on `/suppliers` taps Call on a supplier, picks ORDERED, fills the sub-form, and submits, then exactly one `SupplierCallLog` and one `IngredientPurchase` (linked via `supplierCallLogId`) exist, both attributed to the staff user; `lastOrderDate` updated.
- Given a STAFF user attempts `addIngredientSupplier`, `updateIngredientSupplier`, or `removeIngredientSupplier` directly, then the server returns `"Unauthorized"` and the row is not changed (existing manager-gate enforcement, regression-tested by inspection).
- Given a MANAGER user, all behaviour from the prior spec is byte-identical: still sees Edit/Remove buttons, still logs calls and purchases.

## Spec Change Log

## Verification

**Commands:**
- `cd cafe-mgmt && npm run lint` -- no new errors
- `cd cafe-mgmt && npx tsc --noEmit` -- only the 2 pre-existing errors
- `cd cafe-mgmt && npm test` -- 209 tests still pass (no schema changes; any role-bound tests updated)
- `cd cafe-mgmt && npm run build` -- production build succeeds

**Manual checks:**
- Log in as STAFF: `/inventory` → expand ingredient → "Show all suppliers" → "Log purchase" button visible, Pencil/Trash hidden → log a purchase → history table shows the entry.
- As same STAFF: `/suppliers` → tap Call on a supplier → choose ORDERED → fill sub-form → confirm new history row.
- Log in as MANAGER: same paths render unchanged (Pencil + Trash + Add-supplier all visible).

## Suggested Review Order

**The relaxation (3 surgical edits)**

- Manager check dropped on the call-log path; cafe-scoping and `createdById` attribution preserved.
  [`supplier.actions.ts:200`](../../cafe-mgmt/src/actions/supplier.actions.ts#L200)

- Same swap on the manual purchase-log path.
  [`inventory.actions.ts:405`](../../cafe-mgmt/src/actions/inventory.actions.ts#L405)

- "Log purchase" button pulled out of the `isManager` block; Pencil + Trash stay inside.
  [`ingredient-suppliers-panel.tsx:344`](../../cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx#L344)

**Verify nothing else loosened**

- `addSupplier` / `updateSupplier` / `deleteSupplier` still manager-only.
  [`supplier.actions.ts:103`](../../cafe-mgmt/src/actions/supplier.actions.ts#L103)

- `addIngredientSupplier` / `updateIngredientSupplier` / `removeIngredientSupplier` still manager-only.
  [`setup.actions.ts:343`](../../cafe-mgmt/src/actions/setup.actions.ts#L343)

**Cross-spec audit trail**

- The amendment is recorded against the originating spec under "Cross-spec amendment".
  [`spec-multi-supplier-pricing-and-purchase-history.md`](spec-multi-supplier-pricing-and-purchase-history.md)
