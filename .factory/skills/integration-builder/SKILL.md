---
name: integration-builder
description: Builds the Node-native Droid integration layer (transports, protocol, artifacts), SQLite persistence, and session management logic in the Electron main process.
---

# Integration Builder Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features involving:
- Stream-jsonrpc transport (spawning `droid exec`, JSON-RPC over stdio)
- Daemon WebSocket transport (session discovery, search, archive)
- Artifact reader (reading `~/.factory/sessions/` JSONL + settings files)
- Transport selector (probing, fallback logic)
- SQLite database schema, migrations, queries
- Session state management (lifecycle, status transitions)
- Cache-with-refresh pattern (incremental sync, byte-offset tracking)
- Directory polling for external session detection
- Process management (spawn, detach, orphan detection, reattachment)
- Protocol implementation (JSON-RPC 2.0 methods, notifications, callbacks)
- Event normalization (14 SessionEvent types)

## Required Skills

None — this worker operates at the Node/main process level.

## Work Procedure

1. **Read feature description thoroughly.** Understand every expectedBehavior and verificationStep.

2. **Read reference materials — this is critical:**
   - The factory-droid-sdk source at `/Users/brojbean/code/personal-projects/droid-research/src/` — this is the protocol spec. Read the relevant transport adapter, protocol methods, and type definitions for the feature being built.
   - SDK research docs at `/Users/brojbean/code/personal-projects/droid-research/docs/research/` for design rationale
   - `.factory/library/architecture.md` for integration patterns
   - `.factory/library/environment.md` for paths and constraints

3. **Write tests first (red).** Use Vitest. Test:
   - Protocol serialization/deserialization against SDK fixtures
   - Transport adapter behavior (mock child_process.spawn for stream-jsonrpc, mock WebSocket for daemon)
   - SQLite schema creation, migrations, CRUD operations
   - Artifact parsing (valid JSONL, malformed JSONL, missing files)
   - Session lifecycle state transitions (valid and invalid)
   - Event normalization from raw protocol to SessionEvent types
   - Use protocol fixtures from SDK tests as test data where applicable

4. **Implement to make tests pass (green).** Follow these conventions:
   - All integration code in `src/main/integration/`
   - Transports in `src/main/integration/transports/` (stream-jsonrpc/, daemon/, artifacts/)
   - Protocol types in `src/main/integration/protocol/`
   - SQLite layer in `src/main/integration/database/`
   - Session manager in `src/main/integration/sessions/`
   - MUST match SDK protocol wire format exactly (JSON-RPC 2.0, factoryApiVersion "1.0.0")
   - MUST normalize to the same 14 SessionEvent types as the SDK
   - SQLite: WAL mode, busy timeout >=5s, foreign keys ON
   - Use Node.js child_process.spawn (NOT Bun.spawn) for stream-jsonrpc
   - Use Node.js ws library (NOT Bun WebSocket) for daemon

5. **Verify with integration tests:**
   - For transport tests: mock the child process or WebSocket to return known protocol fixtures
   - For artifact tests: create temp directories with test JSONL files
   - For SQLite: use in-memory databases for fast testing
   - For session lifecycle: test all valid state transitions and verify invalid ones throw

6. **Run validators:**
   - `pnpm exec vitest run` — all tests pass
   - `pnpm exec tsc --noEmit` — no type errors

7. **Update library** with protocol findings, transport quirks, or SQLite schema notes.

## Example Handoff

```json
{
  "salientSummary": "Implemented stream-jsonrpc transport adapter using Node.js child_process.spawn to run `droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc`. Supports all 6 core RPC methods and normalizes 20 notification types to 14 SessionEvent types. Ran `npx vitest run` (22 passing) and verified protocol wire format matches SDK fixtures exactly.",
  "whatWasImplemented": "StreamJsonRpcTransport class: spawns droid exec as child process, implements JSONL line parser for stdout, RequestCorrelator for request/response matching with 30s timeout, and EventNormalizer mapping 20 raw notification types to 14 normalized SessionEvent types. Supports resolvePermissionRequest() and resolveAskUser() for interactive callbacks. Handles process exit/crash with error events.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npx vitest run", "exitCode": 0, "observation": "22 tests passing across 5 test files" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" }
    ],
    "interactiveChecks": [
      { "action": "Tested with real droid exec process", "observed": "Session created successfully. Received initialize_session response with sessionId. Sent add_user_message. Received streaming text_delta notifications. Session completed cleanly." }
    ]
  },
  "tests": {
    "added": [
      { "file": "src/main/integration/__tests__/stream-jsonrpc.test.ts", "cases": [
        { "name": "parses JSONL lines from stdout", "verifies": "line parser" },
        { "name": "correlates requests with responses", "verifies": "request correlator" },
        { "name": "normalizes text_delta to message.delta", "verifies": "event normalization" },
        { "name": "handles process exit with error event", "verifies": "crash handling" }
      ]},
      { "file": "src/main/integration/__tests__/protocol-fixtures.test.ts", "cases": [
        { "name": "serializes initialize_session request", "verifies": "wire format" },
        { "name": "deserializes session_notification", "verifies": "wire format" }
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- SDK protocol has changed from what's documented in the research
- `droid exec` behaves differently than expected (different flags, output format)
- Daemon authentication requirements unclear
- SQLite schema change needed that affects existing data
- Process management edge case that needs architectural decision
