---
title: 'Restrict purchase picker to supplier-linked products only'
type: 'refactor'
created: '2026-04-27'
status: 'done'
baseline_commit: 'c6604a9793c9b0864f1d80d7089a723e34b1f48c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-purchases-tab.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The just-shipped Purchases tab lets staff log a purchase against any ingredient — if the ingredient isn't yet in the chosen supplier's catalog, the form asks for a price and the server creates the `IngredientSupplier` link inline. This mixes catalog management with daily logging: a typo at log time pins a wrong unit price for the catalog, a race between two staff inline-creating the same link silently overwrites one user's typed price, and the dropdown shows ingredients that aren't actually buyable from the chosen supplier.

**Approach:** Reverse the original Q3 decision. Restrict the form's ingredient picker to ingredients **already linked** to the selected supplier. When a supplier has zero linked ingredients, replace the line editor and submit button with a message pointing the user to the Suppliers tab. Tighten the server: lines must always carry an `ingredientSupplierId`; the inline-link-creation branch is removed entirely (along with `priceInCents` from the line schema and the P2002 race-recovery code). Catalog mutations stay in the manager-only Suppliers UI where they already live.

## Boundaries & Constraints

**Always:**
- Ingredient `<select>` lists only ingredients linked to the currently chosen supplier, alphabetical. The "(not linked — price required)" suffix and unlinked options are removed.
- When the chosen supplier has 0 linked ingredients: render a single message replacing both the line editor and the submit button — `"This supplier has no products yet. Add one in Suppliers."` The supplier dropdown stays interactive so the user can pick a different supplier.
- Server schema for `bulkCreateIngredientPurchases` requires `ingredientSupplierId` on every line and removes the optional `priceInCents` field. Auto-fill prefill of unit + unit price from the link continues to work; the existing override stickiness (unit price OR total) is unchanged.
- Server action's transaction body no longer contains the inline-link-create branch or the P2002 race re-read. A line whose `ingredientSupplierId` doesn't resolve in the cafe-scoped pre-load is rejected with the existing string `"Ingredient supplier link not found"`.
- Tests for the removed paths are deleted (not stubbed). Tests asserting the picker-restriction and empty-state are added.
- After implementation, append a **Spec Change Log** entry to `spec-purchases-tab.md` recording this reversal so the original spec's intent is not contradicted silently.

**Ask First:**
- If a grep across `cafe-mgmt/src` finds any *other* caller of `bulkCreateIngredientPurchases` that passes lines without `ingredientSupplierId`, HALT and report the call sites before tightening the schema.

**Never:**
- Do not reintroduce the inline-link-creation path "for future flexibility" — keep the surface honest.
- Do not change the role gate. `requireAuth()` (staff + manager) stays.
- Do not modify `addIngredientSupplier`, `createIngredientPurchase`, or any other action.
- Do not introduce a new "add product" affordance on the Purchases tab. Catalog work happens in `/suppliers` only.
- Do not change the override semantics for unit price or total on linked lines.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|----------|---------------|----------|----------------|
| Supplier with linked ingredients | user picks supplier with N>0 links | Dropdown shows exactly those N ingredients, alphabetical | N/A |
| Supplier with 0 linked ingredients | user picks such a supplier | Line editor + submit replaced with the empty-state message; supplier dropdown still interactive | N/A |
| Submit with valid linked lines | each line has resolvable `ingredientSupplierId` | Action behaves as before; one transaction, N rows | N/A |
| Tampered request omitting `ingredientSupplierId` | line lacks the field | Zod rejects | First-issue message returned |
| Tampered request with stale `ingredientSupplierId` (link removed) | id no longer in cafe-scoped pre-load | Action rejects | `"Ingredient supplier link not found"` |
| Tampered request with extra `priceInCents` field | unknown field on line | Zod strips silently OR rejects (per existing schema mode); no link is ever created | If schema is `.strict()`, rejection message returned |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/src/actions/inventory.actions.ts` -- in `bulkCreateIngredientPurchasesSchema`, change `ingredientSupplierId` from optional to required (`z.string().min(1)`) and remove the `priceInCents` field. In the action body, delete the inline-link-create branch (lines around 535–585), the P2002 race-recovery, and any now-unused error strings; keep the `"Ingredient supplier link not found"` rejection path.
- `cafe-mgmt/src/actions/inventory.actions.test.ts` -- delete tests "creates IngredientSupplier link inline for unlinked ingredient", "rejects unlinked line missing priceInCents", "handles P2002 race on link creation…", "rolls back when P2002 race re-read still fails". Add: "rejects line missing ingredientSupplierId via zod", "rejects stale ingredientSupplierId returning 'Ingredient supplier link not found'".
- `cafe-mgmt/src/components/purchases/purchases-form.tsx` -- replace `sortedIngredients` (all cafe ingredients) with a memoized list derived from `currentSupplier.links` (alphabetical by `ingredientName`). Remove the "(not linked — price required)" option suffix. Remove the unlinked branch in `handleSubmit` (no more `priceInCents` in payload). When `currentSupplier && currentSupplier.links.length === 0`, render the empty-state message in place of the line editor + submit button.
- `cafe-mgmt/src/components/purchases/purchases-form.test.tsx` -- delete the "submits unlinked-ingredient line with priceInCents and no ingredientSupplierId" test. Update fixtures so `sup2` either gains a linked ingredient or is used to assert the empty-state message. Add: "shows empty-state message when supplier has no linked ingredients", "ingredient dropdown lists only the supplier's linked ingredients".
- `cafe-mgmt/_bmad-output/implementation-artifacts/spec-purchases-tab.md` -- append a Spec Change Log entry (iteration 3) recording this Q3 reversal and pointing to this spec.
- `cafe-mgmt/_bmad-output/implementation-artifacts/deferred-work.md` -- mark "Concurrent inline-link race silently discards the staff-entered priceInCents/unit" as **resolved by reversal** (struck through or moved under a "Resolved" subsection). The unit-snapshot validation item stays — staff can still edit the unit on a linked row.

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/src/actions/inventory.actions.ts` -- tighten schema (`ingredientSupplierId` required, drop `priceInCents`); remove inline-create branch and P2002 recovery from action body.
- [x] `cafe-mgmt/src/actions/inventory.actions.test.ts` -- delete the 4 tests covering removed paths; add the 2 new tests above.
- [x] `cafe-mgmt/src/components/purchases/purchases-form.tsx` -- restrict picker to linked ingredients; render empty-state when `currentSupplier.links.length === 0`; remove the unlinked branch in `handleSubmit`.
- [x] `cafe-mgmt/src/components/purchases/purchases-form.test.tsx` -- delete the unlinked-submit test; add empty-state and linked-only-dropdown tests.
- [x] `cafe-mgmt/_bmad-output/implementation-artifacts/spec-purchases-tab.md` -- append Spec Change Log entry pointing to this spec.
- [x] `cafe-mgmt/_bmad-output/implementation-artifacts/deferred-work.md` -- mark the silent-discard-race item resolved.

**Acceptance Criteria:**
- Given supplier "Acme" has 3 linked ingredients, when a user picks Acme on `/purchases`, then the ingredient dropdown shows exactly those 3 names alphabetically (no others, no "(not linked)" suffix).
- Given supplier "Beta" has 0 linked ingredients, when a user picks Beta, then the line editor and submit button are replaced with `"This supplier has no products yet. Add one in Suppliers."` and the supplier dropdown remains usable.
- Given a tampered POST omitting `ingredientSupplierId` on a line, when the action runs, then it rejects via Zod and writes nothing to the DB.
- Given a tampered POST with a stale `ingredientSupplierId` (the link was removed), when the action runs, then it returns `"Ingredient supplier link not found"` and writes nothing.
- Given a request shape that previously contained `priceInCents` on a line, when the action runs, then it succeeds (field ignored) or rejects (field rejected) per the schema's strict-vs-passthrough mode — but in no case does it create an `IngredientSupplier` row.

## Spec Change Log

### Iteration 1 review patches — 2026-04-27
- **Trigger:** Acceptance auditor flagged that I/O Matrix row "extra `priceInCents` field is stripped/ignored, no link created" passed by construction but lacked a direct assertion. Edge-case + blind hunters separately flagged unused test scaffolding (`linkFindFirst`) left over from the deleted inline-link path.
- **Patches:**
  - Added `inventory.actions.test.ts` test "ignores extra priceInCents on a line and never creates a link" — closes the matrix gap.
  - Removed the unused `linkFindFirst` mock from `TxState` and both `bindTransaction` setups. Kept `linkCreate` with a comment marking it as a deliberate regression guard (existing tests assert `not.toHaveBeenCalled()` to ensure the inline-create path stays gone).
- All other reviewer findings were either pre-existing in the original Purchases-tab spec (already in `deferred-work.md` or out of scope here) or rejected as non-bugs.

## Verification

**Commands:**
- `cd cafe-mgmt && npm run build` -- expected: clean.
- `cd cafe-mgmt && npm test` -- expected: full suite passes; deleted tests gone, new tests included.
- `cd cafe-mgmt && npm run lint` -- expected: no new errors.

## Suggested Review Order

**Server primitive — what was simplified**

- Schema now requires `ingredientSupplierId` and no longer carries `priceInCents`.
  [`inventory.actions.ts:32`](../../cafe-mgmt/src/actions/inventory.actions.ts#L32)

- Transaction body shrunk: only path is "look up the link or reject"; inline-create + P2002 recovery deleted.
  [`inventory.actions.ts:526`](../../cafe-mgmt/src/actions/inventory.actions.ts#L526)

**UI — picker restriction and empty-state**

- `supplierIngredients` is derived purely from `currentSupplier.links` (no fallback to all cafe ingredients).
  [`purchases-form.tsx:89`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L89)

- Empty-state gate replaces the line editor when the chosen supplier has no linked products.
  [`purchases-form.tsx:308`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L308)

- Submit button is also gated on the same empty-state condition.
  [`purchases-form.tsx:442`](../../cafe-mgmt/src/components/purchases/purchases-form.tsx#L442)

**Tests**

- Action test: missing `ingredientSupplierId` → zod reject, no DB write.
  [`inventory.actions.test.ts:382`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L382)

- Action test: stale `ingredientSupplierId` → friendly rejection.
  [`inventory.actions.test.ts:404`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L404)

- Action test (review-loop addition): extra `priceInCents` field is stripped, no link is created.
  [`inventory.actions.test.ts:431`](../../cafe-mgmt/src/actions/inventory.actions.test.ts#L431)
