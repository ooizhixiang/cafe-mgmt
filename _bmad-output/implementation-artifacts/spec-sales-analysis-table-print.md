---
title: 'Sales Analysis Table View with Print Support'
type: 'feature'
created: '2026-04-20'
status: 'done'
baseline_commit: '6a3b313'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The sales analysis view uses bar charts which don't clearly state recipe quantities and can't be printed as a clean report. Managers need a printable table showing recipes sold and ingredients used.

**Approach:** Replace the bar-chart cards with proper HTML tables for recipes and ingredients. Add a "Print Report" button that triggers `window.print()` with print-friendly CSS that hides nav, controls, and non-essential UI.

## Boundaries & Constraints

**Always:** Keep the summary card (total items sold) and the day/week/month range selector. Tables must include clear column headers.

**Ask First:** Nothing anticipated.

**Never:** Do not add PDF generation libraries. Do not change the data model or server actions.

</frozen-after-approval>

## Code Map

- `src/components/daily-report/sales-analysis.tsx` -- analysis UI with bar charts to replace with tables
- `src/app/globals.css` -- add @media print rules

## Tasks & Acceptance

**Execution:**
- [x] `src/components/daily-report/sales-analysis.tsx` -- modify -- replace bar-chart sections with tables (# column, name, qty sold/used, unit); add Print Report button calling window.print()
- [x] `src/app/globals.css` -- modify -- add @media print rules to hide nav, range selector, print button, and non-essential chrome; ensure tables print cleanly

**Acceptance Criteria:**
- Given sales data exists, when viewing the Analysis tab, then recipes are shown in a table with columns: Recipe, Qty Sold
- Given sales data exists, when viewing the Analysis tab, then ingredients are shown in a table with columns: Ingredient, Amount Used, Unit
- Given the Analysis tab is displayed, when clicking "Print Report", then the browser print dialog opens with a clean table layout
- Given the print view, when previewing, then nav bars, range buttons, and print button are hidden

## Spec Change Log

## Verification

**Commands:**
- `npx next build` -- expected: compiles with no errors
