---
name: frontend-builder
description: Builds React UI components, MobX stores, Tailwind styling with Factory design tokens, shadcn/ui integration, and Framer Motion animations in the Electron renderer.
---

# Frontend Builder Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:
- React components (sidebar, session list, transcript view, composer, command palette, context panel, status bar)
- MobX stores (session store, UI store, transport store)
- Tailwind CSS with Factory Core Dark design tokens
- shadcn/ui component installation and restyling
- Framer Motion animations
- Virtualized scrolling (TanStack Virtual)
- Rich markdown rendering
- Keyboard navigation and accessibility
- Empty states, error states, loading skeletons
- Command palette (cmdk)

## Required Skills

- `agent-browser` — For manual verification of UI rendering, layout, and interactions. Invoke when verifying visual behavior.

## Work Procedure

1. **Read feature description thoroughly.** Understand every expectedBehavior and verificationStep. Check which validation assertions this feature fulfills.

2. **Read reference materials:**
   - `.factory/library/architecture.md` for component patterns
   - Factory design system at `/Users/brojbean/code/personal-projects/droid-design/factory-design-system.md` for visual specs
   - Factory design tokens at `/Users/brojbean/code/personal-projects/droid-design/factory-design-tokens.json` for exact values
   - Design inspiration at `/Users/brojbean/code/personal-projects/oxox-new/docs/design-inspo/` for layout patterns
   - The typed IPC interface in `src/shared/ipc/` for available data channels

3. **Write tests first (red).** Use Vitest + React Testing Library. Test:
   - Component rendering with expected props
   - User interactions (click, type, keyboard navigation)
   - MobX store state transitions
   - Edge cases (empty data, error states, loading states)

4. **Implement to make tests pass (green).** Follow these conventions:
   - All renderer code in `src/renderer/`
   - Components in `src/renderer/components/` organized by feature area
   - MobX stores in `src/renderer/stores/`
   - Use Factory design tokens via Tailwind classes (e.g., `bg-fd-surface`, `text-fd-primary`, `border-fd-default`)
   - Use shadcn/ui components as base, restyle with Factory tokens
   - Framer Motion for all animations (panel transitions, list mount/unmount, view changes)
   - TanStack Virtual for any list >50 items
   - All text via IPC — NEVER import Node modules in renderer

5. **Verify visually with agent-browser:**
   - Launch app with `pnpm run dev`
   - Use agent-browser to navigate to the feature
   - Screenshot key states (default, hover, active, empty, error, loading)
   - Verify responsive behavior at different window sizes
   - Verify keyboard navigation (Tab, arrow keys, Enter, Escape)
   - Each visual check = one `interactiveChecks` entry

6. **Run validators:**
   - `pnpm exec vitest run` — all tests pass
   - `pnpm exec tsc --noEmit` — no type errors

7. **Update library** if you discover component patterns, design token adjustments, or accessibility findings.

## Example Handoff

```json
{
  "salientSummary": "Built the session sidebar with project-grouped session list, collapsible groups, status dots, pinned sessions section, and resize handle. Ran `npx vitest run` (14 passing) and verified with agent-browser: groups collapse/expand, status dots show correct colors, resize respects min/max constraints, keyboard navigation works with arrow keys.",
  "whatWasImplemented": "SessionSidebar component with ProjectGroup, SessionItem, PinnedSection, ResizeHandle subcomponents. SessionStore MobX store with groupByProject computed, pinned session tracking, and resize state. Tailwind classes use Factory tokens throughout (bg-fd-panel, text-fd-secondary, border-fd-subtle). Framer Motion for group collapse animation (180ms, default easing).",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run", "exitCode": 0, "observation": "14 tests passing across 4 test files" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" }
    ],
    "interactiveChecks": [
      { "action": "agent-browser: navigated to app, inspected sidebar", "observed": "Sidebar rendered with 3 project groups. Sessions show green/gray status dots. Pinned section at top with 1 pinned session." },
      { "action": "agent-browser: clicked project group header", "observed": "Group collapsed with smooth animation. Chevron rotated. Re-clicking expanded it." },
      { "action": "agent-browser: dragged resize handle", "observed": "Sidebar resized from 260px to 400px. Stopped at max constraint. Min constraint at 200px also enforced." },
      { "action": "agent-browser: pressed arrow keys in sidebar", "observed": "Focus moved between session items. Enter selected the focused session. Focus indicator visible." }
    ]
  },
  "tests": {
    "added": [
      { "file": "src/renderer/components/__tests__/SessionSidebar.test.tsx", "cases": [
        { "name": "renders project groups with sessions", "verifies": "group rendering" },
        { "name": "collapses/expands groups on click", "verifies": "toggle behavior" },
        { "name": "shows pinned section when pins exist", "verifies": "pinned display" },
        { "name": "hides pinned section when empty", "verifies": "empty pinned state" }
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- IPC channel needed that doesn't exist in the typed interface
- Design token missing from the Factory design system
- shadcn component behavior conflicts with Factory design spec
- Performance issue with virtualization or animation
- Accessibility concern that requires architectural change
