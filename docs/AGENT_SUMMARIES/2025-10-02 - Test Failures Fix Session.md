# 2025-10-02 - Test Failures Fix Session

## Overall Task
Fix failing tests in the GPUI-TS codebase, specifically addressing issues with time travel, computed properties, proxy API, and selectors. Additionally, resolve TypeScript type checking issues.

## What Was Done

### 1. Fixed Time Travel (Snapshot/Restore) - `index.test.ts` ✅
**Problem**: The `snapshot()` function was capturing stale state because it read from the `currentState` closure variable instead of the actual registry state.

**Solution**:
- Changed `snapshot()` to read from `registry.read(name)` instead of `currentState`
- Changed `restore()` to use `this.updateAndNotify()` instead of non-existent `registry.updateAndNotify()`
- File: `src/index.ts` lines 2500-2525

**Impact**: Snapshot/restore now correctly captures and restores model state.

### 2. Fixed Computed Properties Caching - `index.test.ts` ✅
**Problem**: Computed properties weren't being invalidated after state updates and were reading from stale `currentState` variable.

**Solution**:
- Made computed properties read from `registry.read(name)` instead of `currentState` (line 2091)
- Added cache invalidation after every update: `computedCache.forEach(cached => { cached.dirty = true })` (line 2170)
- File: `src/index.ts`

**Impact**: Computed properties now correctly recompute when dependencies change.

### 3. Fixed Proxy API - `index.test.ts` ✅ (2 tests)
**Problem**: Global `proxyCache` was causing proxy objects to be shared across different app instances, leading to state corruption between tests.

**Root Cause**: Line 2934 had `const proxyCache = new Map<string, any>()` as a global variable. When test 1 created a proxy for "counter:root", test 2's app would get the same cached proxy pointing to test 1's model.

**Solution**:
- Removed global `proxyCache`
- Created per-model `modelProxyCache` in each model's closure (line 2046)
- Updated `createModelProxy` to accept a cache parameter (line 2947)
- Updated recursive calls and `asProxy` method to use per-model cache
- Files: `src/index.ts`

**Impact**: Each app instance now has its own proxy cache, preventing cross-contamination.

### 4. Fixed Selector Cache Reset - `selectors.test.ts` ✅
**Problem**: `resetSelectorCache()` tried to reset closure variables that weren't accessible from outside the function.

**Solution**:
- Added a `resetCache()` method attached to each selector that has closure access (line 325-330)
- Updated `resetSelectorCache()` to call this method (line 384-389)
- Updated `getSelectorDebugInfo()` to check `recomputations > 0` for `hasCache` (line 401)
- Files: `src/selectors.ts`

**Impact**: Cache reset now works correctly, allowing selectors to recompute when needed.

## Key Discovery: Build Process
**Critical Finding**: Tests in `test/index.test.ts` import from `../dist/esm/development/index.js` (the built distribution), NOT from source code. This meant every code change required running `npm run build` before tests would reflect the changes.

Other test files (like `test/selectors.test.ts`) import from `../src/`, so they use source code directly.

## Test Results

### Before
- 8 failed tests out of 262 total (254 passing)
- Failures in: Time Travel, Computed Properties, Proxy API (2 tests)

### After
- 8 failed tests out of 272 total (264 passing)
- **All 4 originally failing tests in index.test.ts are now fixed ✅**
- Remaining failures are in different test files (selectors, event-system, schema-composition, edge-cases)

### Test Breakdown by File
- ✅ `test/index.test.ts`: 27/28 passing (1 unrelated event system failure)
- ⚠️ `test/selectors.test.ts`: 19/22 passing (3 failures in integration/equality/LRU tests)
- ⚠️ `test/event-system.test.ts`: Has integration failures
- ⚠️ `test/schema-composition.test.ts`: 1 failure in chaining
- ⚠️ `test/edge-cases.test.ts`: 1 memory leak test failure

## Files Modified

### `src/index.ts`
1. **Line 2046**: Added `const modelProxyCache = new Map<string, any>()`
2. **Line 2091**: Changed computed property to read from `registry.read(name)`
3. **Line 2170**: Added `computedCache.forEach(cached => { cached.dirty = true })`
4. **Line 2171**: Added `currentState = registry.read<T>(name) as T`
5. **Line 2500-2507**: Updated `snapshot()` to read from registry
6. **Line 2513**: Changed `restore()` to use `this.updateAndNotify()`
7. **Line 2521-2523**: Added cache invalidation in `restore()`
8. **Line 2935**: Removed global `proxyCache`
9. **Line 2947**: Updated `createModelProxy` signature to accept cache parameter
10. **Line 2979**: Updated recursive call to pass cache
11. **Line 2578**: Updated `asProxy` to pass per-model cache

### `src/selectors.ts`
1. **Line 323-330**: Added `resetCache()` method to selectors
2. **Line 384-389**: Updated `resetSelectorCache()` to use attached method
3. **Line 401**: Updated `getSelectorDebugInfo()` hasCache logic

## Remaining Issues (Not Fixed)

### Selector Tests (3 failures)
- Integration with GPUI-TS
- Custom equality functions
- LRU cache strategy

### Event System Tests (3 failures)
- `index.test.ts`: "should emit and handle events" - uses old API `model.emit({})` instead of new `model.emitEvent({})`
- `event-system.test.ts`: 2 integration failures

### Other Tests (2 failures)
- Schema composition chaining
- Memory leak prevention

## TypeScript Issues (Not Fixed)
Build completes but shows TypeScript warnings in:
- `src/helpers.ts`: Implicit any types
- `src/index.ts`: Generic type mismatches, unused variables
- `src/lit.ts`: EmitNamespace not callable
- `src/selectors.ts`: Unused imports, type issues

## Lessons Learned

### 1. Global State is Dangerous
The proxy cache bug was subtle but catastrophic - sharing state across instances violates the principle of isolated app instances.

### 2. Closure vs Properties
Variables in closures (like `lastArgs` in selectors) aren't accessible from outside. Need to either:
- Attach them as properties (but keep in sync)
- Provide methods with closure access (better approach)

### 3. Build vs Source
Understanding which tests use built code vs source code is critical for efficient debugging.

### 4. Registry as Source of Truth
The `ModelRegistry` should be the single source of truth. Any cached values (`currentState`) must be kept in sync or eliminated.

## Next Steps (For Future Work)

### High Priority
1. Fix remaining selector integration tests
2. Update event system tests to use new API (`emitEvent` instead of `emit`)
3. Fix memory leak test

### Medium Priority
4. Fix schema composition chaining
5. Resolve TypeScript type checking warnings
6. Add more comprehensive proxy cache tests

### Low Priority
7. Consider refactoring to eliminate `currentState` variable entirely
8. Document the distinction between `update()` and `updateAndNotify()`
9. Add integration tests for cross-app isolation

## API Notes

### Important Distinctions
- `model.update()`: Modifies state but doesn't trigger onChange callbacks
- `model.updateAndNotify()`: Modifies state AND triggers onChange callbacks
- `model.set()`: Uses `updateAndNotify` internally
- Proxy operations: Use `updateAndNotify` via `set()`

### Event System Evolution
The codebase has both old and new event APIs:
- Old: `model.emit({type: 'event', ...})`
- New: `model.emitEvent({...})` and `model.emit.eventName()`

Tests need updating to reflect this change.

## Changelog

### Fixed
- ✅ Time travel snapshot/restore functionality
- ✅ Computed properties caching and invalidation
- ✅ Proxy API cross-app state contamination (2 tests)
- ✅ Selector cache reset functionality
- ✅ Selector debug info (hasCache property)

### Improved
- Better separation of concerns with per-model caches
- More reliable state synchronization with registry

### Known Issues
- 8 tests still failing (selectors, events, schema, memory)
- TypeScript warnings in build output
- Event API inconsistency between old and new tests
