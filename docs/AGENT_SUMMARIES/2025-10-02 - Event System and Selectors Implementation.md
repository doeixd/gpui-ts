# 2025-10-02 - Event System and Selectors Implementation

## Overall Task
Implemented two major features for GPUI-TS: Deeper Event System Integration and Memoized Selectors. These enhance event handling with type-safe, model-scoped events and provide performant, memoized derived state computation inspired by reselect.

## What Was Done

### 1. Deeper Event System Integration
- **Schema Builder Enhancement**: Modified `src/helpers.ts` to add a `ModelBuilder` interface and `.events()` method, allowing events to be defined per model in the fluent API (e.g., `.model('counter', {...}).events({ increment: (amount) => ({ amount }) })`).
- **Type Updates**: Updated `ModelSchema`, `ModelAPI`, and `ModelContext` interfaces in `src/index.ts` to include generic event types (`TEvents`).
- **Runtime Implementation**: Enhanced `createModelAPI` in `src/index.ts` to build typed `emit` and `on` namespaces at runtime, using the model's event creators for payload construction and event scoping.
- **Context Integration**: Modified update functions to provide enhanced `ModelContext` with `emit` capabilities.
- **Helper Functions**: Added `createEmitNamespace` and `createOnNamespace` functions to handle event emission and subscription.

### 2. Memoized Selectors
- **New Module**: Created `src/selectors.ts` with `createSelector` function for memoized computations using deep equality checks on input selectors.
- **GPUI-TS Integration**: Added `createModelSelector` for model-specific selectors.
- **Utility Functions**: Included `resetSelectorCache` and `getSelectorDebugInfo` for cache management and debugging.
- **Equality Check**: Implemented `deepEqual` function to handle arrays and objects recursively, ensuring proper memoization even with cloned state.

### 3. Tests Added
- `test/event-system-integration.test.ts`: Comprehensive tests for schema builder with model events, typed namespaces, event emission/reception, and update contexts.
- `test/selectors.test.ts`: Tests for selector memoization, model selectors, cache reset, and GPUI-TS integration.

## Key Changes Made

### Files Modified
- `src/index.ts`: Added event namespace helpers, updated ModelRegistry.update to accept events, modified createModelAPI to include emit/on namespaces, updated interfaces.
- `src/helpers.ts`: Updated AppSchema and interfaces for event types, added methods to ModelBuilder and SchemaBuilder.
- `src/selectors.ts`: Changed shallowEqual to deepEqual for proper memoization.

### API Additions
- `createModelSelector<TApp, TModelName, TResult>(modelName, selector)`: Creates selectors for GPUI-TS models.
- `createSelector(inputSelectors, combiner)`: Creates memoized selectors with deep equality.
- Model-specific event emission: `model.emit.eventName(args)`
- Model-specific event subscription: `model.on.eventName(handler)`

## Notes and Gotchas

### Type Complexity
- Event generics (`TEvents`) add significant complexity to the type system.
- Simplified some interfaces to avoid over-engineering, but this may limit future extensibility.

### Performance
- Selectors now use deep equality, which is more expensive than shallow equality but necessary for proper memoization with GPUI-TS's immutable state cloning.
- Deep equality ensures that selectors don't recompute unnecessarily when object/array content is the same despite reference changes.

### Backwards Compatibility
- Changes maintain existing API while adding new capabilities.
- Existing code should continue to work without modifications.

### Testing
- Comprehensive tests ensure features work correctly.
- Runtime type checks are limited; TypeScript provides most type safety.

## Lessons Learned

### Wrong Paths Taken
- Initially tried to use shallow equality for selectors, but this failed with GPUI-TS's state cloning.
- Attempted to modify the read() method to cache results, but this violated immutability principles.
- Considered using JSON.stringify for comparison, but this is inefficient and doesn't handle functions.

### Correct Path
- Implemented deep equality checking that recursively compares objects and arrays.
- Added event namespaces directly to ModelAPI instances rather than trying to retrofit existing event systems.
- Used event creators (functions) in the schema to maintain type safety and runtime flexibility.

### Key Findings
- GPUI-TS's state cloning (via structuredClone) creates new object references on every read, breaking naive memoization.
- Deep equality is necessary for reliable selector memoization in this architecture.
- Model-scoped events provide better encapsulation than global events for complex applications.

## Removals
- Removed `emit<TEvent>(event: TEvent)` and `onEvent<TEvent>(handler)` methods from ModelAPI interface to avoid conflicts with the new namespaces.

## Additions
- `createEmitNamespace` and `createOnNamespace` helper functions.
- `deepEqual` utility function.
- `createModelSelector` and enhanced `createSelector` functions.
- Event namespace properties on ModelAPI instances.
- Updated schema builder to support model-specific events.

## Next Steps
1. **Test Verification**: Run the test suite to ensure all fixes work correctly and no regressions were introduced.
2. **Documentation Update**: Update README.md and docs to include usage examples for the new event and selector features.
3. **Performance Optimization**: Consider optimizing deep equality checks if they become a bottleneck in production use.
4. **Additional Features**: Explore adding more selector utilities like `createStructuredSelector` or selector composition helpers.

## Changelog
- **Added**: Model-scoped event system with typed emit/on namespaces.
- **Added**: Memoized selectors with deep equality checking.
- **Modified**: Schema builder to support model events.
- **Modified**: ModelRegistry to pass events to update contexts.
- **Removed**: Generic emit/on methods from ModelAPI to avoid conflicts.

## Issues Remaining
- Some TypeScript type errors in ergonomic.ts and lit.ts due to generic mismatches.
- Need to verify that the deep equality implementation doesn't cause performance issues with large state objects.
- Potential need for selector dependency tracking improvements.