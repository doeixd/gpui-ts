# createEvent Usage Patterns: subscribe() vs Function Call

The `createEvent` function returns an `EventHandler` that can be used in two primary ways. Understanding the differences between these patterns is crucial for effective event-driven programming in GPUI-TS.

## Overview

```typescript
const [onEvent, emitEvent] = createEvent<string>()
```

The `onEvent` handler supports two usage patterns:

1. **Direct Subscription** - Using `.subscribe()`
2. **Transform Chain** - Calling as a function with a transform

## Pattern 1: Direct Subscription

### Usage
```typescript
const [onUserInput, emitUserInput] = createEvent<string>()

// Direct subscription to raw event payloads
onUserInput.subscribe((text: string) => {
  console.log('User typed:', text)
  // Process the input directly
})
```

### Characteristics
- **Direct Access**: Receives the raw event payload as emitted
- **Simple**: One-to-one relationship between emit and callback
- **No Transformation**: Payload is passed through unchanged
- **Manual Handling**: You handle the logic in the callback
- **Use Case**: When you need to react to events directly without complex transformations

### Example
```typescript
const [onButtonClick, emitButtonClick] = createEvent<{buttonId: string, timestamp: number}>()

onButtonClick.subscribe(({buttonId, timestamp}) => {
  // Direct access to the emitted payload
  console.log(`Button ${buttonId} clicked at ${timestamp}`)
  // Handle the event immediately
})
```

## Pattern 2: Transform Chain (Function Call)

### Usage
```typescript
const [onUserInput, emitUserInput] = createEvent<string>()

// Transform the event into a different shape
const processedInput = onUserInput
  .filter(text => text.length > 0)
  .map(text => text.trim().toLowerCase())
  .debounce(300)

// Use in reactive subjects
const searchQuery = createSubject(
  '',
  processedInput(query => query) // Transform function
)
```

### Characteristics
- **Transformation Pipeline**: Payload goes through a chain of transformations
- **Reactive Integration**: Designed for use with `createSubject` and reactive patterns
- **Deferred Execution**: Effects happen when the subject updates, not immediately on emit
- **Composable**: Can be chained with `.filter()`, `.map()`, `.debounce()`, etc.
- **Functional**: Transform functions return the new value/state

### Example
```typescript
const [onTodoAdd, emitTodoAdd] = createEvent<string>()

// Transform: validate -> normalize -> create update function
const validTodo = onTodoAdd
  .filter(text => text.trim().length > 0)
  .map(text => text.trim())

// Use in subject: transform payload into state update function
const todos = createSubject(
  [] as Todo[],
  validTodo(text => (currentTodos: Todo[]) => [
    ...currentTodos,
    { id: Date.now(), text, completed: false }
  ])
)

// The transform function receives the transformed payload
// and returns a function that updates the subject state
```

## Key Differences

| Aspect | Direct Subscription | Transform Chain |
|--------|-------------------|-----------------|
| **Execution Timing** | Immediate on emit | Deferred through subject updates |
| **Payload Access** | Raw emitted value | Transformed through pipeline |
| **Integration** | Standalone callbacks | Reactive subjects and effects |
| **Composition** | Manual in callback | Declarative through chaining |
| **Use Case** | Side effects, logging | State updates, derivations |
| **Return Value** | `undefined` | New `EventHandler` for chaining |

## When to Use Each Pattern

### Use Direct Subscription When:
- You need immediate side effects (logging, API calls, DOM manipulation)
- The event payload is exactly what you need
- You're not integrating with reactive state
- Simple one-off event handling

```typescript
// Good for direct subscription
onError.subscribe(error => {
  console.error('Error occurred:', error)
  // Send to error reporting service
})
```

### Use Transform Chain When:
- Building reactive state with `createSubject`
- You need to transform or validate event payloads
- Integrating with the reactive update system
- Creating complex event processing pipelines

```typescript
// Good for transform chain
const validatedInput = onUserInput
  .filter(text => text.length >= 3)
  .debounce(300)

const searchResults = createSubject(
  [],
  validatedInput(query => () => searchAPI(query))
)
```

## Advanced Patterns

### Combining Both Patterns

```typescript
const [onDataUpdate, emitDataUpdate] = createEvent<Data>()

// Use transform chain for reactive state
const processedData = onDataUpdate
  .filter(data => data.isValid)
  .map(data => normalizeData(data))

const dataStore = createSubject(
  null,
  processedData(data => data)
)

// Also use direct subscription for side effects
processedData.subscribe(data => {
  // Log analytics
  analytics.track('data_processed', { size: data.length })
})
```

### Subject Integration Details

When using the transform pattern with `createSubject`, the transform function you pass to the EventHandler should return either:

1. **Direct Value**: The new state value
2. **Update Function**: A function that receives current state and returns new state

```typescript
// Direct value
createSubject(initial, handler(value => value))

// Update function (for complex updates)
createSubject(initial, handler(payload => current => updateLogic(current, payload)))
```

## Best Practices

1. **Choose Based on Integration**: Use direct subscription for side effects, transform chains for reactive state
2. **Keep Transforms Pure**: Transform functions should be pure and not cause side effects
3. **Compose Wisely**: Use chaining for validation/filtering, reserve direct subscription for effects
4. **Type Safety**: Both patterns maintain full TypeScript inference
5. **Performance**: Transform chains are optimized for the reactive system

## Migration Guide

### From Direct Subscription to Transform Chain
```typescript
// Before
onEvent.subscribe(payload => {
  subject.set(transform(payload))
})

// After
const transformed = onEvent.map(payload => transform(payload))
createSubject(initial, transformed(value => value))
```

### From Transform Chain to Direct Subscription
```typescript
// Before
const transformed = onEvent.map(transform)
createSubject(initial, transformed(value => value))

// After
onEvent.subscribe(payload => {
  const transformedValue = transform(payload)
  // Handle directly
})
