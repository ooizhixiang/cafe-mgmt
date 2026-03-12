# Story 1.3: Unified Settings & Checklist Time Boundaries

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cafe manager**,
I want a centralized settings screen where I can configure checklist time periods,
so that the app matches my cafe's daily rhythm.

## Acceptance Criteria (BDD)

### AC1: Unified Settings Screen Layout
**Given** an authenticated manager
**When** they tap the Settings tab
**Then** a unified settings screen is displayed with clearly labeled sections in this order:
  1. Cafe Settings (timezone, checklist time boundaries)
  2. Staff Management (invite + staff list — from Story 1.2)
  3. Checklist Configuration (link placeholder — Story 2.2)
  4. Comp Budget (placeholder — Story 3.8)
  5. Ingredient Management (placeholder — Story 3.1)
**And** sections not yet available (from later epics) are simply absent, not disabled or greyed out

### AC2: Timezone Configuration
**Given** a manager on the Cafe Settings section
**When** they select a timezone from a dropdown
**Then** the cafe's timezone is updated in the database
**And** a success toast is shown: "Settings saved"
**And** the timezone is used for all time-of-day business logic (checklist periods, comp week boundaries)

### AC3: Checklist Time Boundary Configuration
**Given** a manager on the Cafe Settings section
**When** they configure checklist time boundaries
**Then** they can set start/end times for Opening, Mid-Day, and Closing periods
**And** the boundaries are saved and take effect on the next checklist reset
**And** a success toast is shown: "Time boundaries saved"

### AC4: Default Time Boundaries
**Given** time boundaries are not configured (null in database)
**When** the system needs period boundaries
**Then** sensible defaults are used:
  - Opening: 5:00 AM – 9:00 AM
  - Mid-Day: 9:00 AM – 3:00 PM
  - Closing: 3:00 PM – 9:00 PM

### AC5: Time Boundary Validation — No Overlaps
**Given** a manager sets overlapping time boundaries (e.g., Opening ends at 10:00 AM but Mid-Day starts at 9:00 AM with Opening ending at 10:00 AM)
**When** they attempt to save
**Then** a validation error explains the overlap and prevents saving
**And** each period's end time must equal the next period's start time (contiguous, no gaps)

### AC6: Time Boundary Validation — Logical Order
**Given** a manager sets a period where start >= end
**When** they attempt to save
**Then** a validation error is shown: "End time must be after start time"

### AC7: Settings Persistence
**Given** a manager has saved settings
**When** they return to the Settings screen later
**Then** all previously saved values are pre-populated in the form

### AC8: Server Action Authorization
**Given** any Server Action in this story (updateCafeSettings, updateTimeBoundaries)
**When** called by any user
**Then** the action internally validates `requireRole('MANAGER')` from the session
**And** returns `{ success: false, error: "Unauthorized" }` if the caller is not a manager

## Tasks / Subtasks

- [x] **Task 1: Database Schema — Cafe Model Extension** (AC: #2, #3, #4, #7)
  - [x] Add time boundary fields to Cafe model in `prisma/schema.prisma`:
    - `openingStart` (String?, default null — format "HH:mm", e.g. "05:00")
    - `openingEnd` (String?, default null)
    - `midDayStart` (String?, default null)
    - `midDayEnd` (String?, default null)
    - `closingStart` (String?, default null)
    - `closingEnd` (String?, default null)
  - [x] Run `npx prisma migrate dev --name add-time-boundaries`
  - [x] Verify migration applies cleanly against existing schema

- [x] **Task 2: Settings Server Actions** (AC: #2, #3, #5, #6, #8)
  - [x] Create `src/actions/settings.actions.ts` with:
    - `getCafeSettings()` — returns cafe timezone and time boundaries for `session.user.cafeId`
    - `updateCafeSettings(formData)` — validates `requireRole('MANAGER')`, updates timezone, returns `ActionResult<void>`
    - `updateTimeBoundaries(formData)` — validates `requireRole('MANAGER')`, validates no overlaps and logical order, updates all 6 time boundary fields, returns `ActionResult<void>`
  - [x] Add Zod schemas: `updateCafeSettingsSchema` (timezone string), `updateTimeBoundariesSchema` (6 time strings, all required when saving)
  - [x] Validation: periods must be contiguous (openingEnd === midDayStart, midDayEnd === closingStart), each start < end
  - [x] All actions derive `cafeId` from `session.user.cafeId`
  - [x] All actions return `ActionResult<T>`

- [x] **Task 3: getCafeNow Utility** (AC: #2, #4)
  - [x] Create `getCafeNow(timezone: string): Date` in `src/lib/format.ts`
  - [x] Returns current time adjusted to cafe's timezone
  - [x] Create `getDefaultTimeBoundaries()` helper returning default values
  - [x] Add tests for `getCafeNow` and default time boundaries

- [x] **Task 4: Cafe Settings UI Component** (AC: #1, #2, #7)
  - [x] Create `src/components/settings/cafe-settings.tsx` — timezone dropdown with common US timezones + UTC
  - [x] Pre-populate with current cafe timezone from server data
  - [x] Auto-save on timezone change (no separate save button for timezone)
  - [x] Toast on success: "Settings saved"

- [x] **Task 5: Time Boundaries UI Component** (AC: #3, #4, #5, #6, #7)
  - [x] Create `src/components/settings/time-boundaries.tsx` — form with 3 period rows (Opening, Mid-Day, Closing), each with start/end time selects
  - [x] Use native `<select>` elements with 30-minute increments (per UX spec — no custom picker for MVP)
  - [x] Pre-populate with saved values or defaults if null
  - [x] "Save" button at bottom, full-width, 48px height
  - [x] Disable button + "Saving..." state on submit
  - [x] Client-side validation before submit: check contiguous and logical order
  - [x] Display inline error messages below relevant fields
  - [x] Toast on success: "Time boundaries saved"

- [x] **Task 6: Settings Page Restructure** (AC: #1)
  - [x] Update `src/app/(app)/settings/page.tsx` — restructure into ordered sections:
    1. Cafe Settings (timezone + time boundaries) — NEW
    2. Staff Management (existing from Story 1.2)
    3. Account info + Logout (existing from Story 1.1)
  - [x] Each section has a clear heading using `text-value` typography
  - [x] Sections have `space-y-[var(--space-6)]` between them

- [x] **Task 7: Tests** (AC: all)
  - [x] Create `src/actions/settings.actions.test.ts` with tests for:
    - Time boundary validation: contiguous periods pass, overlapping fail, gaps fail
    - Logical order: start < end passes, start >= end fails
    - Default time boundaries values
  - [x] Extend `src/lib/format.test.ts` with tests for:
    - `getCafeNow()` returns date in correct timezone
    - `getDefaultTimeBoundaries()` returns correct defaults

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

**ActionResult<T> — The ONE Return Type:**
```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
```
Every Server Action returns this. No exceptions.
[Source: architecture.md — ActionResult pattern]

**Never accept cafeId from client** — always derive from `session.user.cafeId` on server side.
[Source: architecture.md — Security Hardening]

**Server Actions location** — Settings actions go in a NEW file `src/actions/settings.actions.ts` (separate domain from auth).
[Source: architecture.md — File naming: `src/actions/*.actions.ts`]

**Time storage format** — Store time boundaries as String in "HH:mm" format (e.g., "05:00", "15:00"). This avoids timezone conversion issues with DateTime fields. Parse with simple string comparison for validation.

### Timezone Safety (Critical)

**`getCafeNow(timezone)` utility:**
```typescript
// src/lib/format.ts
export function getCafeNow(timezone: string): Date {
  // Returns current time in cafe's timezone
  // Used for: checklist auto-selection, comp week boundaries, "today" filters
}
```
Never use `new Date()` for business logic. Server `@default(now())` for timestamps is UTC and correct. `getCafeNow()` is for time-of-day logic only.
[Source: architecture.md — Timezone Safety]

### Default Time Boundaries

```typescript
const DEFAULT_TIME_BOUNDARIES = {
  openingStart: "05:00",
  openingEnd: "09:00",
  midDayStart: "09:00",
  midDayEnd: "15:00",
  closingStart: "15:00",
  closingEnd: "21:00",
};
```

### Time Boundary Validation Rules

1. **Contiguous**: `openingEnd === midDayStart` AND `midDayEnd === closingStart`
2. **Logical order**: For each period, `start < end` (simple string comparison works for "HH:mm")
3. **No gaps allowed**: The three periods must cover a continuous block of time
4. **24-hour format**: Always store/compare in "HH:mm" 24-hour format

### Common US Timezones for Dropdown

```typescript
const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "UTC", label: "UTC" },
];
```

### UX Patterns (MUST FOLLOW)

**Form patterns** (for time boundaries form):
- Single-column, full-width
- Labels above inputs (never placeholder-as-label)
- 16px field gap
- Full-width primary button at bottom, 48px height
- Disable button after first tap + "Saving..." state, re-enable on response
- Validation on blur, not on keystroke
- Red border + inline SM error text below field
[Source: ux-design-specification.md — Form Patterns]

**Date/time inputs:** Native `<select>` for time pickers. No custom picker for MVP.
[Source: ux-design-specification.md — Form Patterns]

**Toast pattern:** Dark toast, white text, 5s auto-dismiss, stackable, positioned bottom (above nav).
[Source: ux-design-specification.md — Modal & Overlay Patterns]

### Settings Page Section Order

The Settings page follows a defined section order per UX spec. Story 1.3 adds section 1:
1. **Cafe Settings (timezone, time boundaries) — THIS STORY**
2. Staff Management (invite + staff list — Story 1.2)
3. Account info + Logout (Story 1.1)
4. Checklist Configuration (Story 2.2 — absent for now)
5. Comp Budget (Story 3.8 — absent for now)
6. Ingredient Management (Story 3.1 — absent for now)

Build cafe settings as self-contained components (`CafeSettings`, `TimeBoundaries`) imported into the Settings page.
[Source: epics.md — Story 1.3 AC]

### What This Story Does NOT Include

- Checklist template management UI (Story 2.2)
- Comp budget configuration (Story 3.8)
- Ingredient management (Story 3.1)
- Actual checklist creation/completion (Story 2.3)
- Time-aware feed/checklist auto-selection (Story 2.4)
- Using `getCafeNow()` for feed logic (Story 2.1+)

### Project Structure Notes

Files created/modified in this story:
```
prisma/
└── schema.prisma                      ← MODIFY: Add time boundary fields to Cafe

src/actions/
└── settings.actions.ts                ← NEW: getCafeSettings, updateCafeSettings, updateTimeBoundaries
└── settings.actions.test.ts           ← NEW: Validation and boundary tests

src/lib/
└── format.ts                          ← MODIFY: Add getCafeNow, getDefaultTimeBoundaries
└── format.test.ts                     ← MODIFY: Add tests for new functions

src/components/settings/
├── cafe-settings.tsx                  ← NEW: Timezone dropdown
└── time-boundaries.tsx                ← NEW: Time boundary configuration form

src/app/(app)/settings/
└── page.tsx                           ← MODIFY: Restructure with Cafe Settings section
```

### Previous Story Intelligence (Story 1.2)

**Established patterns to follow:**
- `auth.ts` at project root with JWT strategy, dynamic imports for Edge Runtime compat
- `src/lib/auth.ts` re-exports `auth()` + `requireRole()` + `requireAuth()`
- `middleware.ts` uses `auth()` wrapper with mustChangePassword check
- `src/actions/auth.actions.ts` has all auth/invite/staff actions
- `src/components/ui/toast.tsx` — ToastProvider with `useToast()` hook
- `src/components/ui/confirmation-dialog.tsx` — Reusable dialog
- Settings page at `src/app/(app)/settings/page.tsx` already has Account + Staff sections
- App layout wraps with `<ToastProvider>`

**Key technical decisions from Story 1.1/1.2:**
- Prisma v7: `prisma.config.ts` for config, `@prisma/adapter-pg` for adapter
- Prisma imports: `@/generated/prisma/client` (PrismaClient), `@/generated/prisma/enums` (Role)
- Zod v4: use `.issues` not `.errors`
- Tailwind v4: CSS-based `@theme inline {}`, `@utility`, `@custom-variant` — NO tailwind.config.ts
- shadcn/ui v4: Button has no `asChild` — use `buttonVariants()` on Link
- Run migrations with direct connection (port 5432), app uses pooler (port 6543)
- Blue buttons: `bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90`

### References

- [Source: epics.md — Story 1.3]
- [Source: architecture.md — Timezone Safety, Data Architecture]
- [Source: prd.md — FR72, FR73]
- [Source: ux-design-specification.md — Form Patterns, Settings, Role-Based UX]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
