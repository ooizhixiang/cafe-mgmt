# Story 1.6: Staff First Login & Orientation

Status: backlog

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **staff member**,
I want to see a brief orientation when I first log in,
so that I understand what the app does and how to use it without training.

## Acceptance Criteria (BDD)

### AC1: First Login Orientation Display
**Given** a staff member logging in for the first time
**When** they are authenticated and enter the app
**Then** an orientation message is displayed explaining the app's purpose and their role
**And** the bottom navigation shows only their accessible tabs (Action Feed, Wastage/Comp)

### AC2: Orientation Dismissal
**Given** the staff member dismisses the orientation
**When** they return to the app on subsequent logins
**Then** the orientation is not shown again

### AC3: Empty Feed State
**Given** a staff member on the Action Feed
**When** no checklists or tasks exist yet
**Then** a friendly empty state is shown (not a broken or blank screen)

### AC4: Server Action Authorization
**Given** any Server Action in this story (dismissOrientation)
**When** called by any user
**Then** the action validates `requireAuth()` and returns appropriate errors

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — First Login Tracking** (AC: #1, #2)
  - [ ] Add `firstLoginAt` field to User model (DateTime? — null means never logged in, set on first login)
  - [ ] Add `orientationDismissedAt` field to User model (DateTime? — null means not dismissed)
  - [ ] Run `npx prisma migrate dev --name add-first-login-tracking`

- [ ] **Task 2: First Login Detection** (AC: #1, #2)
  - [ ] Update auth login flow to set `firstLoginAt` on first successful login (only if currently null)
  - [ ] Add `orientationDismissedAt` and `firstLoginAt` to session/JWT if needed for client-side checks

- [ ] **Task 3: Orientation Server Action** (AC: #2, #4)
  - [ ] Add to `src/actions/auth.actions.ts`:
    - `dismissOrientation()` — requireAuth(), sets `orientationDismissedAt` to now(), returns `ActionResult<void>`

- [ ] **Task 4: Orientation Component** (AC: #1, #2)
  - [ ] Create `src/components/onboarding/staff-orientation.tsx` — client component:
    - Full-screen overlay or modal with welcome message
    - Explains: "Welcome to [Cafe Name]! This app helps you track daily tasks, log wastage, and manage comp events."
    - Shows what tabs they can access (Action Feed, Wastage/Comp)
    - "Got it" dismiss button (full-width, 48px height)
    - On dismiss: calls `dismissOrientation()` and hides the overlay

- [ ] **Task 5: Empty State Component** (AC: #3)
  - [ ] Create `src/components/ui/empty-state.tsx` — reusable variant-based empty state component:
    - Props: icon, title, description, optional action button
    - Variants: "no-tasks" (friendly message for empty feed), "all-caught-up" (positive completion state for Story 2.4)
    - Centered layout, muted colors, 44px touch target for action button if present
  - [ ] Use in Action Feed when no cards exist for staff

- [ ] **Task 6: Feed Page Integration** (AC: #1, #3)
  - [ ] Update Action Feed page to:
    - Check if staff user needs orientation (firstLoginAt exists but orientationDismissedAt is null)
    - Show orientation overlay if needed
    - Show empty state if no feed cards exist

- [ ] **Task 7: Tests** (AC: all)
  - [ ] Create `src/components/ui/empty-state.test.ts`:
    - Renders with required props
    - Action button renders when provided
    - Correct variant styling applied
  - [ ] Test orientation dismiss flow (unit test for action)

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

**Never accept cafeId/userId from client** — always derive from session.
[Source: architecture.md — Security Hardening]

### Empty State Component Design

```typescript
// src/components/ui/empty-state.tsx
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: "no-tasks" | "all-caught-up";
}
```

Reused by Story 2.4 ("All caught up") and throughout the app for empty lists.

### Orientation Content

```
Welcome to [Cafe Name]!

This app helps your team:
• Complete daily checklists
• Log wastage and comp events
• Stay on top of what needs doing

You can access the Action Feed and Wastage/Comp screens. Your manager handles settings and configuration.

[Got it]
```

### What This Story Does NOT Include

- Onboarding cards for managers (Story 1.5)
- Action Feed implementation (Story 2.1)
- Checklist display (Story 2.3)
- "All caught up" state (Story 2.4)

### UX Patterns (MUST FOLLOW)

**Orientation overlay:**
- Full-screen overlay or centered modal
- Clear welcome heading with cafe name
- Bulleted list of app capabilities
- "Got it" dismiss button: full-width, 48px height, primary style
- 44x44px minimum touch targets
[Source: ux-design-specification.md — Onboarding, Touch Targets]

**Empty state:**
- Centered layout with icon, title, and description
- Muted colors (gray text on white background)
- Optional action button with 44px touch target
- Friendly, non-technical language
[Source: ux-design-specification.md — Empty States]

### Project Structure Notes

Files created/modified in this story:
```
prisma/
└── schema.prisma                      ← MODIFY: Add firstLoginAt, orientationDismissedAt to User

src/actions/
└── auth.actions.ts                    ← MODIFY: Add dismissOrientation action, update login flow

src/components/onboarding/
└── staff-orientation.tsx              ← NEW: Orientation overlay for staff first login

src/components/ui/
└── empty-state.tsx                    ← NEW: Reusable empty state component
└── empty-state.test.ts               ← NEW: Empty state tests

src/app/(app)/
└── page.tsx                           ← MODIFY: Add orientation check and empty state
```

### Previous Story Intelligence (Story 1.5)

**Established patterns to follow:**
- `auth.ts` at project root with JWT strategy, dynamic imports for Edge Runtime compat
- `src/lib/auth.ts` re-exports `auth()` + `requireRole()` + `requireAuth()`
- `middleware.ts` uses `auth()` wrapper with mustChangePassword + templateSelected checks
- `src/actions/onboarding.actions.ts` exists from Story 1.4/1.5 with `selectTemplate()`, `getTemplateStatus()`, `getOnboardingStatus()`, `acknowledgeOnboardingStep()`
- `src/components/ui/toast.tsx` — ToastProvider with `useToast()` hook
- Prisma imports: `@/generated/prisma/client` (PrismaClient), `@/generated/prisma/enums` (Role, Period)
- Zod v4: use `.issues` not `.errors`
- Tailwind v4: CSS-based config, no tailwind.config.ts
- shadcn/ui v4: Button has no `asChild` — use `buttonVariants()` on Link
- Blue buttons: `bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90`

### References

- [Source: epics.md — Story 1.6]
- [Source: architecture.md — ActionResult]
- [Source: prd.md — FR11]
- [Source: ux-design-specification.md — Empty States, Onboarding]
- [Source: 1-5-onboarding-cards-setup-guidance.md — Previous Story Intelligence]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
