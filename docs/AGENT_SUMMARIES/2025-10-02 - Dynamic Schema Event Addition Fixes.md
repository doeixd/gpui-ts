# Dynamic Schema Event Addition Fixes

## Summary
Fixed critical issues with runtime event addition in the dynamic schema system. The `addEvent` function was not properly handling existing events or throwing errors for duplicate events due to incorrect test setup and type definitions.

## What Was Done

### 1. Fixed addEvent Type Definition
- **Issue**: The return type for `addEvent` used an intersection type `TApp['_schema'] & { events: ... }` which overrode existing events instead of merging them.
- **Fix**: Changed to a conditional type that properly merges events:
  ```typescript
  Omit<TApp['_schema'], 'events'> & {
    events: TApp['_schema']['events'] extends Record<string, any>
      ? TApp['_schema']['events'] & { [K in TEventName]: { payload: TPayload } }
      : { [K in TEventName]: { payload: TPayload } }
  }
  ```

### 2. Corrected Test Order in dynamic-schema.test.ts
- **Issue**: Tests were calling `.events()` on `ModelBuilder` (after `.model()`) which adds model-specific events, not global events. But the tests expected global events.
- **Fix**: Changed test order to call `.events()` before `.model()` to add global events:
  ```typescript
  // Before: .model('user', { name: '' }).events({ login: ... })
  // After:  .events({ login: ... }).model('user', { name: '' })
  ```

### 3. Fixed Syntax Error in index.ts
- **Issue**: Duplicate `return rootProxy;` statement causing compilation error.
- **Fix**: Removed the extraneous return statement.

## Results
- All tests in `test/dynamic-schema.test.ts` now pass (13/13)
- Fixed syntax error allowing full test suite to run
- Event system properly maintains existing events when adding new ones
- Proper error throwing for duplicate event names

## Files Modified
- `src/index.ts`: Fixed addEvent type definition and removed syntax error
- `test/dynamic-schema.test.ts`: Corrected test order for global events

## Tests Status
- ✅ Dynamic schema tests: 13/13 passing
- ✅ Event system integration tests: Previously fixed
- ✅ Schema builder tests: Previously fixed
- Remaining failures in other test files appear unrelated to this fix

## Key Findings
- The schema builder API requires `.events()` to be called before `.model()` for global events
- TypeScript intersection types don't merge object properties as expected for complex schemas
- Conditional types are needed for proper event merging in type definitions

## Next Steps
- Investigate remaining test failures in other files (time travel, computed properties, proxy API)
- Consider updating documentation to clarify the correct order for schema building