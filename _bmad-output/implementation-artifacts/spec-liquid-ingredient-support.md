---
title: 'Liquid Ingredient Support (ml up to 10,000)'
type: 'feature'
created: '2026-04-21'
status: 'done'
route: 'one-shot'
---

## Intent

**Problem:** Liquid ingredients (measured in ml, l, oz, etc.) were capped at 999 in the inventory counter, making it impossible to track larger quantities like 5,000 ml of milk.

**Approach:** Detect liquid units (ml, l, oz, fl oz, cl) and raise the inventory counter max to 10,000. Widen the input field for larger numbers.

## Suggested Review Order

- Liquid unit detection and max calculation
  [`inventory-list.tsx:372`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L372)

- Input width adapts for 4-5 digit numbers
  [`inventory-list.tsx:95`](../../cafe-mgmt/src/components/inventory/inventory-list.tsx#L95)
