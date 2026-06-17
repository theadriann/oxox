# oxox

## 0.0.14

### Patch Changes

- Make Command-Q trigger OXOX's explicit quit flow so the whole app shuts down.

## 0.0.13

### Patch Changes

- Add a macOS template tray icon with packaged standard and retina assets.
- Improve update installation so restarting for an update goes through OXOX graceful shutdown before invoking the updater installer.

## 0.0.12

### Patch Changes

- Improve transcript scrolling with bottom anchoring, per-session restore, and human-only scroll persistence.
- Add session item context actions, initial deletion support, and better sidebar defaults.
- Add message hover actions, fork-from-message, custom fork titles, and source session name preservation.
- Improve code block wrapping/copy behavior, project folder organization, search logic, async operation status, and SDK/runtime handling.

## 0.0.10

### Patch Changes

- Improve session search and streaming performance with disk-backed indexing, coalesced live updates, continuous indexing progress, and deferred renderer search input handling.

## 0.0.9

### Patch Changes

- Integrate the latest Droid SDK runtime context APIs and fix context usage estimation in the composer and context panel.

## 0.0.8

### Patch Changes

- Replace the renderer's MobX state layer with Legend-State v3 for finer-grained reactivity, batching, and smoother dev-mode performance.
