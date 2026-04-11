---
name: electron-foundation
description: Handles Electron main process, preload bridge, window management, native macOS features, and build tooling configuration.
---

# Electron Foundation Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:
- Electron main process setup and configuration
- BrowserWindow creation, frameless window, vibrancy, traffic lights
- Preload script and typed IPC bridge
- Tray icon, native notifications, Dock integration
- macOS application menu registration
- Window state persistence (position, size, panel states)
- Multi-window management
- Single instance lock
- Build tooling (electron-vite, packaging)
- Electron security configuration (CSP, sandbox, contextIsolation)
- Native module setup (better-sqlite3 electron-rebuild)

## Required Skills

None — this worker operates at the Electron/Node level.

## Work Procedure

1. **Read feature description thoroughly.** Understand every expectedBehavior and verificationStep.

2. **Read reference materials:**
   - `.factory/library/architecture.md` for architectural decisions
   - `.factory/library/environment.md` for paths, versions, platform constraints
   - The factory-droid-sdk source at `/Users/brojbean/code/personal-projects/droid-research/` for protocol reference (when building transport/IPC contracts)

3. **Write tests first (red).** Use Vitest. For Electron main process code, test with mocked Electron APIs. For IPC contracts, test type safety and handler registration. For window management, test state serialization/deserialization.

4. **Implement to make tests pass (green).** Follow these Electron conventions:
   - All main process code in `src/main/`
   - Preload scripts in `src/preload/`
   - Typed IPC interfaces shared between main and renderer in `src/shared/ipc/`
   - Window management logic in `src/main/windows/`
   - Native features (tray, notifications, menu) in `src/main/native/`
   - NEVER expose `ipcRenderer` directly — use `contextBridge.exposeInMainWorld`
   - ALWAYS use `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`

5. **Verify manually:**
   - Run `pnpm run dev` to launch the app
   - Verify the feature visually (window renders, tray works, etc.)
   - Check DevTools console for errors
   - For security features: verify in DevTools that `window.require` is undefined, CSP headers present

6. **Run validators:**
   - `pnpm exec vitest run` — all tests pass
   - `pnpm exec tsc --noEmit` — no type errors

7. **Document findings** in `.factory/library/` if you discover environment quirks, native API behaviors, or constraints.

## Example Handoff

```json
{
  "salientSummary": "Set up frameless BrowserWindow with macOS vibrancy (dark material), custom traffic light positioning at {x:20, y:18}, and typed IPC bridge with 12 channel definitions. Ran `npx vitest run` (8 passing) and verified window renders with vibrancy effect visible behind sidebar region. DevTools confirms nodeIntegration:false and contextIsolation:true.",
  "whatWasImplemented": "Frameless Electron BrowserWindow with titleBarStyle:'hidden', vibrancy:'sidebar', trafficLightPosition:{x:20,y:18}. Preload script exposes typed window.api with 12 IPC channels. Main process IPC handlers registered for all channels. CSP meta tag blocks eval and inline scripts. macOS dark theme forced via nativeTheme.themeSource='dark'.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run", "exitCode": 0, "observation": "8 tests passing across 3 test files" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" }
    ],
    "interactiveChecks": [
      { "action": "Launched app via pnpm run dev", "observed": "Frameless window appeared with dark vibrancy effect. Traffic lights positioned correctly at top-left with ~20px inset." },
      { "action": "Checked DevTools console", "observed": "Zero errors. typeof window.require === 'undefined'. CSP header present." },
      { "action": "Dragged window via titlebar region", "observed": "Window moved. Dragging content area did not move window." }
    ]
  },
  "tests": {
    "added": [
      { "file": "src/main/__tests__/window.test.ts", "cases": [{ "name": "creates frameless window with vibrancy", "verifies": "BrowserWindow options" }] },
      { "file": "src/shared/__tests__/ipc-types.test.ts", "cases": [{ "name": "IPC channels type-check", "verifies": "typed IPC contract" }] }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Electron version incompatibility with macOS API (vibrancy, notifications)
- Native module build failure (better-sqlite3 rebuild)
- IPC contract changes that affect renderer expectations
- Security configuration that conflicts with feature requirements
