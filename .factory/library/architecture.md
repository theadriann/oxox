# Architecture

Architectural decisions, patterns, and conventions for the OXOX Electron app.

**What belongs here:** Major architectural decisions, module boundaries, data flow patterns, IPC contracts, process model decisions.

---

## App Architecture

- **Electron main process:** Window management, SQLite database, Droid integration layer (transports), tray icon, native notifications, filesystem polling
- **Electron preload:** Typed IPC bridge (contextBridge). Exposes `window.api` object with typed methods. No Node.js APIs in renderer.
- **React renderer:** UI layer with MobX stores, shadcn/ui components, Tailwind CSS, Framer Motion animations. Communicates with main process exclusively through typed IPC.

## Key Patterns

- **Typed IPC contracts:** All IPC channels defined as a single TypeScript interface shared between main and renderer. Main handlers type-checked against same interface. Zero `ipcRenderer` exposure.
- **MobX stores:** SessionStore (session list, metadata, status), UIStore (sidebar state, panel states, window state), TransportStore (daemon connection, transport status)
- **Transport layer:** Node-native integration mirroring factory-droid-sdk protocols 1:1. Three transports: stream-jsonrpc (live sessions), daemon WebSocket (discovery/search/archive), artifact reader (offline reads).
- **SQLite persistence:** better-sqlite3 in main process, WAL mode. Caches session metadata, transcripts, and app-specific data (pins, display names, window state). Incremental sync via byte-offset tracking.
- **Multi-window:** Each BrowserWindow is a full independent instance. State synchronized through main process IPC hub. Each window has its own MobX store hydrated from main process state.

## Security Boundaries

- contextIsolation: true
- nodeIntegration: false
- All file system access in main process only
- No secrets cross to renderer
- Preload validates all IPC arguments

## SDK Protocol Reference

The Node-native integration layer must be 1:1 with the factory-droid-sdk v0.0.0 protocols:
- Stream-jsonrpc: JSON-RPC 2.0 over stdio with `droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc`
- Daemon: WebSocket JSON-RPC to local daemon
- Artifacts: Read-only filesystem access to `~/.factory/sessions/`
- 14 normalized SessionEvent types
- 17 RPC methods + 20 notification types + 2 callback methods
