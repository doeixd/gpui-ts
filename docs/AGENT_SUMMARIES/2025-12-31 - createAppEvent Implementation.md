# createAppEvent Implementation

**Date**: 2025-12-31
**Type**: Feature Addition
**Status**: ✅ Complete
**Test Count**: 303 total (11 new tests added for createAppEvent)

## Summary

Implemented the `createAppEvent` utility that extends the Functional Controller pattern by integrating with GPUI-TS's event infrastructure. This utility enables runtime event registration with full type safety, providing a unified event bus for applications that need traceable, schema-integrated events.

## What Was Implemented

### 1. Type Utilities

**Location**: `src/helpers.ts` (lines 1021-1075)

Created two supporting type utilities for runtime event management:

#### `ModelStateType<TApp, TModelName>`

Extracts the state type of a specific model from a GPUIApp instance:

```typescript
export type ModelStateType<TApp extends GPUIApp<any>, TModelName extends keyof TApp['models'] & string> =
  TApp extends GPUIApp<infer TSchema>
    ? TModelName extends keyof TSchema['models']
      ? TSchema['models'][TModelName]['initialState']
      : never
    : never
```

**Key features**:
- Works with `GPUIApp` type (not the initial planned `App` type)
- Enables type-safe access to model state in generic contexts
- Navigates the schema structure to extract `initialState`

#### `AppWithEvent<TApp, TModelName, TEventName, TEventCreator>`

Creates a new app type with an additional event registered:

```typescript
export type AppWithEvent<
  TApp extends GPUIApp<any>,
  TModelName extends keyof TApp['models'] & string,
  TEventName extends string,
  TEventCreator extends (...args: any[]) => any
> = TApp extends GPUIApp<infer TSchema>
  ? GPUIApp<
      TSchema & {
        models: TSchema['models'] & {
          [K in TModelName]: TSchema['models'][K] & {
            events: (TSchema['models'][K] extends { events: infer E } ? E : {}) & {
              [E in TEventName]: TEventCreator
            }
          }
        }
      }
    >
  : never
```

**Key features**:
- Tracks runtime-registered events in the type system
- Enables type accumulation across multiple createAppEvent calls
- Merges with existing events if they exist

### 2. `createAppEvent` Utility

**Location**: `src/helpers.ts` (lines 1477-1575)

Creates events that integrate with the GPUI-TS event system and automatically update models when emitted.

**Signature**:
```typescript
export function createAppEvent<
  TApp extends GPUIApp<any>,
  TModelName extends keyof TApp['models'] & string,
  TEventName extends string,
  TEventCreator extends (...args: any[]) => any
>(
  app: TApp,
  modelName: TModelName,
  eventName: TEventName,
  eventCreator: TEventCreator,
  handler: (
    payload: ReturnType<TEventCreator>,
    draft: ModelStateType<TApp, TModelName>,
    ctx: ModelContext<ModelStateType<TApp, TModelName>>
  ) => void
): [
  EventHandler<Parameters<TEventCreator>, Parameters<TEventCreator>>,
  (...args: Parameters<TEventCreator>) => void,
  AppWithEvent<TApp, TModelName, TEventName, TEventCreator>
]
```

**Key features**:
- **3-tuple return**: `[EventHandler, emitter, updatedApp]`
- **Runtime event registration**: Creates `model.__eventHelpers.emit/on` namespaces
- **Event integration**: Emits through `model.emit()` and `model.onEvent()`
- **Type accumulation**: Returns typed app for chaining
- **Full context**: Handler receives `ModelContext` with `emit()`, `notify()`, `batch()`, etc.
- **Automatic emission**: Events are emitted after successful handler execution
- **Error handling**: Automatic rollback on handler errors

## Architecture Decisions

### 1. Event Helper Namespaces

**Challenge**: GPUI-TS models have `model.emit()` as a function (not an object with methods) and `model.onEvent()` for listening.

**Decision**: Created `model.__eventHelpers` namespace to store event-specific helpers:

```typescript
if (!model.__eventHelpers) {
  model.__eventHelpers = {
    emit: {},
    on: {}
  }
}

model.__eventHelpers.emit[eventName] = (...args) => { /* ... */ }
model.__eventHelpers.on[eventName] = (listener) => { /* ... */ }

// Expose for convenient access
model.emit[eventName] = model.__eventHelpers.emit[eventName]
model.on = model.on || {}
model.on[eventName] = model.__eventHelpers.on[eventName]
```

**Rationale**:
- `model.emit` is a function but can have properties (functions are objects in JavaScript)
- `__eventHelpers` provides organized storage for runtime-registered events
- Exposed helpers (`model.on.eventName`) provide convenient typed access

### 2. Event Creation Pattern

**Challenge**: `createEvent<Parameters<TEventCreator>>()` returns an emit function that expects a tuple, but we want to call it with spread arguments.

**Decision**: Created a custom wrapper emit function:

```typescript
const [eventHandler, baseEmit] = createEvent<Parameters<TEventCreator>>()

const customEmit = (...args: Parameters<TEventCreator>) => {
  baseEmit(args)  // Pass tuple to base emit
}
```

**Rationale**:
- Maintains ergonomic API: `addTodo('text', 'high')` instead of `addTodo(['text', 'high'])`
- EventHandler subscription receives tuple: `(argsArray: Parameters<TEventCreator>) => { }`
- Spread operator used in eventCreator call: `eventCreator(...argsArray)`

### 3. Type Safety with GPUIApp

**Initial Plan**: Use `App<TSchema>` type
**Reality**: GPUI-TS exports `GPUIApp<TSchema>` type, not `App`

**Decision**: Updated all type utilities to use `GPUIApp`:

```typescript
import type { GPUIApp } from './index'

export type ModelStateType<TApp extends GPUIApp<any>, TModelName> = /* ... */
export type AppWithEvent<TApp extends GPUIApp<any>, ...> = /* ... */
```

**Rationale**:
- `GPUIApp` is the actual exported type from `src/index.ts`
- Type constraints ensure proper inference and type safety
- Matches the return type of `createApp(schema)`

## Implementation Details

### Event Flow

1. **Event Creation**:
   - `createAppEvent` called with app, model name, event name, creator, handler
   - Registers event helpers in `model.__eventHelpers`
   - Creates base EventHandler with tuple type
   - Creates custom emit function with spread args

2. **Event Emission**:
   - User calls `customEmit(arg1, arg2, ...)`
   - Custom emit wraps args in tuple and calls `baseEmit(args)`
   - EventHandler subscribers receive tuple
   - Handler is called within `model.update()`:
     - Event creator called with spread args: `eventCreator(...args)`
     - User handler called with payload, draft state, context
     - Event emitted via `ctx.emit({ type: fullEventName, payload })`
     - Subscribers notified via `ctx.notify()`

3. **Event Listening**:
   - User calls `model.on.eventName(listener)`
   - Listener is registered via `model.onEvent()`
   - Filters events by full name: `modelName:eventName`
   - Listener receives typed payload

### Integration Points

1. **Event System**: Uses `createEvent()` from `src/index.ts`
2. **Model Updates**: Uses `ModelAPI.update()` with context
3. **Event Emission**: Uses `ctx.emit()` within update context
4. **Event Listening**: Uses `model.onEvent()` for subscription
5. **Type System**: Leverages TypeScript's mapped types and conditional types

### Files Modified

- ✅ `src/helpers.ts` - Added type utilities and `createAppEvent`
- ✅ `src/helpers.ts` - Updated imports to include `GPUIApp`
- ✅ `test/functional-controller.test.ts` - Added 11 comprehensive tests
- ✅ `README.md` - Added "Unified Event Bus with createAppEvent" section

## Tests Added

**File**: `test/functional-controller.test.ts` (11 tests for createAppEvent)

### Test Coverage (100% passing)

1. ✅ Creates event that updates model when emitted
2. ✅ Registers event at runtime if not in schema
3. ✅ Emits through model event system
4. ✅ Provides typed payload to handler
5. ✅ Supports event transformation chains
6. ✅ Allows chaining multiple createAppEvent calls
7. ✅ Handles errors with rollback
8. ✅ Triggers reactive subscriptions
9. ✅ Works with complex payloads
10. ✅ Provides context to handler
11. ✅ Infers types correctly

### Key Test Insights

- **ID Generation**: Initial test used `Date.now()` for IDs, which failed because multiple items got same ID when added quickly. Fixed by using a counter: `state.nextId++`
- **Event Helper Checks**: Tests verify `model.__eventHelpers.emit.eventName` exists rather than checking if `model.emit` is undefined (since it's always a function)
- **Type Safety**: Tests confirm full type inference without explicit type parameters

## Type Safety

All implementations achieve full type inference:

```typescript
// Example: Type inference works without explicit type parameters
const schema = createSchema()
  .model('todos', { items: [] as TodoItem[] })
  .build()

let app = createApp(schema)

const [onAdd, addTodo, app2] = createAppEvent(
  app,
  'todos',
  'todoAdded',
  (text: string, priority: 'high' | 'low') => ({ text, priority, timestamp: Date.now() }),
  (payload, state, ctx) => {
    // 'payload' inferred as { text: string, priority: 'high' | 'low', timestamp: number }
    // 'state' inferred as { items: TodoItem[] }
    // 'ctx' inferred as ModelContext<{ items: TodoItem[] }>
    state.items.push({ id: Date.now(), text: payload.text, completed: false })
  }
)

app = app2  // Type safe: app2 now has 'todoAdded' event
```

## Usage Example

```typescript
import { createAppEvent, createSchema, createApp } from 'gpui-ts'

const schema = createSchema()
  .model('todos', { items: [] as TodoItem[], nextId: 1 })
  .build()

let app = createApp(schema)

// First event: add todo
const [onAdd, addTodo, app2] = createAppEvent(
  app,
  'todos',
  'todoAdded',
  (text: string) => ({ text }),
  (payload, state) => {
    state.items.push({ id: state.nextId++, text: payload.text, completed: false })
  }
)

// Second event: toggle todo
const [onToggle, toggleTodo, app3] = createAppEvent(
  app2,
  'todos',
  'todoToggled',
  (id: number) => ({ id }),
  (payload, state) => {
    const todo = state.items.find(t => t.id === payload.id)
    if (todo) todo.completed = !todo.completed
  }
)

app = app3  // app now has both events typed

// Subscribe to events
app.models.todos.on.todoAdded(payload => {
  console.log(`Added: ${payload.text}`)
})

app.models.todos.on.todoToggled(payload => {
  console.log(`Toggled: ${payload.id}`)
})

// Use actions
addTodo('Buy milk')
toggleTodo(1)
```

## Benefits

1. **Unified Event Bus**: All actions emit traceable events through the same system
2. **Type Accumulation**: Chain multiple `createAppEvent` calls, each returning a typed app
3. **Runtime Registration**: Events don't need to be predefined in schema
4. **Full Type Safety**: TypeScript infers all types from event creator and handler
5. **Event Transformation**: EventHandler supports `.map()`, `.filter()`, `.debounce()`, etc.
6. **Analytics Ready**: Easy to add logging/analytics by subscribing to all events
7. **Refactoring Safety**: Moving models only requires updating event registration

## Edge Cases Handled

1. **Runtime Event Registration**: Creates event helpers if they don't exist
2. **Event Name Collisions**: Uses full event names (`modelName:eventName`) to avoid conflicts
3. **Spread Arguments**: Custom emit wrapper handles tuple-to-spread conversion
4. **Error Rollback**: Automatic state rollback on handler errors
5. **Type Constraints**: Proper constraints ensure `keyof app.models` type safety
6. **ID Generation**: Tests use counters instead of `Date.now()` to avoid ID collisions

## Gotchas and Lessons Learned

### Gotcha #1: `App` Type Not Exported

**Initial assumption**: GPUI-TS exports an `App<TSchema>` type

**Reality**:
```typescript
// What's actually exported
type GPUIApp<TSchema extends AppSchema> = { models: ..., events: ... }

// Not exported
type App<TSchema> = ...  // Doesn't exist
```

**Solution**: Use `GPUIApp` throughout:
```typescript
import type { GPUIApp } from './index'
export type ModelStateType<TApp extends GPUIApp<any>, ...>
```

### Gotcha #2: Event Tuple vs Spread Arguments

**Discovery**: `createEvent<Parameters<TEventCreator>>()` expects tuple parameter

```typescript
// If TEventCreator is (text: string, priority: string) => ...
// Then Parameters<TEventCreator> is [text: string, priority: string]
// And emit expects: emit([text, priority]) not emit(text, priority)
```

**Solution**: Wrap base emit in custom function:
```typescript
const customEmit = (...args: Parameters<TEventCreator>) => {
  baseEmit(args)  // Convert spread to tuple
}
```

### Gotcha #3: `model.emit` is a Function, Not an Object

**Discovery**: `model.emit()` is a function for emitting events, not a namespace

```typescript
// Actual structure
model.emit({ type: 'eventName', payload: ... })  // Function call
model.onEvent((event) => { })  // Listen to events

// NOT this (doesn't exist):
model.emit.eventName(...)  // Would need to add as property
```

**Solution**: Functions can have properties in JavaScript:
```typescript
model.emit[eventName] = (...args) => { /* ... */ }  // Add property to function object
```

### Gotcha #4: Date.now() ID Collisions in Tests

**Issue**: Using `Date.now()` for IDs caused test failures when multiple items created quickly

```typescript
state.items.push({ id: Date.now(), ... })  // Same ID if called rapidly!
```

**Solution**: Use a counter in state:
```typescript
.model('todos', { items: [], nextId: 1 })
state.items.push({ id: state.nextId++, ... })
```

## Performance Characteristics

- **createAppEvent**: O(1) overhead - creates subscription and event helpers
- **Event Emission**: O(1) - direct model update with event emission
- **Event Listening**: O(n) where n = number of listeners (managed by ModelRegistry)
- **Type Computation**: Zero runtime cost - all type calculations are compile-time
- **Event Helper Creation**: One-time cost per event name per model

## Documentation

### Added to README.md

- New "Unified Event Bus with `createAppEvent`" section under Functional Controller Pattern
- Complete example with runtime event registration
- Event chaining example
- "When to use createAppEvent vs createModelEvent" comparison
- Integration with existing documentation structure

### JSDoc Comments

Complete JSDoc documentation with:
- Purpose and use cases (unified event bus pattern)
- Type parameters for all generics
- Parameters with descriptions
- Return value explanation (3-tuple structure)
- 3 practical examples showing different use cases
- Remarks about runtime registration and type accumulation

## Verification

### Test Results
```
✅ All 303 tests passing (11 new tests for createAppEvent)
✅ Test coverage: 100% for createAppEvent utility
✅ Integration verified with existing functional controller tests
```

### Type Checking
```
✅ TypeScript compilation successful
✅ Full type inference working for all cases
✅ No new type errors introduced
✅ Type utilities properly constrained with GPUIApp
```

### Build
```
✅ ESM build successful
✅ CJS build successful
✅ Types compiled successfully
```

## Comparison: createModelEvent vs createAppEvent

| Feature | createModelEvent | createAppEvent |
|---------|-----------------|----------------|
| Return Value | `[handler, emitter]` | `[handler, emitter, typedApp]` |
| Event Registration | No | Yes (runtime) |
| Event Emission | No automatic emission | Automatic via model.emit() |
| Event Listening | Not integrated | Via model.on.eventName() |
| Type Accumulation | No | Yes (chaining) |
| Use Case | Simple controllers | Unified event bus |
| Complexity | Lower | Higher |
| Integration | Standalone | Full schema integration |

**When to use:**
- **createModelEvent**: Quick functional controllers, no event bus needed
- **createAppEvent**: Unified event system, want traceable events, analytics/logging

## Next Steps (Future Enhancements)

1. **Schema Event Integration**: Handle existing schema events (currently creates new runtime events)
   ```typescript
   // Future: Check if event exists in schema and use it
   const existingEvent = schema.models[modelName].events?.[eventName]
   ```

2. **Event Middleware**: Add middleware for cross-cutting concerns:
   ```typescript
   createAppEvent(app, model, event, creator, handler, {
     middleware: [(payload) => { log(payload); return payload }]
   })
   ```

3. **Global Event Listeners**: Subscribe to all events across all models:
   ```typescript
   app.onAnyEvent((event) => {
     analytics.track(event.type, event.payload)
   })
   ```

4. **Event Replay**: Store events for time-travel debugging:
   ```typescript
   const events = app.getEventHistory()
   app.replayEvents(events.slice(0, 10))
   ```

5. **Async Event Handlers**: Support async handlers with proper error handling:
   ```typescript
   async (payload, state, ctx) => {
     const data = await fetch(...)
     state.data = data
   }
   ```

## Conclusion

Successfully implemented the `createAppEvent` utility with:
- ✅ Full type safety and inference with GPUIApp
- ✅ Runtime event registration with type accumulation
- ✅ 100% test coverage (11 new tests, 303 total passing)
- ✅ Comprehensive documentation with examples
- ✅ Zero breaking changes
- ✅ Clean integration with GPUI-TS event system

The implementation enables unified event architecture by providing runtime event registration with full type safety, following GPUI-TS principles of predictability, type safety, and developer ergonomics. This complements the existing `createModelEvent` utility, giving developers flexibility to choose between standalone controllers and unified event bus patterns.
