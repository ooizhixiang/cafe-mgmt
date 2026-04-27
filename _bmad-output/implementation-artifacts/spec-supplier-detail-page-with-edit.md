---
title: 'Supplier detail page with inline edit'
type: 'feature'
created: '2026-04-27'
status: 'done'
baseline_commit: '46313952d229eff4875d8a625dabc568f291dcba'
context:
  - '{project-root}/cafe-mgmt/prisma/schema.prisma'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Supplier names appear in several places (`/suppliers` cards, the per-ingredient supplier panel) but there is no way to drill in to see one supplier's contact info, the full list of ingredients they supply, or their purchase history. Today the manager has to mentally stitch these together by scanning multiple pages.

**Approach:** Add a route `/suppliers/[id]` rendering a single supplier detail page: contact info at the top (with manager-inline-edit for phone, notes, reminderDays), a "Products supplied" table derived from `IngredientSupplier`, and a "Purchase history" table derived from `IngredientPurchase`. Make the supplier name clickable wherever it currently renders as text.

## Boundaries & Constraints

**Always:**
- Read access: `requireAuth()` only. Both manager and staff can view the page.
- Write access: edits go through the existing `updateSupplier` Server Action which already enforces `requireRole("MANAGER")` and cafeId scoping — reuse it as-is.
- The page must filter by `session.user.cafeId`; rendering or 404'ing must never leak suppliers from other cafes.
- Money displayed as `RM X.XX` using existing patterns; integer cents preserved end-to-end.
- Use the existing `parseRMToCents` helper and `formatRM`-style display where prices appear; do NOT re-introduce `Math.round(parseFloat * 100)`.

**Ask First:**
- If you discover that `updateSupplier` is already used elsewhere in a way that the new edit form would alter (e.g., it normalizes a field unexpectedly): HALT and surface.
- If the route segment `/suppliers/[id]` collides with an existing path or the Next.js config: HALT.

**Never:**
- Don't introduce a new `updateSupplierDetail` action — reuse `updateSupplier`.
- Don't add new Prisma models or migrations. This is a presentation-layer change.
- Don't add `revalidatePath` calls — match the existing client-state-update + toast pattern.
- Don't expose the edit form to staff. Inline edit affordances must be hidden when `userRole !== "MANAGER"`; the action will reject staff anyway, but the UI shouldn't tease.
- Don't show a "Delete supplier" button on this page — keep delete on the existing `/suppliers` list (avoid ambiguous parallel deletion paths).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Manager opens own-cafe supplier | valid id, supplier in this cafe | Page renders contact info, products table, purchase history; edit pencils visible | N/A |
| Staff opens own-cafe supplier | valid id, supplier in this cafe | Same page, no edit pencils, no save buttons | N/A |
| User opens cross-cafe supplier id | id valid in DB but different cafe | `notFound()` → standard 404 | N/A |
| User opens unknown id | id not in DB | `notFound()` → standard 404 | N/A |
| Manager submits inline edit | name non-empty, phone+notes optional, reminderDays integer ≥ 1 | Toast `"Supplier updated"`, fields reflect new values without page reload | invalid → existing zod error path; "Unauthorized" / "Supplier not found" surfaced via toast |
| Manager edits empty phone | submits empty string | Server stores `null` (existing behavior — `phone ?? null`) | N/A |
| Empty products list | supplier has zero `IngredientSupplier` links | Show empty state `"No ingredients linked yet"` | N/A |
| Empty purchase history | zero `IngredientPurchase` rows for this supplier | Show empty state `"No purchases logged yet"` | N/A |
| Click supplier name in `IngredientSuppliersPanel` | any context | Navigate to `/suppliers/[id]` (Next `<Link>`, prefetched) | N/A |
| Click supplier name on `/suppliers` card | any context | Navigate to `/suppliers/[id]` | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/app/(app)/suppliers/[id]/page.tsx` -- NEW RSC: fetches supplier (filtered by cafeId), `ingredientSuppliers: { include: { ingredient } }`, and `ingredientPurchases` for those links. Calls `notFound()` if missing. Passes `userRole` to client component.
- `cafe-mgmt/src/components/operations/supplier-detail.tsx` -- NEW client component: renders three sections (contact / products / history). Inline-edit only when `mode === "manager"`. Uses existing `updateSupplier` Server Action.
- `cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx` -- wrap supplier-name cells in `<Link href={\`/suppliers/${row.supplierId}\`}>` (table view, both manager and readonly modes).
- `cafe-mgmt/src/components/operations/supplier-list.tsx` -- wrap each supplier card's name in `<Link href={\`/suppliers/${s.id}\`}>`. Card-level click should not be hijacked by the link — keep existing tap-to-call/log buttons working.
- `cafe-mgmt/src/components/operations/supplier-detail.test.tsx` -- co-located test (if vitest+RTL pattern exists in the project; otherwise zod-only schema test in `supplier.actions.test.ts` for `updateSupplierSchema` is enough — match existing coverage style).

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/app/(app)/suppliers/[id]/page.tsx` -- create RSC with `params: { id: string }`, fetch supplier scoped to `session.user.cafeId`, `notFound()` on miss, fetch `ingredientPurchases` keyed by the supplier's IngredientSupplier ids, pass shape to client
- [x] `cafe-mgmt/src/components/operations/supplier-detail.tsx` -- new client component: contact section with inline edit (manager only) wired to `updateSupplier`, products table (ingredient name + price + unit), purchase history (ingredient + qty + unit + total + date), proper empty states
- [x] `cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx` -- supplier name in the suppliers table becomes a `<Link>` to the detail page; visible in both manager and readonly modes
- [x] `cafe-mgmt/src/components/operations/supplier-list.tsx` -- supplier name on each card becomes a `<Link>` to the detail page; care must be taken so the link click doesn't fall through to the card's other buttons
- [x] Run `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` and confirm no regressions

**Acceptance Criteria:**
- Given a manager logged into cafe A, when they navigate to `/suppliers/<supplier-from-cafe-A>`, then they see the supplier's contact info, every linked ingredient with price/unit, and every purchase ever logged for any of that supplier's ingredient links — newest first.
- Given a staff member, when they navigate to the same URL, then they see the same data with no edit pencils, no save buttons, and no destructive actions.
- Given any user with a supplier id from cafe B, when they navigate to `/suppliers/<that-id>`, then the page returns 404 and reveals nothing about cafe B.
- Given a manager on the detail page, when they edit phone (or notes, or reminderDays) and save, then the action returns success, the toast displays `"Supplier updated"`, and the on-page fields reflect the new values without a hard reload.
- Given the supplier has zero `IngredientSupplier` links, when the page renders, then the products section shows `"No ingredients linked yet"` and not an empty table header.
- Given any user clicks the supplier name in the `IngredientSuppliersPanel` or on the `/suppliers` list card, then the browser navigates to `/suppliers/[id]` and the existing in-place buttons (call, log call outcome, edit/delete on the card) keep working when their own click targets are tapped.

## Spec Change Log

### Review iteration 1 — 2026-04-27 — one patch applied (no spec changes)

Three-reviewer pass found one real issue worth patching, several rejected/false-positive findings, and two minor defers.

**Patch applied:**
- `cafe-mgmt/src/components/operations/supplier-detail.tsx` — `handleSave` now validates `editReminder` is an integer in [1, 90] before submit. Previously `Number(e.target.value)` could produce `NaN` (empty input) or `0`/decimal/out-of-range values, leading to a generic server-rejected toast. Now the client surfaces a precise message.

**KEEP instructions** (preserve in any future re-derivation):
- Reuse of the existing `updateSupplier` action (no new write actions) — Acceptance Auditor confirmed it correctly enforces `requireRole("MANAGER")` + cafeId scoping. Don't fork into a duplicate `updateSupplierDetail`.
- Phone clearing semantics: client sends `undefined` for empty, action does `phone ?? null`. Auditor verified clearing works end-to-end. Don't change either side.

**Defers** (appended to `deferred-work.md`): unbounded purchase-history fetch on `/suppliers/[id]` (extends the existing pagination defer) and a `router.refresh()` after successful edit to handle hypothetical server-side normalization.

**Rejected (false positives or out of scope):** "phone/notes can't be cleared" (works), tap-to-call URL encoding (cosmetic), long-name h1 overflow (cosmetic), back link to `/suppliers` regardless of origin (browser back works), name editable beyond spec wording (consistent with `/suppliers` list edits), notes-length client guard (server returns precise zod error), missing test file (spec's escape hatch met — no schema changed), `isManager` informational check (server enforces role).

## Verification

**Commands:**
- `cd cafe-mgmt && npm run lint` -- expected: no new errors
- `cd cafe-mgmt && npx tsc --noEmit` -- expected: no new errors
- `cd cafe-mgmt && npm test` -- expected: full suite passes; no schema test changes required
- `cd cafe-mgmt && npm run build` -- expected: route `/suppliers/[id]` shows up in the route manifest

**Manual checks:**
- As manager: from `/settings/ingredients`, expand an ingredient that has 2 linked suppliers, click "Show all suppliers", click the first supplier's name → land on its detail page → edit phone and save → verify toast and live-updated value.
- As staff: same path → verify supplier name is still a link, page renders read-only, no edit pencils.
- Visit `/suppliers/<garbage-id>` → 404.

## Suggested Review Order

**Entry point — the new route**

- RSC fetches supplier scoped to cafeId, then purchases via the supplier's link IDs.
  [`page.tsx:6`](../../cafe-mgmt/src/app/(app)/suppliers/[id]/page.tsx#L6)

- Cross-cafe / unknown id → `notFound()`.
  [`page.tsx:29`](../../cafe-mgmt/src/app/(app)/suppliers/[id]/page.tsx#L29)

**Detail component — the user-facing surface**

- Three sections (contact / products / purchase history); `mode` gates manager edit affordances.
  [`supplier-detail.tsx:54`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L54)

- Inline edit reuses existing `updateSupplier` action; review patch added integer-clamp for `reminderDays`.
  [`supplier-detail.tsx:77`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L77)

- Manager-only edit form; gated by `isEditing && isManager`.
  [`supplier-detail.tsx:126`](../../cafe-mgmt/src/components/operations/supplier-detail.tsx#L126)

**Link wiring — making supplier names clickable**

- Supplier card name on `/suppliers` list now links to the detail page (card buttons untouched).
  [`supplier-list.tsx:264`](../../cafe-mgmt/src/components/operations/supplier-list.tsx#L264)

- Suppliers-table name in the per-ingredient panel now links — both editing and read modes.
  [`ingredient-suppliers-panel.tsx:279`](../../cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx#L279)

  [`ingredient-suppliers-panel.tsx:334`](../../cafe-mgmt/src/components/ingredients/ingredient-suppliers-panel.tsx#L334)
