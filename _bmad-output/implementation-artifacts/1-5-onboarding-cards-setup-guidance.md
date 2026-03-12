# Story 1.5: Onboarding Cards & Setup Guidance

Status: backlog

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cafe manager**,
I want to see guided setup tasks on the Action Feed when my cafe isn't fully configured,
so that I know what to do next without reading documentation.

## Acceptance Criteria (BDD)

### AC1: Onboarding Card Display Rules
**Given** a manager who has selected a template but hasn't completed setup
**When** they view the Action Feed
**Then** onboarding cards are displayed based on explicit rules:
- No customized ingredients → "Review your ingredient list"
- No customized checklists → "Customize your checklists"
- No staff invited → "Invite a staff member"
- No comp budget set → "Set your comp budget"
**And** cards use the onboarding visual style (blue border, setup icon)
**And** cards are ordered by setup priority: ingredients → checklists → staff → budget

### AC2: Onboarding Task Completion
**Given** an onboarding task is completed
**When** the manager returns to the Action Feed
**Then** the completed onboarding card is removed and replaced by the next setup task or operational cards
**And** completion is triggered by either (a) making a change to the relevant section, OR (b) tapping "Looks good" on the onboarding card to acknowledge defaults are acceptable — both paths dismiss the card

### AC3: All Onboarding Complete
**Given** all onboarding tasks are complete
**When** the manager views the Action Feed
**Then** no onboarding cards remain and the feed shows operational content (or an "All caught up" empty state)

### AC4: Server Action Authorization
**Given** any Server Action in this story (acknowledgeOnboardingStep, getOnboardingStatus)
**When** called by any user
**Then** the action internally validates `requireRole('MANAGER')` or `requireAuth()` as appropriate
**And** returns `{ success: false, error: "Unauthorized" }` if the caller lacks permission

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — Onboarding Tracking** (AC: #1, #2, #3)
  - [ ] Add `onboardingCompletedSteps` field to Cafe model (String[] @default([]) — stores completed step keys like ["ingredients", "checklists", "staff", "comp-budget"])
  - [ ] Run `npx prisma migrate dev --name add-onboarding-tracking`

- [ ] **Task 2: Onboarding Status Logic** (AC: #1, #2, #3)
  - [ ] Create `src/lib/onboarding.ts` — defines onboarding steps with:
    - Step definitions: key, title, description, linkRoute, priority order
    - `getIncompleteSteps(cafe)` — checks actual data (ingredients modified?, staff invited?, etc.) AND explicit acknowledgments
    - Steps: ingredients (check if any ingredient was added/edited/deleted after template), checklists (check if any checklist template item was modified), staff (check if any invite exists), comp-budget (check if CompBudget exists)
  - [ ] Completion detection: either data-based (actual changes detected) or explicit acknowledgment (stored in `onboardingCompletedSteps`)

- [ ] **Task 3: Onboarding Server Actions** (AC: #1, #2, #4)
  - [ ] Create `src/actions/onboarding.actions.ts` (extend existing if created in 1.4) with:
    - `getOnboardingStatus()` — requireAuth(), returns `ActionResult<{ steps: OnboardingStep[], allComplete: boolean }>`
    - `acknowledgeOnboardingStep(formData)` — requireRole('MANAGER'), adds step key to `onboardingCompletedSteps`, returns `ActionResult<void>`

- [ ] **Task 4: Onboarding Card Component** (AC: #1, #2)
  - [ ] Create `src/components/feed/onboarding-card.tsx` — client component:
    - Uses onboarding card variant (blue `--color-info` 4px left border, setup icon)
    - Displays step title and description
    - Two action buttons: primary "Set up" (links to relevant settings page) and secondary "Looks good" (acknowledges defaults)
    - "Looks good" calls `acknowledgeOnboardingStep` and removes card optimistically
  - [ ] Follows standard card anatomy from UX spec

- [ ] **Task 5: Feed Integration** (AC: #1, #3)
  - [ ] Create `src/domains/feed/onboarding-cards.ts` — `getOnboardingCards(cafeId)` returns onboarding cards for incomplete steps
  - [ ] Integrate into feed composer (or prepare for Story 2.1 integration if feed doesn't exist yet)
  - [ ] Cards sorted by priority: ingredients → checklists → staff → budget

- [ ] **Task 6: Tests** (AC: all)
  - [ ] Create `src/lib/onboarding.test.ts`:
    - All steps defined with required fields
    - `getIncompleteSteps` returns correct steps based on cafe state
    - Acknowledged steps are filtered out
    - Empty cafe returns all steps
    - Fully configured cafe returns no steps

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

**Onboarding card visual style:**
- Blue `--color-info` 4px left border
- Setup icon (gear or checklist icon)
- Standard card anatomy from UX spec
- 44x44px minimum touch targets for action buttons
[Source: ux-design-specification.md — Card Anatomy, Onboarding Cards]

### Onboarding Step Definitions

```typescript
const ONBOARDING_STEPS = [
  {
    key: "ingredients",
    title: "Review your ingredient list",
    description: "Customize ingredients for your cafe",
    linkRoute: "/setup/ingredients",
    priority: 1,
  },
  {
    key: "checklists",
    title: "Customize your checklists",
    description: "Edit your Opening, Mid-Day, and Closing checklists",
    linkRoute: "/settings", // checklist management section
    priority: 2,
  },
  {
    key: "staff",
    title: "Invite a staff member",
    description: "Add your team so they can use the app",
    linkRoute: "/settings", // staff management section
    priority: 3,
  },
  {
    key: "comp-budget",
    title: "Set your comp budget",
    description: "Configure weekly comp spending limits",
    linkRoute: "/settings", // comp budget section (Story 3.8)
    priority: 4,
  },
];
```

### Completion Detection Strategy

Two paths to mark a step complete:
1. **Data-based**: Check if actual changes were made (e.g., ingredient added/edited/deleted after template selection)
2. **Explicit acknowledgment**: Manager taps "Looks good" → step key added to `onboardingCompletedSteps` array

A step is complete if EITHER condition is true.

### What This Story Does NOT Include

- The Action Feed itself (Story 2.1) — this story creates the onboarding card components and data logic
- Staff orientation (Story 1.6)
- Checklist template editing UI (Story 2.2)
- Comp budget configuration (Story 3.8) — the onboarding card links to settings but the comp budget section doesn't exist yet

### UX Patterns (MUST FOLLOW)

**Onboarding card layout:**
- Blue `--color-info` 4px left border
- Setup icon (gear or checklist)
- Title and description text
- Two action buttons: primary "Set up" and secondary "Looks good"
- 44x44px minimum touch targets for all interactive elements
- Cards stack vertically in single-column mobile layout
[Source: ux-design-specification.md — Card Anatomy, Onboarding Cards, Touch Targets]

### Project Structure Notes

Files created/modified in this story:
```
prisma/
└── schema.prisma                      ← MODIFY: Add onboardingCompletedSteps to Cafe

src/lib/
└── onboarding.ts                      ← NEW: Onboarding step definitions and logic
└── onboarding.test.ts                 ← NEW: Onboarding logic tests

src/actions/
└── onboarding.actions.ts              ← MODIFY/NEW: getOnboardingStatus, acknowledgeOnboardingStep

src/components/feed/
└── onboarding-card.tsx                ← NEW: Onboarding card component

src/domains/feed/
└── onboarding-cards.ts                ← NEW: Feed onboarding card query
```

### Previous Story Intelligence (Story 1.4)

**Established patterns to follow:**
- `auth.ts` at project root with JWT strategy, dynamic imports for Edge Runtime compat
- `src/lib/auth.ts` re-exports `auth()` + `requireRole()` + `requireAuth()`
- `middleware.ts` uses `auth()` wrapper with mustChangePassword + templateSelected checks
- `src/actions/onboarding.actions.ts` may already exist from Story 1.4 with `selectTemplate()` and `getTemplateStatus()`
- `src/components/ui/toast.tsx` — ToastProvider with `useToast()` hook
- Prisma imports: `@/generated/prisma/client` (PrismaClient), `@/generated/prisma/enums` (Role, Period)
- Zod v4: use `.issues` not `.errors`
- Tailwind v4: CSS-based config, no tailwind.config.ts
- shadcn/ui v4: Button has no `asChild` — use `buttonVariants()` on Link
- Blue buttons: `bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90`

### References

- [Source: epics.md — Story 1.5]
- [Source: architecture.md — ActionResult, Feed Composition, Domain Isolation]
- [Source: prd.md — FR9, FR10]
- [Source: ux-design-specification.md — Card Anatomy, Onboarding Cards]
- [Source: 1-4-quick-start-cafe-template-selection.md — Previous Story Intelligence]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
