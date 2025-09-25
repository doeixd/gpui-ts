# State, Stores, and Reactivity in GPUI-TS

If you're coming from frameworks like Redux, Zustand, Pinia, or MobX, you might be looking for the concept of a "store" or "reactive objects." This guide explains how GPUI-TS addresses these patterns with its core primitives, helping you architect your application's state effectively.

The short answer is: **GPUI-TS provides powerful built-in solutions for state management, but with a philosophy that prioritizes explicitness and predictability over implicit reactivity.**

## Table of Contents

- [The Core Philosophy: Explicit is Better Than Implicit](#the-core-philosophy-explicit-is-better-than-implicit)
- [Models: Your Application's Global Stores](#models-your-applications-global-stores)
  - [Comparison with Other Store Patterns](#comparison-with-other-store-patterns)
  - [When to Use a Model](#when-to-use-a-model)
- [Subjects: Lightweight, Reactive Values](#subjects-lightweight-reactive-values)
  - [When to Use a Subject](#when-to-use-a-subject)
- [Why No "Reactive Objects" (`Proxy`)?](#why-no-reactive-objects-proxy)
- [Practical Guide: Which One Should I Use?](#practical-guide-which-one-should-i-use)

## The Core Philosophy: Explicit is Better Than Implicit

GPUI-TS is fundamentally designed around a principle inherited from the architecture of the Zed editor's UI framework: **every state change should be an explicit, controlled operation.**

This means that instead of mutating an object directly and having the framework react "magically," you will always call a function to describe the mutation.

**Implicit Reactivity (Not GPUI-TS):**
```javascript
// This is NOT how GPUI-TS works
const store = reactive({ count: 0 });
store.count++; // A direct mutation triggers an update
```

**Explicit Reactivity (The GPUI-TS Way):**
```typescript
// The state itself is a plain object
const counterModel = app.models.counter;

// The update is wrapped in a controlled function call
counterModel.update(state => {
  state.count++;
});
```

This design choice provides three key benefits:
1.  **Predictability:** It's always clear where a state change is coming from.
2.  **Debuggability:** You can easily log or intercept all `update` calls to trace your application's data flow.
3.  **Robustness:** It enables the queued effect system, which prevents common bugs like cascading updates and race conditions.

## Models: Your Application's Global Stores

In GPUI-TS, a **`Model` is the direct equivalent of a "store"** from libraries like Zustand or Pinia. It is a self-contained, feature-specific slice of your application's global state.

If you need a "user store," a "todos store," and a "cart store," you would define `user`, `todos`, and `cart` models within your central `AppSchema`.

```typescript
const AppSchema = createSchema()
  .model('user', { profile: null, isAuthenticated: false })
  .model('todos', { items: [], filter: 'all' })
  .model('cart', { items: [], total: 0 })
  .build();

const app = createApp(AppSchema);

// Access your "stores"
const userStore = app.models.user;
const todosStore = app.models.todos;
```

### Comparison with Other Store Patterns

| Feature | Zustand / Pinia | GPUI-TS `Model` |
| :--- | :--- | :--- |
| **Definition** | Created as an independent, importable module. | Defined centrally within the main `AppSchema`. |
| **State Shape** | Defined by the initial state object. | Defined by the `initialState` in the schema. |
| **Access** | `useUserStore()` hook or `userStore.getState()`. | `app.models.user` or the ergonomic `useModel('user')` hook. |
| **Updates** | Calling an "action": `userStore.login()`. | Calling a method: `userStore.update(state => ...)` |

The key architectural difference is that GPUI-TS `Models` are **centrally defined and instantiated together**. This enforces a single, unified source of truth for your entire application's state from the outset.

### When to Use a Model

You should use a `Model` for any state that is:

-   **Global or Shared:** Accessed by multiple, distant parts of your application.
-   **Persistent:** Represents the core, long-lived data of a feature (e.g., the list of todos, the user's session).
-   **Complex:** Has its own set of related actions, validations, or computed properties that benefit from being grouped in a formal `ModelSchema`.

## Subjects: Lightweight, Reactive Values

Sometimes, a full-blown global `Model` is more than you need. For local component state, temporary UI state, or simple derived values, a **`Subject`** is the perfect tool.

A `Subject` is a lightweight, standalone reactive value that holds state and updates in response to events. Think of it as a "signal" from SolidJS or a "store" from Svelte.

**Example: A `Subject` for a counter component:**```typescript
import { createSubject, createEvent } from 'gpui-ts';

// Create events to drive state changes
const [onIncrement, emitIncrement] = createEvent<void>();

// The Subject holds the state and defines how it reacts to events
const count = createSubject(
  0,
  onIncrement(() => current => current + 1)
);

// In your view:
// Read the value: count()
// Trigger an update: emitIncrement()
```

### When to Use a Subject

You should use a `Subject` for state that is:

-   **Local:** Managed entirely within a single view or component.
-   **Ephemeral:** Represents temporary UI state that doesn't need to be part of the global schema (e.g., "is this dropdown open?").
-   **Derived:** Calculated from one or more other state sources (models or other subjects).

## Why No "Reactive Objects" (`Proxy`)?

GPUI-TS intentionally avoids providing state objects that react to direct property mutation (which are typically implemented with JavaScript `Proxy`).

While this pattern can feel convenient, it can make complex data flows harder to trace and debug. The explicit `model.update(...)` style ensures that every state transition is a clear, deliberate event that the framework can control and reason about. This design choice is crucial for the stability and predictability that GPUI-TS aims to provide, especially in large and complex applications.

## Practical Guide: Which One Should I Use?

Use this table as a quick reference when deciding how to manage a piece of state.

| I need to store... | The best tool is a... | Example |
| :--- | :--- | :--- |
| The currently logged-in user's profile. | **`Model`** | `createSchema().model('user', ...)` |
| The list of items in a shopping cart. | **`Model`** | `createSchema().model('cart', ...)` |
| Whether a specific modal dialog is currently open. | **`Subject`** | `const isModalOpen = createSubject(false, ...)` |
| The search query text from an input field in a header component. | **`Subject`** | `const searchQuery = createSubject("", ...)` |
| A filtered list of todos, derived from the main `todos` model and a `filter` subject. | **`Subject`** | `const filteredTodos = createSubject([], ...)` |

By understanding the roles of `Models` and `Subjects`, you can build applications that are robust, scalable, and easy to maintain, leveraging the full power of GPUI-TS's explicit and predictable state management architecture.