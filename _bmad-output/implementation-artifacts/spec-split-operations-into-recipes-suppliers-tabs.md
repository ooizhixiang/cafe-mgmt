---
title: 'Split Operations into Separate Recipes and Suppliers Tabs'
type: 'refactor'
created: '2026-04-20'
status: 'done'
baseline_commit: '6a3b313'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Operations tab bundles Suppliers and Recipes behind a sub-tab switcher, adding an extra click and hiding both features behind a single nav item. Users must know to look in "Operations" to find either feature.

**Approach:** Replace the single "Operations" nav item with two top-level tabs — "Suppliers" and "Recipes" — each routing to its own page. Remove the sub-tab switcher component.

## Boundaries & Constraints

**Always:** Both new tabs are visible to all roles (manager and staff). Existing supplier and recipe components (`SupplierList`, `RecipeEditor`) are reused unchanged. Manager-only actions within those components (add/edit/delete) are already gated by `isManager` prop — no changes needed there.

**Ask First:** Icon choices for the two new nav items.

**Never:** Do not change supplier or recipe component internals. Do not remove the `/operations` route until both new routes are confirmed working.

</frozen-after-approval>

## Code Map

- `src/components/ui/bottom-nav.tsx` -- mobile nav items array
- `src/components/ui/side-nav.tsx` -- desktop sidebar nav items array
- `middleware.ts` -- MANAGER_ONLY_PATHS for route protection
- `src/app/(app)/operations/page.tsx` -- current combined page (to be replaced)
- `src/components/operations/operations-tabs.tsx` -- sub-tab switcher (to be deleted)
- `src/domains/feed/supplier-reminder-cards.ts` -- references `/operations` as actionRoute
- `e2e/sales-report.spec.ts` -- references `/operations?tab=recipes`

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(app)/suppliers/page.tsx` -- create -- new page using requireAuth (not requireRole), pass isManager based on session role
- [x] `src/app/(app)/recipes/page.tsx` -- create -- new page using requireAuth (not requireRole), pass isManager based on session role
- [x] `src/components/ui/bottom-nav.tsx` -- modify -- replace Operations item with Suppliers (Truck icon) and Recipes (UtensilsCrossed icon), no managerOnly flag
- [x] `src/components/ui/side-nav.tsx` -- modify -- same nav item replacement as bottom-nav, no managerOnly flag
- [x] `middleware.ts` -- modify -- remove `/operations` from MANAGER_ONLY_PATHS (do not add `/suppliers` or `/recipes`)
- [x] `src/domains/feed/supplier-reminder-cards.ts` -- modify -- update actionRoute from `/operations` to `/suppliers`
- [x] `src/app/(app)/operations/page.tsx` -- delete -- replaced by two separate pages
- [x] `src/components/operations/operations-tabs.tsx` -- delete -- no longer needed
- [x] `e2e/sales-report.spec.ts` -- modify -- update `/operations?tab=recipes` to `/recipes`

**Acceptance Criteria:**
- Given any logged-in user (manager or staff), when viewing the nav, then "Suppliers" and "Recipes" tabs are both visible
- Given any user clicking "Suppliers" tab, when the page loads, then the supplier list is displayed at `/suppliers`
- Given any user clicking "Recipes" tab, when the page loads, then the recipe editor is displayed at `/recipes`
- Given a staff user on suppliers/recipes, when viewing the page, then add/edit/delete actions are hidden (existing `isManager` prop behavior)
- Given the e2e test, when `npx playwright test` runs, then it passes

## Verification

**Commands:**
- `npx next build` -- expected: compiles with no errors
- `npx playwright test e2e/sales-report.spec.ts` -- expected: passes

## Suggested Review Order

**Routing & Pages**

- New suppliers page: requireAuth + isManager prop, supplier query with ingredients
  [`suppliers/page.tsx:1`](../../cafe-mgmt/src/app/(app)/suppliers/page.tsx#L1)

- New recipes page: requireAuth + isManager prop, ingredient query for editor
  [`recipes/page.tsx:1`](../../cafe-mgmt/src/app/(app)/recipes/page.tsx#L1)

**Navigation**

- Mobile nav: Operations replaced with Suppliers (Truck) + Recipes (UtensilsCrossed), no managerOnly
  [`bottom-nav.tsx:24`](../../cafe-mgmt/src/components/ui/bottom-nav.tsx#L24)

- Desktop nav: same item replacement
  [`side-nav.tsx:26`](../../cafe-mgmt/src/components/ui/side-nav.tsx#L26)

**Middleware & References**

- /operations removed from MANAGER_ONLY_PATHS
  [`middleware.ts:5`](../../cafe-mgmt/middleware.ts#L5)

- Supplier reminder actionRoute updated to /suppliers
  [`supplier-reminder-cards.ts:45`](../../cafe-mgmt/src/domains/feed/supplier-reminder-cards.ts#L45)

**Tests**

- E2e test path updated from /operations?tab=recipes to /recipes
  [`sales-report.spec.ts:69`](../../cafe-mgmt/e2e/sales-report.spec.ts#L69)
