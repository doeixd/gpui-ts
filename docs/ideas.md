Of course. That's an excellent idea for improving the ergonomics of the framework. You're looking for a convenience method that combines a state update with an automatic notification, reducing boilerplate and ensuring that UI-related changes always trigger a refresh.

Let's call this new function `updateAndNotify`. It will live on the `ModelAPI` alongside the existing `update` method.

Here is a comprehensive guide on how to add this function, including the "why," the implementation details, usage examples, and documentation updates.

### 1. The "Why": Improving Developer Experience

The goal is to simplify the most common update pattern.

**Before (Current API):**

A developer must always remember to call `ctx.notify()` to trigger UI updates. This is explicit but can be repetitive.

```typescript
app.models.counter.update((state, ctx) => {
  state.count++;
  ctx.notify(); // Manually notify
});```

**After (With `updateAndNotify`):**

The intent is clearer, and the code is more concise. The notification is guaranteed.

```typescript
app.models.counter.updateAndNotify(state => {
  state.count++;
});
```

### 2. Step-by-Step Implementation Guide

The changes are localized to a single file: `src/index.ts`.

#### Step 1: Update the `ModelAPI` Interface

First, add the new function's signature to the `ModelAPI` interface to make it available to TypeScript users and ensure type safety.

**In `src/index.ts`, inside the `interface ModelAPI<T, TName extends string = string>` block, add the following line:**

```typescript
// src/index.ts

interface ModelAPI<T, TName extends string = string> {
  // ... existing methods like read(), readAt(), update() ...

  /**
   * Updates the model's state and automatically queues a notification.
   * This is a convenience method for the common pattern of updating state
   * that should immediately trigger a re-render in associated views.
   * The updater callback does not receive the context object.
   *
   * @param updater A function that receives a mutable draft of the state.
   * @returns The ModelAPI instance for chaining.
   */
  updateAndNotify(updater: (state: T) => void): this;

  // ... other existing methods ...
}```

#### Step 2: Implement the `updateAndNotify` Function

Next, implement the function's logic inside the `createModelAPI` factory function. The best way to do this is by reusing the existing `update` method to ensure all underlying logic (like batching and effect queuing) is respected.

**In `src/index.ts`, inside the `createModelAPI` function, add the new method to the returned `api` object:**

```typescript
// src/index.ts

function createModelAPI<T, TName extends string>(
  name: TName,
  schema: ModelSchema<T>,
  registry: ModelRegistry
): ModelAPI<T, TName> {
  // ... existing setup logic ...

  const api: ModelAPI<T, TName> = {
    // ... existing implementations for read, update, etc. ...
    
    update: function(updater: (state: T, ctx: ModelContext<T>) => void) {
      registry.update(name, updater);
      // Sync local state
      currentState = registry.read(name);
      return this;
    },

    // Add the new implementation here
    updateAndNotify: function(updater: (state: T) => void) {
      // Reuse the core `update` method to ensure consistency.
      this.update((state, ctx) => {
        // Run the user's state mutation logic.
        updater(state);
        // Automatically call notify on the context.
        ctx.notify();
      });
      // Return `this` to allow for chaining.
      return this;
    },

    updateAt: function<P extends Path<T>>(
      // ... rest of the api object ...
    )
  };

  return api;
}
```

That's it. The function is now fully implemented and type-safe.

### 3. Usage Example

Here is how you would use the new function in practice.

```typescript
// --- In an application file ---

// 1. Define your app schema
const AppSchema = {
  models: {
    todos: {
      initialState: {
        items: [] as Array<{ id: number; text: string; completed: boolean }>,
        newTodoText: ''
      }
    }
  }
};

// 2. Create the app
const app = createApp(AppSchema);

// 3. Use the new helper in your application logic
function addTodo() {
  app.models.todos.updateAndNotify(state => {
    const newText = state.newTodoText.trim();
    if (newText) {
      state.items.push({
        id: Date.now(),
        text: newText,
        completed: false
      });
      state.newTodoText = ''; // Clear the input field
    }
  });
  // No need to worry about forgetting `ctx.notify()`!
  // Any view subscribed to the `todos` model will now re-render.
}
```

### 4. Documentation Updates

For the project to be complete, you must document this new, improved API.

1.  **Update `README.md`:** In the "Core Concepts" and "API Reference" sections, add `updateAndNotify` as the recommended method for most UI-related state changes. Be sure to update any relevant code examples to use the new, simpler syntax.

2.  **Update `docs/stores.md`:** The section "The GPUI-TS Way" should be updated to show both `update` (for silent changes) and `updateAndNotify` (for UI changes), explaining the difference.

By adding this simple but powerful helper, you make the entire framework more intuitive and less error-prone for everyday use.
Excellent suggestion. Adding a structured way to handle errors within the update logic itself makes the framework significantly more robust and prevents unexpected crashes from corrupting your application's state.

This feature transforms a simple update into a safe, atomic transaction. If the update logic fails, the state remains unchanged, and you get a clean way to log the error or notify the user.

Here’s the plan:

1.  **Make the Core `update` Method Transactional:** To ensure no state corruption, we'll first modify the `ModelRegistry.update` method to automatically roll back any changes if the updater function throws an error. This is a crucial foundational improvement.
2.  **Enhance `updateAndNotify`:** We'll add the optional `onError` callback. If the updater fails, this new callback will be invoked with the error details.

---

### 1. Step-by-Step Implementation Guide

All changes will be in `src/index.ts`.

#### Step 1: Make the Core `ModelRegistry.update` Method Atomic (Crucial)

This is the most important change. We will make every update transactional by default, which is a massive stability win for the entire library.

**In `src/index.ts`, modify the `update` method inside the `ModelRegistry` class:**

```typescript
// src/index.ts -> class ModelRegistry

  /**
   * Update model state with queued effects. This operation is atomic.
   * If the updater throws an error, the state is rolled back.
   */
  update<T>(
    id: string,
    updater: (model: T, ctx: ModelContext<T>) => void
  ): void {
    const model = this.models.get(id);
    if (!model) return;

    // 1. Create a snapshot for potential rollback.
    const snapshot = structuredClone(model);

    try {
      // 2. Attempt the update.
      const ctx = this.createContext<T>(id);
      updater(model, ctx);
    } catch (error) {
      // 3. If an error occurs, restore the state from the snapshot.
      this.models.set(id, snapshot);
      console.error(`[GPUI-TS] Error during update for model "${id}". State has been rolled back.`, error);
      // 4. Re-throw the error so the caller is aware of the failure.
      throw error;
    }

    // 5. If successful, flush effects as normal.
    if (this.batchDepth === 0 && !this.flushingEffects) {
      this.flushEffects();
    }
  }```

With this change, your entire application is now safer. No failed `update` can ever leave a model in a partially modified, inconsistent state.

#### Step 2: Update the `ModelAPI` Interface

Now, let's add the new `onError` argument to the `updateAndNotify` signature in the `ModelAPI` interface.

**In `src/index.ts`, inside `interface ModelAPI<T, ...>`, modify `updateAndNotify`:**

```typescript
// src/index.ts -> interface ModelAPI

  /**
   * Updates the model's state and automatically queues a notification.
   * This operation is atomic; if the updater throws, the state is rolled back.
   *
   * @param updater A function that receives a mutable draft of the state.
   * @param onError An optional callback that is invoked if the updater throws an error.
   *                Receives the error and the state before the update was attempted.
   * @returns The ModelAPI instance for chaining.
   */
  updateAndNotify(
    updater: (state: T) => void,
    onError?: (error: unknown, initialState: T) => void
  ): this;
```

#### Step 3: Implement the Error Handling Logic

Finally, implement the `try...catch` logic in the `updateAndNotify` function within `createModelAPI`.

**In `src/index.ts`, inside the `createModelAPI` function, replace the previous `updateAndNotify` implementation with this new version:**

```typescript
// src/index.ts -> createModelAPI

    updateAndNotify: function(
      updater: (state: T) => void,
      onError?: (error: unknown, initialState: T) => void
    ) {
      // Capture the state *before* the update attempt.
      const initialState = this.read();
      try {
        // Use the core `update` method. It's already transactional.
        this.update((state, ctx) => {
          updater(state);
          ctx.notify();
        });
      } catch (error) {
        // If an error was thrown by the (now transactional) update...
        if (onError) {
          // ...call the provided error handler.
          onError(error, initialState);
        } else {
          // ...otherwise, re-throw the error to ensure it's not silently swallowed.
          throw error;
        }
      }
      return this;
    },
```

### 2. Usage Examples

This new feature makes handling invalid operations incredibly clean.

#### Example 1: Gracefully Handling an Error

Imagine a counter that cannot go below zero.

```typescript
const app = createApp({
  models: {
    counter: { initialState: { count: 5, error: null as string | null } }
  }
});

function decreaseCount(amount: number) {
  app.models.counter.updateAndNotify(
    // The updater function
    state => {
      if (state.count - amount < 0) {
        throw new Error("Cannot decrease count below zero.");
      }
      state.count -= amount;
      state.error = null; // Clear previous error on success
    },
    // The new onError handler
    (error, initialState) => {
      console.warn("Update failed, but we handled it!", {
        error,
        stateBefore: initialState
      });
      // Update the state to show an error message to the user
      app.models.counter.update(state => {
        state.error = (error as Error).message;
      });
    }
  );
}

// This will succeed
decreaseCount(3);
// counter.read().count is now 2
// counter.read().error is null

// This will fail
decreaseCount(10); 
// The updater throws. The onError handler catches it.
// The state is rolled back to { count: 2, error: null }.
// The onError handler then sets the error message.
// Final state: { count: 2, error: "Cannot decrease count below zero." }
```

#### Example 2: Letting an Error Crash (Default Behavior)

If you don't provide an `onError` handler, the error will propagate as it did before, which is often the desired behavior during development.

```typescript
function faultyUpdate() {
  app.models.counter.updateAndNotify(state => {
    // This will throw, and since there's no onError handler, the entire call will throw.
    throw new Error("Something went wrong!"); 
  });
}

// This will throw an exception, halting execution.
// The counter's state will be safely rolled back to what it was before the call.
try {
  faultyUpdate();
} catch (e) {
  console.error("Caught the re-thrown error:", e);
}
```

### 3. Documentation Updates

Remember to update your project's documentation to reflect this powerful new feature:

*   **`README.md`:** Update the API reference and code examples to show the new optional `onError` argument. Highlight this as a key feature for building robust applications.
*   **`docs/stores.md`:** Emphasize that all updates are now atomic operations.

By implementing this change, you've significantly improved the reliability and developer experience of GPUI-TS, making it a safer and more predictable choice for complex state management.
Yes, absolutely. Thinking along the lines of "safe and ergonomic wrappers for common patterns" is the key to creating a truly great developer experience. Building on `updateAndNotify`, here are several other highly useful helper functions you could add to the `ModelAPI`.

Each of these helpers would be implemented in `src/index.ts` inside the `createModelAPI` function, just like `updateAndNotify`.

### 1. Basic State Manipulation Helpers

These helpers cover the most frequent, simple state changes, making the code more declarative and less verbose.

#### a. `set(path, value)`: For Direct Value Assignment

*   **The "Why":** Avoids the boilerplate of writing an updater function just to set a value. It's the most common state mutation.

*   **Before:** `app.models.user.update(state => { state.profile.name = 'Jane'; });`
*   **After:** `app.models.user.set('profile.name', 'Jane');`

*   **Implementation:**
    1.  **Interface (`ModelAPI`):**
        ```typescript
        set<P extends Path<T>>(path: P, value: PathValue<T, P>): this;
        ```
    2.  **Function (`createModelAPI`):**
        ```typescript
        set: function<P extends Path<T>>(path: P, value: PathValue<T, P>) {
          this.updateAndNotify(state => {
            setNestedProperty(state, path as string, value);
          });
          return this;
        },
        ```
        *(This assumes the `setNestedProperty` helper from `src/index.ts`)*

#### b. `toggle(path)`: For Booleans

*   **The "Why":** Toggling boolean flags (like UI visibility) is extremely common. This makes the intent crystal clear.

*   **Before:** `app.models.ui.updateAndNotify(state => { state.isSidebarOpen = !state.isSidebarOpen; });`
*   **After:** `app.models.ui.toggle('isSidebarOpen');`

*   **Implementation:**
    1.  **Interface (`ModelAPI`):**
        ```typescript
        // This advanced type ensures the path points to a boolean
        toggle<P extends Path<T>>(
          path: PathValue<T, P> extends boolean ? P : never
        ): this;
        ```
    2.  **Function (`createModelAPI`):**
        ```typescript
        toggle: function<P extends Path<T>>(path: P) {
          this.updateAndNotify(state => {
            const currentValue = getNestedProperty(state, path as string);
            if (typeof currentValue !== 'boolean') {
              console.warn(`[GPUI-TS] toggle called on non-boolean path "${String(path)}".`);
              return;
            }
            setNestedProperty(state, path as string, !currentValue);
          });
          return this;
        },
        ```

#### c. `reset()`: To Revert to Initial State

*   **The "Why":** Provides a simple, one-shot way to reset a model to its original state, which is great for forms or resetting features.

*   **Before:** `app.models.form.updateAndNotify(state => { Object.assign(state, initialFormState); });`
*   **After:** `app.models.form.reset();`

*   **Implementation:**
    1.  **Interface (`ModelAPI`):**
        ```typescript
        reset(): this;
        ```
    2.  **Function (`createModelAPI`):**
        ```typescript
        reset: function() {
          // It has access to the schema's initial state via closure
          this.updateAndNotify(state => {
            // A safe way to reset without changing the object reference
            Object.keys(state as object).forEach(key => delete (state as any)[key]);
            Object.assign(state, structuredClone(schema.initialState));
          });
          return this;
        },
        ```

### 2. Array Manipulation Helpers

Working with arrays immutably can be verbose. These helpers simplify the most common list operations.

#### a. `push(path, ...items)`: To Add to an Array

*   **The "Why":** Simplifies adding one or more items to an array in the state.

*   **Before:** `app.models.todos.updateAndNotify(state => { state.items.push(newTodo); });` (Note: this is a direct mutation, which is only safe inside the updater). A safer immutable way is `state.items = [...state.items, newTodo]`.
*   **After:** `app.models.todos.push('items', newTodo);`

*   **Implementation:**
    1.  **Interface (`ModelAPI`):**
        ```typescript
        push<P extends Path<T>>(
          path: P, 
          ...items: PathValue<T, P> extends (infer U)[] ? U[] : never
        ): this;
        ```
    2.  **Function (`createModelAPI`):**
        ```typescript
        push: function<P extends Path<T>>(path: P, ...items: any[]) {
          this.updateAt(path, (currentArray: any) => {
            if (!Array.isArray(currentArray)) {
              console.warn(`[GPUI-TS] push called on non-array path "${String(path)}".`);
              return currentArray;
            }
            return [...currentArray, ...items];
          });
          return this;
        },
        ```

#### b. `removeWhere(path, predicate)`: To Remove from an Array

*   **The "Why":** Provides a declarative way to remove items from an array without needing to find the index first.

*   **Before:** `app.models.todos.updateAndNotify(state => { state.items = state.items.filter(item => item.id !== todoIdToRemove); });`
*   **After:** `app.models.todos.removeWhere('items', item => item.id === todoIdToRemove);`

*   **Implementation:**
    1.  **Interface (`ModelAPI`):**
        ```typescript
        removeWhere<P extends Path<T>>(
          path: P,
          predicate: (item: PathValue<T, P> extends (infer U)[] ? U : never) => boolean
        ): this;
        ```
    2.  **Function (`createModelAPI`):**
        ```typescript
        removeWhere: function<P extends Path<T>>(path: P, predicate: (item: any) => boolean) {
          this.updateAt(path, (currentArray: any) => {
            if (!Array.isArray(currentArray)) {
              console.warn(`[GPUI-TS] removeWhere called on non-array path "${String(path)}".`);
              return currentArray;
            }
            return currentArray.filter(item => !predicate(item));
          });
          return this;
        },
        ```

### 3. Asynchronous Operation Helper

This is a more advanced helper that encapsulates the entire async operation lifecycle.

#### `updateAsync(asyncUpdater, options)`: For Async State Changes

*   **The "Why":** Asynchronous data fetching is a huge part of modern apps. This helper formalizes the "loading -> success/error" state transitions, reducing boilerplate and preventing race conditions. This is a production-grade version of the `createResource` concept from `src/advanced.ts`, but built directly into the model.

*   **Before:**
    ```typescript
    // Manually manage loading and error states
    app.models.user.updateAndNotify(s => { s.loading = true; s.error = null; });
    fetchUser(userId)
      .then(user => {
        app.models.user.updateAndNotify(s => {
          s.data = user;
          s.loading = false;
        });
      })
      .catch(error => {
        app.models.user.updateAndNotify(s => {
          s.error = error;
          s.loading = false;
        });
      });
    ```

*   **After:**
    ```typescript
    // Lifecycle is handled automatically
    app.models.user.updateAsync(
      async () => {
        const data = await fetchUser(userId);
        return { data }; // Return the partial state to merge on success
      },
      {
        // Define which state properties to manage
        loadingKey: 'loading',
        errorKey: 'error',
      }
    );
    ```

*   **Implementation:**
    1.  **Interface (`ModelAPI`):**
        ```typescript
        updateAsync<
          LoadingKey extends keyof T,
          ErrorKey extends keyof T
        >(
          updater: (state: T) => Promise<Partial<T>>,
          options: {
            loadingKey: PathValue<T, LoadingKey> extends boolean ? LoadingKey : never;
            errorKey: ErrorKey;
            onError?: (error: unknown, initialState: T) => void;
          }
        ): Promise<void>;
        ```
    2.  **Function (`createModelAPI`):**
        ```typescript
        updateAsync: async function(updater, options) {
          const { loadingKey, errorKey, onError } = options;

          this.updateAndNotify(state => {
            (state as any)[loadingKey] = true;
            (state as any)[errorKey] = null;
          });

          const initialState = this.read();
          try {
            const result = await updater(initialState);
            this.updateAndNotify(state => {
              Object.assign(state, result);
              (state as any)[loadingKey] = false;
            });
          } catch (error) {
            this.updateAndNotify(state => {
              (state as any)[loadingKey] = false;
              (state as any)[errorKey] = error;
            });
            if (onError) {
              onError(error, initialState);
            }
          }
        },
        ```

By adding these well-designed helpers, you significantly increase the power and usability of GPUI-TS, allowing developers to write cleaner, safer, and more expressive state management logic.