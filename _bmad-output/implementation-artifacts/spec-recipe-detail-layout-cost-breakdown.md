---
title: 'Recipe Detail Layout with Cost Breakdown'
type: 'refactor'
created: '2026-04-21'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** The recipe detail view had a confusing "main recipe" framing, mixed cost info into the header, and lacked a detailed cost breakdown per ingredient.

**Approach:** Restructure to: Recipe (ingredients) → Variations → Instructions → Cost Breakdown table (ingredient, qty, unit cost, subtotal, total). Removed inline cost from header.

## Suggested Review Order

- Recipe section (renamed from Ingredients), variations moved up, instructions renamed from Steps
  [`recipe-editor.tsx:491`](../../cafe-mgmt/src/components/operations/recipe-editor.tsx#L491)

- Cost breakdown table with per-ingredient subtotals and total footer
  [`recipe-editor.tsx:610`](../../cafe-mgmt/src/components/operations/recipe-editor.tsx#L610)
