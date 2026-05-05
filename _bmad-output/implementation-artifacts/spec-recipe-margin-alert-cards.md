---
title: 'Action feed margin alerts: warn when recipe selling price violates a per-cafe margin floor'
type: 'feature'
created: '2026-05-04'
status: 'done'
context: []
baseline_commit: '5712db434b7d94ac82e0e7af1e15c68f7109e6fe'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers can set selling prices that result in losses (selling < cost) or thin margins, with no visible warning. They want the action feed to surface recipes whose price falls below a configurable margin floor — so they catch under-priced items before they ship more sales.

**Approach:** Add a per-cafe `minMarginPercent` setting (default 20, range 0–99) editable in `/settings`. New feed source `getMarginAlertCards` scans every recipe and its variations: for each variation (or base recipe if no variations), compute cost = base ingredients + this variation's add-ons (mirrors deduction model and the just-shipped recipe-list cost rule), resolve effective selling price (variation's own → fallback to recipe-level), compute margin = (selling − cost) / selling. If margin falls below `minMarginPercent`, group losing variations into ONE card per recipe and emit it. Skip silently when selling price isn't set or cost can't be computed.

## Boundaries & Constraints

**Always:**
- One card per recipe (option 1a from clarification). The card lists every losing variation in its subtitle ("Small loses $0.20, Medium thin at 12% margin"). A recipe with no variations and a losing base price emits one "Original" entry.
- Margin formula: `(selling - cost) / selling`. Outright loss (cost > selling) → margin negative, always below any non-negative floor. `selling = 0` → undefined, skip.
- Threshold: warn when `margin < minMarginPercent / 100`. Default `minMarginPercent = 20` (i.e., warn unless ≥ 20% margin).
- Variation selling price: variation's own → fall back to recipe-level (`recipe.sellingPriceInCents`). Only check if at least one of the two is set (skip un-priced).
- Variation cost: base ingredients + this variation's add-ons (the cost model from `daily-report.actions.ts:161-199` and `getRecipes`).
- Card visibility: ALL roles see it (consistent with existing `getCompWarningCards`, `getAlertCards`, `getSupplierReminderCards`).
- Settings update: MANAGER-only, zod-validated (integer 0..99), `revalidatePath` so the feed re-renders next tick.

**Ask First:** None — defaults established at clarification step.

**Never:**
- Don't add a per-variation card. Only per-recipe. (Option 1a chosen.)
- Don't persist margin alerts in a DB table. Compute on-the-fly per request (mirrors comp-warning pattern; cost/selling are dynamic).
- Don't change FIFO consumption, recipe storage, or any cost-computation helper. Reuse `currentCostPerUnit` + `findOldestNonEmptyLot`.
- Don't alert when cost can't be computed (some ingredient has no derived cost AND no override). Stay silent — same threshold as the recipe-list dash.
- Don't alert on a variation whose effective selling price is 0 / null. Manager hasn't priced it yet — pre-launch state, not a margin failure.
- Don't lower priority below P3 (alert tier). Margin issues should sit alongside other manager-attention warnings, not informational summaries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output | Error Handling |
|----------|--------------|-----------------|----------------|
| Recipe selling > cost with healthy margin | base cost $1.00, sells $5.00 (80% margin), floor 20% | No card emitted | N/A |
| Recipe with outright loss | cost $2.00, sells $1.00 | One card, priority 3, "Latte priced below cost (loss $1.00 / serving)" | N/A |
| Recipe with thin margin | cost $4.00, sells $4.50 (≈11% margin), floor 20% | One card, "Latte margin 11% below 20% floor" | N/A |
| Recipe with variations, mixed | Small healthy ($5/$1), Medium thin ($5/$4.20) | One card listing only Medium — Small omitted from subtitle | N/A |
| Variation un-priced, recipe-level set | variation `sellingPriceInCents = null`, recipe-level $5 | Variation uses $5 fallback for the margin check | N/A |
| Variation un-priced, recipe-level also null | both null | Skip silently — pre-launch state, not a margin failure | N/A |
| Some variation cost can't be resolved | one variation has an unresolvable ingredient cost | Skip THAT variation; still check the others | N/A |
| Recipe with no variations, base cost null | base recipe has no ingredients yet | Skip silently (no cost = no comparison) | N/A |
| Floor set to 0 | manager wants to be warned only on outright loss | Card fires only when `cost > selling` (margin < 0) | N/A |
| Floor set to 99 | extreme — almost everything losing | Most recipes emit a card; no special-case handling | N/A |
| Settings update by STAFF | `setMinMarginPercent` called by STAFF | Returns "Unauthorized"; no DB write | Toast |
| Settings update with invalid value | value < 0, > 99, or non-integer | Returns validation error; no DB write | Toast |
| Empty cafe (no recipes) | `recipes.length === 0` | Empty array — no cards | N/A |

</frozen-after-approval>

## Code Map

- `cafe-mgmt/prisma/schema.prisma` -- `Cafe`: add `minMarginPercent Int @default(20)` + migration
- `cafe-mgmt/src/lib/margin.ts` -- **NEW** — pure helpers: `computeMargin(sellingCents, costCents): number | null` (returns ratio 0..1, null when undefined), `isBelowFloor(margin, floorPercent): boolean`, `effectiveSellingPrice(variation, recipe): number | null`
- `cafe-mgmt/src/lib/margin.test.ts` -- **NEW** — covers each helper, including divide-by-zero, negative margin, fallback resolution
- `cafe-mgmt/src/actions/setup.actions.ts` -- add `setMinMarginPercent(value: number)`. requireRole("MANAGER"), zod `int().min(0).max(99)`, `revalidatePath` for `/settings` and `/` (action feed lives on home).
- `cafe-mgmt/src/actions/setup.actions.test.ts` -- tests for the new action
- `cafe-mgmt/src/components/settings/min-margin.tsx` -- **NEW** — small input section in `/settings`, optimistic + rollback. Manager-only.
- `cafe-mgmt/src/components/settings/min-margin.test.tsx` -- **NEW**
- `cafe-mgmt/src/app/(app)/settings/page.tsx` -- load `cafe.minMarginPercent`; render `<MinMarginSettings>` near the Units section
- `cafe-mgmt/src/domains/feed/margin-alert-cards.ts` -- **NEW** — load all recipes (+ variations + ingredients with cost/override fields), reuse the cost-summing logic from `getRecipes`, evaluate per-variation margin, group losers per recipe, emit one card with subtitle listing each losing variation and its margin/loss
- `cafe-mgmt/src/domains/feed/margin-alert-cards.test.ts` -- **NEW** — covers every I/O Matrix scenario
- `cafe-mgmt/src/domains/feed/composer.ts` -- import + invoke `getMarginAlertCards` in the parallel cards fetch (~line 50)
- `cafe-mgmt/src/domains/feed/composer.test.ts` -- update if it asserts the set of card sources

## Tasks & Acceptance

**Execution:**
- [x] `cafe-mgmt/prisma/schema.prisma` -- added `minMarginPercent Int @default(20)` + migration `20260504064440_add_cafe_min_margin_percent`. Prisma client regenerated.
- [x] `cafe-mgmt/src/lib/margin.ts` + `cafe-mgmt/src/lib/margin.test.ts` -- **NEW** — `computeMargin`, `isBelowFloor`, `effectiveSellingPrice`. 19 tests covering positive/zero/negative margin, divide-by-zero, NaN/Infinity, fallback resolution edges, floor boundary semantics.
- [x] `cafe-mgmt/src/actions/setup.actions.ts` + test -- added `setMinMarginPercent(value)`. MANAGER-gated; zod `int().min(0).max(99)`; persists; `revalidatePath("/settings")` + `revalidatePath("/")`. 6 tests.
- [x] `cafe-mgmt/src/components/settings/min-margin.tsx` + test -- **NEW** — onBlur save with optimistic + rollback; STAFF disabled; client-side validation rejects non-integer/out-of-range input. 6 tests.
- [x] `cafe-mgmt/src/app/(app)/settings/page.tsx` -- loads `cafe.minMarginPercent`; renders `<MinMarginSettings>` in a new section after Units.
- [x] `cafe-mgmt/src/domains/feed/margin-alert-cards.ts` + test -- **NEW** — loads cafe + recipes (with full include shape mirroring `getRecipes`); reuses `findOldestNonEmptyLot` + `currentCostPerUnit`; per-recipe loop produces one card listing losing variations. URGENT (red) border for any outright loss; WARNING (amber) for thin-margin only. 13 tests.
- [x] `cafe-mgmt/src/domains/feed/composer.ts` -- import + invoke `getMarginAlertCards(cafeId)` in the parallel fetch; existing `composer.test.ts` doesn't assert the source list shape and continues to pass.

**Acceptance Criteria:**
- Given a recipe with selling $5.00 and cost $1.00 (80% margin) and floor 20%, when the action feed loads, then no margin alert card appears for that recipe.
- Given a recipe with selling $1.00 and cost $2.00 (outright loss), when the feed loads, then a card appears with priority 3, **urgent (red) border** (escalated severity for outright loss; thin-margin-only cards use amber), title "{recipe name} priced below cost", and a subtitle quantifying the loss per affected variation.
- Given a recipe with two variations (Small healthy, Medium below floor), when the feed loads, then exactly one card appears for the recipe; subtitle mentions only Medium.
- Given a variation with no own selling price but the recipe-level price is set, when margin is evaluated, then the recipe-level price is used as the variation's effective selling price.
- Given a variation with no own selling price AND the recipe-level price is also unset, when the feed loads, then no card is emitted for that variation (pre-launch state).
- Given a variation whose cost can't be resolved (missing ingredient cost), when the feed loads, then that variation is silently skipped — other variations of the same recipe are still evaluated.
- Given the manager opens `/settings` and changes the floor from 20 to 30, when the action feed reloads, then any recipe between 20% and 30% margin newly shows an alert card.
- Given STAFF tries to save a new floor, when `setMinMarginPercent` is called, then it returns "Unauthorized" and the value isn't persisted.
- Given the manager submits a floor of `150`, when validation runs, then the action returns an error and no DB write occurs.

## Verification

**Commands:**
- `cd cafe-mgmt && npx prisma migrate dev --name add_cafe_min_margin_percent` -- migration applied
- `cd cafe-mgmt && npm run build` -- clean build
- `cd cafe-mgmt && npx vitest run` -- existing + new tests pass

**Manual checks:**
- Dev server on :4000 → `/settings` → confirm new "Minimum Margin" input shows 20%. Set a recipe's selling price below cost on `/recipes` → return to `/` → confirm a margin alert card appears with the recipe name and the loss summary. Adjust the floor to 0 → confirm the card stays only if there's an outright loss; adjust to 50 → confirm more recipes start firing.

## Spec Change Log

### Iteration 1 — review patches (2026-05-04)

Three patch-class findings applied + one spec self-contradiction reconciled:

1. **Empty-everywhere guard added** to `getMarginAlertCards`. A recipe with no base ingredients AND no variation ingredients would return `baseCost = 0` (vacuous-true reduce), compute as 100% margin, and silently pass — correct outcome by accident, but inconsistent with the explicit `totalIngredientRows === 0` guard added in `recipe.actions.ts:230`. Now matched: explicit `continue` for the pre-launch state.
2. **Tests added** for the `discontinued: false` filter (so a regression dropping the WHERE clause would fail) and for the mixed-loss + thin-margin case (escalates the card to URGENT but still itemizes both per-variation losses in the subtitle).
3. **AC text reconciled.** AC #2 originally said "amber border" for outright loss, contradicting the Tasks/Code-Map decision to use urgent-red for outright loss (amber for thin-margin only). The implementation choice is the right one (urgent severity for outright loss draws the eye); amended the AC wording to match.

KEEP: per-recipe single-card grouping (1a from clarification); margin formula `(selling - cost) / selling` with strict `<` against `floor / 100`; variation→recipe-level selling-price fallback (treating 0 as "not set" for parity with the editor); silent skip on un-resolvable cost or null selling; ALL-roles visibility (consistent with other feed-card sources); 19 + 6 + 6 + 16 = 47 new tests across 4 files.

## Suggested Review Order

**Foundation — pure helpers**

- Margin math, floor comparison, fallback resolution. Each fully unit-tested.
  [`margin.ts`](../../cafe-mgmt/src/lib/margin.ts)

**Schema + action**

- New per-cafe column, default 20.
  [`schema.prisma:43`](../../cafe-mgmt/prisma/schema.prisma#L43)

  [`migration.sql`](../../cafe-mgmt/prisma/migrations/20260504064440_add_cafe_min_margin_percent/migration.sql)

- The setting persistence — manager-gated, validated 0..99, revalidates `/settings` and `/`.
  [`setup.actions.ts:617`](../../cafe-mgmt/src/actions/setup.actions.ts#L617)

**Settings UI**

- Numeric input with onBlur save, optimistic + rollback, STAFF disabled.
  [`min-margin.tsx`](../../cafe-mgmt/src/components/settings/min-margin.tsx)

- Settings page wiring — new section after Units.
  [`settings/page.tsx`](../../cafe-mgmt/src/app/(app)/settings/page.tsx)

**The new feed source**

- Loads cafe + recipes + ingredients; builds the per-ingredient cost map; per recipe, evaluates base case OR each variation; emits one card per recipe with itemized subtitle. URGENT (red) for outright loss, WARNING (amber) for thin-margin only.
  [`margin-alert-cards.ts`](../../cafe-mgmt/src/domains/feed/margin-alert-cards.ts)

- Empty-everywhere guard added in iteration 1 (consistency with `recipe.actions.ts`).
  [`margin-alert-cards.ts:201`](../../cafe-mgmt/src/domains/feed/margin-alert-cards.ts#L201)

- Composer wires the new source into the existing `Promise.allSettled` parallel fetch.
  [`composer.ts:55`](../../cafe-mgmt/src/domains/feed/composer.ts#L55)

**Tests (47 new)**

- Helper math edges + boundary semantics.
  [`margin.test.ts`](../../cafe-mgmt/src/lib/margin.test.ts)

- Action — happy path, boundary values, role gate, validation, revalidation.
  [`setup.actions.test.ts`](../../cafe-mgmt/src/actions/setup.actions.test.ts)

- Settings UI — initial render, save, rollback, validation, STAFF disabled.
  [`min-margin.test.tsx`](../../cafe-mgmt/src/components/settings/min-margin.test.tsx)

- Feed source — every I/O Matrix scenario + iteration-1 patches (discontinued filter pinned, mixed loss/thin variations, pre-launch empty guard).
  [`margin-alert-cards.test.ts`](../../cafe-mgmt/src/domains/feed/margin-alert-cards.test.ts)
