# Manual Visual QA Checklist

Use this checklist before shipping founder-facing UI changes. It is intentionally short and repeatable so it can be run during every milestone closeout.

## Viewports

- Desktop: 1440 x 900.
- Tablet: 1024 x 768.
- Mobile: 390 x 844.

## Core Screens

- `/`
  - Command composer remains first-viewport focus.
  - Snapshot cards do not wrap awkwardly.
  - Approval, operations, integrations, memory, account, and billing sections are reachable from sticky navigation.
  - Empty, loading, and error states are visible without layout shift.
- `/commands`
  - Command history cards fit long command text.
  - Status chips and action counts remain readable on mobile.
  - Empty history state has a clear path back to the console.
- `/commands/[commandId]`
  - Not-found state is clear when the command is absent.
  - Invocation payload panels scroll instead of expanding beyond the viewport.
  - Request and response payloads do not overlap adjacent content.
- `/integrations/github/oauth/callback`
  - Callback state remains readable while processing.
- `/integrations/github/oauth/success`
  - Success state points the founder back to integrations.
- `/integrations/github/oauth/error`
  - Error state is understandable and actionable.

## Interaction Checks

- Keyboard focus is visible on links, buttons, textareas, summaries, and form controls.
- Command composer can be submitted with keyboard alone.
- Approval payload details can be expanded and collapsed with keyboard.
- Sticky navigation does not cover section headings after anchor jumps.
- Buttons show disabled or pending state during mutations.

## Accessibility Checks

- Each page has exactly one visible primary heading.
- Form controls have labels.
- Status-only color differences have text labels.
- Long JSON payloads use scrollable regions.
- Mobile viewport has no horizontal scrolling.

## Failure Checks

- Business API unavailable.
- Empty command history.
- No pending approvals.
- No integrations connected.
- Memory list empty.
- Billing status unavailable.

## Completion Evidence

Record:

- Date and commit SHA.
- Browser used.
- Viewports checked.
- Any defects found.
- Follow-up issue or commit for every defect not fixed immediately.
