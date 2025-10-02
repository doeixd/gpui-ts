# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [Unreleased]

### Fixed

- **Events**: Made `emit` namespace callable for ad-hoc events in addition to typed event methods
  - `model.emit({ type: 'custom', data })` now works alongside `model.emit.eventName()`
  - Updated `EmitNamespace` type to be both object and callable function
- **Schema Composition**: Fixed event preservation when chaining schema builder operations
  - Global events added via `addEventToSchema` are now properly maintained through subsequent builder operations
  - Fixed `ModelBuilder.events()` in both `createSchema` and `createBuilderWithSchema`
- **Selectors**: Fixed LRU cache key generation to use unique keys instead of reusing indices
  - Prevents cache key collisions when entries are evicted and new ones are added
  - All selector cache strategies (unbounded, LRU, FIFO) now work correctly

### [0.0.3](https://github.com/doeixd/gpui-ts/compare/v0.0.2...v0.0.3) (2025-09-26)

### [0.0.2](https://github.com/doeixd/gpui-ts/compare/v0.0.1...v0.0.2) (2025-09-26)

### 0.0.1 (2025-09-26)
