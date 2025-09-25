# GPUI-TS

A type-safe reactive state management framework inspired by GPUI and solid-events. GPUI-TS provides centralized model ownership, functional reactive event composition, and declarative rendering with lit-html integration.

## Table of Contents

- [Why GPUI-TS?](#why-gpui-ts)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Comparison with Other Frameworks](#comparison-with-other-frameworks)
- [Common Patterns](#common-patterns)
- [FAQ](#faq)
- [Performance](#performance)
- [Resources](#resources)

## Why GPUI-TS?

Modern web applications struggle with state management complexity. Traditional approaches lead to:

- **State scattered across components** - Hard to track where mutations come from
- **Manual synchronization** - Forgetting to update UI when data changes
- **Type safety gaps** - Runtime errors from incorrect state access
- **Performance issues** - Unnecessary re-renders and memory leaks

GPUI-TS solves these problems with:

```typescript
// Define your entire app state structure with full type inference
const AppSchema = createSchema()
  .model('todos', { items: [], filter: 'all' })
  .model('ui', { newTodoText: '', editingId: null })
  .build()

const app = createApp(AppSchema)

// All state mutations are declarative and type-safe
const [onAddTodo, emitAddTodo] = createEvent<string>()
const validTodo = onAddTodo.filter(text => text.trim().length > 0)

const todos = createSubject(
  [],
  validTodo(text => todos => [...todos, { text, id: Date.now() }])
)

// Views automatically re-render when state changes
createView(app.models.todos, container, (state, ctx) => html`
  <input 
    .value=${ctx.bind('newTodoText').value}
    @input=${ctx.bind('newTodoText').onChange}
  />
  <ul>
    ${state.items.map(todo => html`<li>${todo.text}</li>`)}
  </ul>
`)
```

## Quick Start

### Installation

```bash
npm install gpui-ts lit-html
```

### Basic Example

```typescript
import { createSchema, createApp } from 'gpui-ts'
import { createView, html } from 'gpui-ts/lit-html'

// 1. Define your app schema (full type inference)
const CounterSchema = createSchema()
  .model('counter', { count: 0 })
  .build()

// 2. Create the app
const app = createApp(CounterSchema)

// 3. Create reactive view
createView(app.models.counter, document.body, (state, ctx) => html`
  <div>
    <h1>Count: ${state.count}</h1>
    <button @click=${() => ctx.updateAt('count', c => c + 1)}>
      Increment
    </button>
  </div>
`)
```

### Event-Driven Example

```typescript
// Create events with transformation chains
const [onIncrement, emitIncrement] = createEvent<number>()
const [onReset, emitReset] = createEvent<void>()

// Transform and validate events
const validIncrement = onIncrement.filter(delta => delta > 0)

// Create reactive subjects that respond to events
const counter = createSubject(
  0,
  validIncrement(delta => count => count + delta),
  onReset(() => 0)
)

// Wire up UI
document.getElementById('increment').onclick = () => emitIncrement(1)
document.getElementById('reset').onclick = () => emitReset()
```

## Core Concepts

### Models: Centralized State Ownership

Unlike Redux or Zustand, GPUI-TS models own their state completely. Updates go through a controlled API:

```typescript
// ❌ Direct mutation (impossible in GPUI-TS)
state.user.name = 'John'

// ✅ Controlled updates with context
app.models.user.update((state, ctx) => {
  state.name = 'John'
  ctx.notify() // Triggers reactive updates
  ctx.emit({ type: 'nameChanged', name: 'John' })
})

// ✅ Path-based updates with type safety
app.models.user.updateAt('profile.name', name => name.toUpperCase())

// ✅ Conditional updates with type guards
app.models.user.updateIf(
  (state): state is LoggedInUser => state.isLoggedIn,
  (user, ctx) => {
    // TypeScript knows user.profile exists here
    user.profile.lastSeen = new Date()
  }
)
```

### Events: Functional Reactive Composition

Events support transformation chains inspired by solid-events:

```typescript
const [onUserInput, emitUserInput] = createEvent<string>()

// Chain transformations with automatic type inference
const validInput = onUserInput
  .filter(text => text.length > 0)          // Remove empty strings
  .map(text => text.trim().toLowerCase())   // Normalize
  .debounce(300)                           // Reduce noise

// Multiple events can feed into subjects
const searchResults = createSubject(
  [],
  validInput(query => () => searchAPI(query)),
  onClearSearch(() => [])
)
```

### Subjects: Reactive State Derivation

Subjects automatically update when their dependencies change:

```typescript
// Subjects respond to multiple event sources
const todoStats = createSubject(
  { total: 0, completed: 0, active: 0 },
  onTodoAdded(() => stats => ({ 
    ...stats, 
    total: stats.total + 1, 
    active: stats.active + 1 
  })),
  onTodoToggled(({ completed }) => stats => ({
    ...stats,
    completed: completed ? stats.completed + 1 : stats.completed - 1,
    active: completed ? stats.active - 1 : stats.active + 1
  }))
)
```

### Schemas: Type-Safe App Definition

Schemas drive complete type inference:

```typescript
const BlogSchema = createSchema()
  .model('posts', {
    items: [] as Post[],
    loading: false,
    selectedId: null as string | null
  })
  .model('user', {
    profile: null as UserProfile | null,
    preferences: { theme: 'light', notifications: true }
  })
  .events({
    postSelected: { payload: { id: string } },
    themeChanged: { payload: { theme: 'light' | 'dark' } }
  })
  .plugin(authPlugin)  // Add authentication state
  .build()

// TypeScript infers everything:
// app.models.posts.updateAt('items.0.title', title => ...)
// app.models.user.readAt('preferences.theme') // 'light' | 'dark'
```

## API Reference

### Core Functions

#### `createApp<TSchema>(schema: TSchema)`

Creates a GPUI application with full type inference from schema.

```typescript
const app = createApp(MySchema)
// app.models.* are fully typed based on schema
```

#### `createSchema()`

Fluent builder for app schemas:

```typescript
const schema = createSchema()
  .model('todos', { items: [] })
  .events({ todoAdded: { payload: { text: string } } })
  .plugin(uiStatePlugin)
  .build()
```

#### `createEvent<T>()`

Creates event handler and emitter with transformation support:

```typescript
const [onEvent, emitEvent] = createEvent<PayloadType>()

// Transform with solid-events style chaining
const transformed = onEvent
  .filter(payload => isValid(payload))
  .map(payload => normalize(payload))
```

#### `createSubject<T>(initialValue, ...eventHandlers)`

Creates reactive state that responds to events:

```typescript
const count = createSubject(
  0,
  onIncrement(delta => current => current + delta),
  onReset(() => 0)
)
```

### Model API

```typescript
interface ModelAPI<T> {
  // State access
  read(): T
  readAt<P extends Path<T>>(path: P): PathValue<T, P>
  
  // Updates
  update(updater: (state: T, ctx: ModelContext<T>) => void): this
  updateAt<P extends Path<T>>(path: P, updater: (value: PathValue<T, P>) => PathValue<T, P>): this
  updateIf<TGuard extends T>(guard: (state: T) => state is TGuard, updater: (state: TGuard, ctx: ModelContext<T>) => void): this
  
  // Events
  emit<TEvent>(event: TEvent): this
  onEvent<TEvent>(handler: (event: TEvent) => void): () => void
  
  // Subscriptions
  onChange(listener: (current: T, previous: T) => void): () => void
  subscribeTo<TSource>(source: ModelAPI<TSource>, reaction: (source: TSource, target: T, ctx: ModelContext<T>) => void): ModelSubscription
  
  // Advanced
  lens<TFocus>(getter: (state: T) => TFocus): Lens<T, TFocus>
  focus<TFocus>(lens: Lens<T, TFocus>): FocusedModel<TFocus, T>
  transaction<TResult>(work: (ctx: ModelContext<T>) => TResult): TResult
  snapshot(): ModelSnapshot<T>
  validate(): ValidationResult<T>
}
```

### Lit-HTML Integration

```typescript
// Create reactive views
createView(model, container, (state, ctx) => html`
  <input .value=${ctx.bind('text').value} @input=${ctx.bind('text').onChange} />
  <button @click=${() => ctx.emit(submitEvent({ text: state.text }))}>
    Submit
  </button>
`)

// Component-style views
const MyComponent = createComponent<{name: string}, {count: number}>((props) => ({
  state: createSubject({ count: 0 }),
  template: (state, ctx) => html`
    <div>${props.name}: ${state.count}</div>
    <button @click=${() => ctx.updateAt('count', c => c + 1)}>+</button>
  `
}))
```

## Comparison with Other Frameworks

### vs Redux/RTK

| Feature | GPUI-TS | Redux/RTK |
|---------|---------|-----------|
| **Boilerplate** | Minimal with schema inference | High (actions, reducers, selectors) |
| **Type Safety** | Complete compile-time safety | Requires manual typing |
| **Learning Curve** | Moderate (new concepts) | High (many concepts) |
| **Performance** | Automatic batching, fine-grained updates | Requires React.memo optimization |
| **Side Effects** | Built-in effect system | Requires middleware (thunks, sagas) |

```typescript
// Redux: Multiple files, lots of boilerplate
const ADD_TODO = 'ADD_TODO'
interface AddTodoAction { type: typeof ADD_TODO; payload: { text: string } }
const addTodo = (text: string): AddTodoAction => ({ type: ADD_TODO, payload: { text } })
const todosReducer = (state = [], action: AnyAction) => { /* ... */ }

// GPUI-TS: Single declaration, full type inference
const TodoSchema = createSchema()
  .model('todos', { items: [] as Todo[] })
  .build()
```

### vs Zustand

| Feature | GPUI-TS | Zustand |
|---------|---------|---------|
| **State Updates** | Centralized with controlled mutations | Direct mutations in stores |
| **Reactivity** | Automatic reactive subscriptions | Manual selector-based subscriptions |
| **Event System** | First-class events with composition | No built-in event system |
| **Validation** | Built-in schema validation | Manual validation |

```typescript
// Zustand: Manual subscriptions
const useTodoStore = create((set) => ({
  todos: [],
  addTodo: (text) => set((state) => ({ todos: [...state.todos, { text }] }))
}))

// GPUI-TS: Reactive subjects
const todos = createSubject([], onTodoAdded(text => todos => [...todos, { text }]))
```

### vs MobX

| Feature | GPUI-TS | MobX |
|---------|---------|------|
| **Predictability** | Explicit updates through controlled API | Implicit updates via proxies |
| **Debugging** | Clear update paths, time travel | Can be hard to track mutation sources |
| **Type Safety** | Full TypeScript integration | Good but requires decorators/setup |
| **Framework Coupling** | Framework agnostic | Tight React coupling |

### vs React Hooks

| Feature | GPUI-TS | React Hooks |
|---------|---------|-------------|
| **State Sharing** | Global reactive models | Props drilling or Context |
| **Derived State** | Automatic with subjects | Manual with useMemo |
| **Side Effects** | Built-in effect system | useEffect dependencies |
| **Testing** | Framework-independent models | Component testing complexity |

```typescript
// React: Complex dependency management
const [todos, setTodos] = useState([])
const [filter, setFilter] = useState('all')
const filteredTodos = useMemo(() => 
  todos.filter(todo => filter === 'all' || todo.status === filter),
  [todos, filter]
)

// GPUI-TS: Automatic reactive derivation
const filteredTodos = createSubject(
  [],
  onTodosChanged(todos => () => filterTodos(todos, currentFilter())),
  onFilterChanged(filter => () => filterTodos(currentTodos(), filter))
)
```

## Common Patterns

### Form Handling

```typescript
const FormSchema = createSchema()
  .model('form', {
    values: { name: '', email: '', age: 0 },
    errors: {} as Record<string, string>,
    touched: {} as Record<string, boolean>,
    submitting: false
  })
  .build()

const app = createApp(FormSchema)

// Validation
const validateField = (field: string, value: any) => {
  if (field === 'email' && !value.includes('@')) {
    return 'Invalid email'
  }
  return null
}

// Form view with automatic validation
createView(app.models.form, container, (state, ctx) => html`
  <form @submit=${(e: Event) => {
    e.preventDefault()
    ctx.update(state => { state.submitting = true })
    submitForm(state.values)
  }}>
    <input
      name="email"
      .value=${ctx.bind('values.email').value}
      @input=${ctx.bind('values.email').onChange}
      @blur=${() => {
        const error = validateField('email', state.values.email)
        ctx.updateAt('errors.email', () => error)
        ctx.updateAt('touched.email', () => true)
      }}
    />
    ${state.errors.email && state.touched.email ? 
      html`<div class="error">${state.errors.email}</div>` : ''
    }
    
    <button type="submit" ?disabled=${state.submitting}>
      ${state.submitting ? 'Submitting...' : 'Submit'}
    </button>
  </form>
`)
```

### Async Data Loading

```typescript
const [onLoadUser, emitLoadUser] = createEvent<{ id: string }>()
const [onUserLoaded, emitUserLoaded] = createEvent<User>()
const [onUserError, emitUserError] = createEvent<Error>()

const userState = createSubject(
  { data: null, loading: false, error: null },
  onLoadUser(() => () => ({ data: null, loading: true, error: null })),
  onUserLoaded(user => () => ({ data: user, loading: false, error: null })),
  onUserError(error => () => ({ data: null, loading: false, error }))
)

// Side effect for API calls
onLoadUser.subscribe(async ({ id }) => {
  try {
    const user = await fetchUser(id)
    emitUserLoaded(user)
  } catch (error) {
    emitUserError(error)
  }
})

// View with suspense-like behavior
createView(userModel, container, (state, ctx) => html`
  ${suspense(state, {
    loading: html`<div class="spinner">Loading...</div>`,
    error: (error) => html`<div class="error">Error: ${error.message}</div>`,
    success: (user) => html`<div>Welcome, ${user.name}!</div>`
  })}
`)
```

### Real-time Updates

```typescript
const [onSocketMessage, emitSocketMessage] = createEvent<SocketMessage>()

// Different message types
const [userMessages, systemMessages, errorMessages] = createPartition(
  onSocketMessage,
  msg => msg.type === 'user' ? 0 : msg.type === 'system' ? 1 : 2
)

const chatState = createSubject(
  { messages: [], users: [], errors: [] },
  userMessages(msg => state => ({ 
    ...state, 
    messages: [...state.messages, msg] 
  })),
  systemMessages(msg => state => ({
    ...state,
    users: msg.type === 'user_joined' ? [...state.users, msg.user] : state.users
  })),
  errorMessages(msg => state => ({
    ...state,
    errors: [...state.errors, msg.error]
  }))
)

// WebSocket integration
const socket = new WebSocket('ws://localhost:8080')
socket.onmessage = (event) => {
  emitSocketMessage(JSON.parse(event.data))
}
```

## FAQ

### Q: How does GPUI-TS compare to React's built-in state management?

GPUI-TS provides centralized, reactive state that can be shared across your entire application without prop drilling or complex Context setups. React's useState is component-local, while GPUI-TS models are global and reactive.

### Q: Can I use GPUI-TS with React?

Yes! GPUI-TS is framework-agnostic. You can subscribe to model changes in React components:

```typescript
function MyReactComponent() {
  const [state, setState] = useState(todoModel.read())
  
  useEffect(() => {
    return todoModel.onChange(newState => setState(newState))
  }, [])
  
  return <div>{state.items.length} todos</div>
}
```

### Q: How does performance compare to other state management solutions?

GPUI-TS uses automatic batching and fine-grained reactivity. Updates are queued and flushed synchronously, preventing cascading re-renders. The lit-html integration only updates changed DOM nodes.

### Q: What's the learning curve like?

If you're familiar with Redux, the concepts translate well but with less boilerplate. If you know RxJS, the event composition patterns will feel natural. The hardest part is typically understanding centralized model ownership vs. local component state.

### Q: How do I handle side effects?

GPUI-TS has built-in effect systems:

```typescript
model.update((state, ctx) => {
  state.data = newData
  ctx.effect((currentState, cleanup) => {
    const timer = setInterval(() => console.log(currentState), 1000)
    cleanup(() => clearInterval(timer))
  })
})
```

### Q: Can I gradually adopt GPUI-TS in an existing app?

Yes! Start by converting a single piece of global state to a GPUI-TS model. The framework is designed for gradual adoption.

### Q: How do I debug state changes?

GPUI-TS includes development tools:

```typescript
// Enable debug mode
enableDevMode(app)

// Access debug info in browser console
window.__GPUI_DEBUG__.logAllState()
window.__GPUI_DEBUG__.analyzePerformance()

// Time travel debugging
const snapshot = model.snapshot()
// ... make changes ...
model.restore(snapshot)
```

### Q: What about TypeScript support?

GPUI-TS is built with TypeScript-first design. Schema definitions drive complete type inference throughout your app, eliminating the need for manual type annotations in most cases.

## Performance

<!-- ### Benchmarks

Based on TodoMVC implementations:

| Framework | Bundle Size | Memory Usage | Update Performance |
|-----------|-------------|--------------|-------------------|
| GPUI-TS | 12kb gzipped | Low (centralized state) | Excellent (batched updates) |
| Redux + RTK | 15kb gzipped | Medium (normalized state) | Good (with React.memo) |
| Zustand | 8kb gzipped | Low | Good |
| MobX | 16kb gzipped | Medium (proxy overhead) | Excellent | -->

### Optimization Tips

1. **Use batch operations** for multiple updates:
```typescript
app.batch(() => {
  model1.update(...)
  model2.update(...)
  model3.update(...)
}) // Single re-render
```

2. **Leverage memoization** in templates:
```typescript
createView(model, container, (state, ctx) => html`
  <div>${ctx.memo(() => expensiveComputation(state.data), [state.data])}</div>
`)
```

3. **Use path-based updates** for deep objects:
```typescript
// ✅ Efficient: only updates specific path
model.updateAt('user.profile.settings.theme', theme => theme === 'dark' ? 'light' : 'dark')

// ❌ Inefficient: updates entire state
model.update(state => {
  state.user.profile.settings.theme = state.user.profile.settings.theme === 'dark' ? 'light' : 'dark'
})
```

## Resources

### Documentation
- [API Reference](./docs/api.md)
- [Schema Guide](./docs/schemas.md)
- [Event System Guide](./docs/events.md)
- [Lit-HTML Integration](./docs/lit-html.md)
- [Migration Guide](./docs/migration.md)

### Examples
- [TodoMVC Implementation](./examples/todomvc)
- [Real-time Chat App](./examples/chat)
- [E-commerce Dashboard](./examples/dashboard)
- [Form Validation](./examples/forms)

### Community
- [GitHub Discussions](https://github.com/gpui-ts/gpui-ts/discussions)
- [Discord Server](https://discord.gg/gpui-ts)
- [Stack Overflow Tag](https://stackoverflow.com/questions/tagged/gpui-ts)

### Related Projects
- [lit-html](https://lit.dev/docs/libraries/lit-html/) - Template library
- [solid-events](https://github.com/devagrawal09/solid-events) - Event composition inspiration
- [Swift GPUI](https://developer.apple.com/documentation/swiftui) - Original inspiration

### Contributing
- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Architecture Decision Records](./docs/adr/)

---

**GPUI-TS** - Reactive state management that scales from simple counters to complex applications.

[Get Started](./docs/getting-started.md) | [API Docs](./docs/api.md) | [Examples](./examples/) | [GitHub](https://github.com/gpui-ts/gpui-ts)