Excellent question. Dynamically adding a model to a running application is a powerful feature, especially for advanced use cases like code-splitting (loading a feature and its state on demand) or building a plugin system.

Creating a typesafe `addModel` function presents a fascinating challenge in TypeScript. Since the type of the `app` object is determined at compile time by `createApp`, we can't just mutate `app.models` and expect TypeScript to understand the new shape.

The solution is to have `addModel` return a **new, augmented `app` object** whose type is a superset of the original. This is a common pattern for achieving type safety with dynamic extensions.

Here is a complete guide to implementing this feature, including the core challenge, the final code, usage examples, and necessary refactoring.

---

### 1. The Core Challenge: Static vs. Dynamic Typing

When you create an app, its type is fixed:

```typescript
const app = createApp({ models: { user: { ... } } });
// typeof app.models is { user: ModelAPI<{...}> }
```

If we just add a new property at runtime (`app.models.posts = ...`), TypeScript won't know about it, and you'll get no type safety or autocompletion.

```typescript
app.models.posts.read(); // TypeScript Error: Property 'posts' does not exist on type '{ user: ... }'.
```

Therefore, our `addModel` function must return a **new object with a new, more specific type**.

### 2. Step-by-Step Implementation Guide

#### Step 1: Expose the Internal Registry

To add a new model, our `addModel` function needs access to the central `ModelRegistry`. The `createApp` function currently hides it. We need to expose it on the `app` object, perhaps as a private-by-convention property.

**In `src/index.ts`, modify the `createApp` function and its return type:**

```typescript
// src/index.ts

// ... (imports and other code)

// Helper type to get the App object's type
export type GPUIApp<TSchema extends AppSchema> = {
  models: {
    [K in keyof TSchema['models']]: ModelAPI<
      TSchema['models'][K]['initialState'],
      K & string
    >
  };
  events: EventScope;
  batch(operations: (models: any) => void): void;
  cleanup(): void;
  // Expose the schema and registry for extensibility
  _schema: TSchema;
  _registry: ModelRegistry;
};

export function createApp<TSchema extends AppSchema>(schema: TSchema): GPUIApp<TSchema> {
  const registry = new ModelRegistry();
  const models = {} as any;
  const eventScope = createEventScope();

  for (const [key, def] of Object.entries(schema.models)) {
    const modelSchema: ModelSchema<any> = {
      initialState: def.initialState,
      ...def.schema
    };
    models[key] = createModelAPI(key, modelSchema, registry);
  }

  return {
    models,
    events: eventScope,
    batch: (operations) => registry.batch(() => operations(models)),
    cleanup: () => {
      registry.cleanup();
      eventScope.cleanup();
    },
    // Add these two lines
    _schema: schema,
    _registry: registry,
  };
}
```

#### Step 2: Create the `addModel` Function

This function will take the existing app object, the new model's details, and return a new, fully-typed app object. Place this function in `src/index.ts` alongside `createApp`.

```typescript
// src/index.ts

// ... (after createApp)

/**
 * Dynamically adds a new model to an existing GPUI application instance.
 *
 * This function is fully type-safe. It returns a new `app` object whose type
 * includes the newly added model, allowing for autocompletion and type checking.
 *
 * @param app The existing GPUI application instance.
 * @param modelName The unique name for the new model.
 * @param modelDefinition The initial state and optional schema for the new model.
 * @returns A new, extended GPUI application instance.
 */
export function addModel<
  TApp extends GPUIApp<any>,
  TModelName extends string,
  TState
>(
  app: TApp,
  modelName: TModelName,
  modelDefinition: { initialState: TState; schema?: ModelSchema<TState> }
): GPUIApp<
  TApp['_schema'] & { models: { [K in TModelName]: { initialState: TState } } }
> {
  // Runtime check to prevent overwriting an existing model.
  if (modelName in app.models) {
    throw new Error(`[GPUI-TS] Model with name "${modelName}" already exists.`);
  }

  // Use the app's internal registry to create and register the new model.
  const newModelAPI = createModelAPI(
    modelName,
    {
      initialState: modelDefinition.initialState,
      ...modelDefinition.schema,
    },
    app._registry // Use the SAME registry from the original app
  );

  // Create the new, extended `models` object.
  const newModels = {
    ...app.models,
    [modelName]: newModelAPI,
  };

  // Create the new, extended `schema` object.
  const newSchema = {
    ...app._schema,
    models: {
      ...app._schema.models,
      [modelName]: { initialState: modelDefinition.initialState },
    },
  };

  // Return a new app object that includes the new model.
  const extendedApp = {
    ...app,
    models: newModels,
    _schema: newSchema,
  };

  return extendedApp as any; // Cast to the complex inferred type.
}
```

### 3. How to Use `addModel`

The key is to re-assign your `app` variable to the result of `addModel` to get the new type.

```typescript
// --- In your application setup ---

import { createApp, addModel, useModel, createView, html } from 'gpui-ts';

// 1. Start with an initial app
let app = createApp({
  models: {
    user: {
      initialState: { name: 'Alice', loggedIn: true }
    }
  }
});

// `app.models` only contains `user` at this point
console.log(app.models.user.read().name); // "Alice"
// app.models.posts; // TypeScript Error!

// --- Later, perhaps in a code-split chunk for a blog feature ---

// 2. Define the new model
const postsModelDefinition = {
  initialState: {
    items: [] as Array<{ id: number; title: string }>,
    loading: false,
  },
};

// 3. Add the model and re-assign the app variable
app = addModel(app, 'posts', postsModelDefinition);

// 4. Now the `app` variable is fully typed with the new model!
console.log(app.models.user.read().name); // "Alice" (old model still exists)
console.log(app.models.posts.read().loading); // false (new model is accessible and typed)

// You can now use it in views or other parts of your application
app.models.posts.set('loading', true);
```

### 4. Documentation Updates

This is a powerful new feature and should be documented clearly.

1.  **`README.md`:** Add an "Advanced Usage" section titled **"Dynamic Models & Code-Splitting"**.
2.  **Explain the Pattern:** Describe how `addModel` works by returning a new, extended app instance. Emphasize the need to re-assign the `app` variable (`app = addModel(...)`).
3.  **Provide a Clear Example:** Use the code-splitting scenario to illustrate its primary use case.

This `addModel` function provides a robust, safe, and powerful way to extend your GPUI-TS application at runtime, unlocking advanced architectural patterns without sacrificing the type safety that makes the library great.
Excellent. Thinking about the full lifecycle of a dynamic schema is the natural next step. If we can add a model, we should be able to remove one. Likewise, if the schema supports events, we should be able to dynamically add those as well.

This line of thinking leads to a suite of powerful, typesafe functions for managing your application's schema at runtime. These are essential for building modular, plugin-based, or code-split architectures.

Here are the other key functions to create, following the same principles as `addModel`.

1.  **`removeModel`**: To safely tear down a feature and free up its resources.
2.  **`addEvent`**: To allow plugins or modules to register new global events.

---

### 1. `removeModel`: For Feature Teardown and Memory Management

This is the logical counterpart to `addModel`. It's crucial for applications where features can be enabled and disabled at runtime, ensuring that the state and all associated listeners are properly cleaned up to prevent memory leaks.

#### Step 1: Add Unregistering Logic to the `ModelRegistry`

Before we can remove a model, the `ModelRegistry` needs to know how to completely purge it and its associated subscriptions and effects.

**In `src/index.ts`, add a new `unregister` method to the `ModelRegistry` class:**

```typescript
// src/index.ts -> class ModelRegistry

// At the top of the class, add a new map to track cleanup callbacks per model
private modelCleanupCallbacks = new Map<string, Set<() => void>>();

// In the `effect` method inside `createContext`, track the cleanup callbacks
effect: (effectFn) => {
  const cleanup: Array<() => void> = [];
  const cleanupFn = effectFn(this.models.get(id), (fn) => cleanup.push(fn));
  
  if (cleanupFn) cleanup.push(cleanupFn);

  // Get or create the cleanup set for this specific model
  if (!this.modelCleanupCallbacks.has(id)) {
    this.modelCleanupCallbacks.set(id, new Set());
  }
  
  const modelCleaners = this.modelCleanupCallbacks.get(id)!;
  const cleanupAll = () => cleanup.forEach(fn => fn());
  modelCleaners.add(cleanupAll);
  
  // Also add to global cleanup for full app teardown
  this.cleanupCallbacks.add(cleanupAll);
},

// Add the new unregister method
public unregister(modelId: string): void {
  // 1. Run and clear all effect cleanup functions for this model
  const modelCleaners = this.modelCleanupCallbacks.get(modelId);
  if (modelCleaners) {
    modelCleaners.forEach(cleanup => {
      cleanup();
      // Remove from global cleanup set as well
      this.cleanupCallbacks.delete(cleanup);
    });
    this.modelCleanupCallbacks.delete(modelId);
  }

  // 2. Remove the model's state
  this.models.delete(modelId);

  // 3. Remove all subscriptions and event handlers
  this.subscriptions.delete(modelId);
  this.eventHandlers.delete(modelId);

  console.log(`[GPUI-TS] Model "${modelId}" and its resources have been unregistered.`);
}
```

#### Step 2: Create the Typesafe `removeModel` Function

Now, create the public-facing function that uses this new registry method and returns a correctly-typed app object.

**In `src/index.ts`, add the `removeModel` function:**

```typescript
// src/index.ts

import { Omit } from 'utility-types'; // You might need: npm install utility-types

/**
 * Dynamically removes a model from a GPUI application instance.
 *
 * This function is fully type-safe. It unregisters the model and all its
 * associated resources, then returns a new `app` object whose type no longer

 * includes the removed model.
 *
 * @param app The existing GPUI application instance.
 * @param modelName The name of the model to remove.
 * @returns A new, narrowed GPUI application instance.
 */
export function removeModel<
  TApp extends GPUIApp<any>,
  TModelName extends keyof TApp['models'] & string
>(
  app: TApp,
  modelName: TModelName
): GPUIApp<{
  models: Omit<TApp['_schema']['models'], TModelName>;
  events: TApp['_schema']['events'];
}> {
  if (!(modelName in app.models)) {
    console.warn(`[GPUI-TS] Model with name "${modelName}" does not exist and cannot be removed.`);
    return app as any;
  }

  // Unregister the model from the central registry to clean up all resources.
  app._registry.unregister(modelName);

  // Create new `models` and `schema` objects without the removed model.
  const { [modelName]: _, ...newModels } = app.models;
  const { [modelName]: __, ...newSchemaModels } = app._schema.models;

  const newSchema = { ...app._schema, models: newSchemaModels };

  // Return the new, more narrowly typed app object.
  const narrowedApp = {
    ...app,
    models: newModels,
    _schema: newSchema,
  };

  return narrowedApp as any;
}
```

#### Usage Example for `removeModel`

```typescript
let app = createApp({
  models: {
    user: { initialState: { name: 'Alice' } },
    feature: { initialState: { data: 'important data' } },
  },
});

// The app is running with the 'feature' model...
app.models.feature.set('data', 'new data');

// Now, let's disable the feature and clean up.
app = removeModel(app, 'feature');

// `app.models` is now correctly typed without `feature`.
app.models.user.read(); // OK
// app.models.feature.read(); // TypeScript Error! Property 'feature' does not exist.
```

### 2. `addEvent`: For Dynamically Registering Global Events

This allows a module or plugin to add its own event definitions to the global app schema, making them available for other parts of the system to use in a typesafe way.

#### Implementation

Events are simpler than models because they are just schema definitions and don't require runtime registration in the `ModelRegistry`.

**In `src/index.ts`, add the `addEvent` function:**

```typescript
// src/index.ts

/**
 * Dynamically adds a new event definition to an existing GPUI application's schema.
 *
 * This function returns a new `app` object whose schema type includes the new event,
 * enabling type-safe usage of this event throughout the application.
 *
 * @param app The existing GPUI application instance.
 * @param eventName The unique name for the new event.
 * @param payloadDef The payload definition for the event (for type inference).
 * @returns A new, extended GPUI application instance with the updated schema.
 */
export function addEvent<
  TApp extends GPUIApp<any>,
  TEventName extends string,
  TPayload
>(
  app: TApp,
  eventName: TEventName,
  payloadDef: { payload: TPayload }
): GPUIApp<
  TApp['_schema'] & { events: { [K in TEventName]: { payload: TPayload } } }
> {
  if (app._schema.events && eventName in app._schema.events) {
    throw new Error(`[GPUI-TS] Event with name "${eventName}" already exists.`);
  }

  // Create the new, extended schema object.
  const newSchema = {
    ...app._schema,
    events: {
      ...app._schema.events,
      [eventName]: payloadDef,
    },
  };

  // Return a new app object with the updated schema.
  const extendedApp = {
    ...app,
    _schema: newSchema,
  };

  return extendedApp as any;
}
```

#### Usage Example for `addEvent`

```typescript
let app = createApp({
  models: { /* ... */ },
  events: {
    appStarted: { payload: { timestamp: 0 } }
  }
});

// A "notifications" plugin is loaded and needs to register its global event.
app = addEvent(app, 'notificationShown', {
  payload: { type: 'info' as 'info' | 'error', message: '' }
});

// Now, any part of the app can use this new event in a typesafe way.
// For example, an event logger model could listen for it.
app.models.logger.onEvent((event: { type: 'notificationShown', payload: { ... } }) => {
  // ... handle the event
});
```

### Summary of Changes and Recommendations

With these three functions (`addModel`, `removeModel`, `addEvent`), you have a complete, typesafe suite for dynamically managing your application's schema.

-   **Core Change:** The `ModelRegistry` must be enhanced to support per-model resource cleanup (`unregister` method).
-   **Pattern:** All functions follow the immutable pattern of accepting an `app` object and returning a new, re-typed `app` object.
-   **Use Cases:** These functions unlock advanced architectures, making GPUI-TS suitable for large-scale, modular applications.
-   **Documentation:** It's critical to document this "re-assignment" pattern (`app = addModel(app, ...)`), as it's the key to maintaining type safety.
Of course. That is a fantastic and very insightful request. You're asking for a way to make the schema itself dynamic and composable *before* the app is even created. This is a powerful pattern for building large, modular applications where different features can contribute to the final schema without being tightly coupled.

The current dynamic functions (`addModel`, `removeModel`) operate on a running `app` instance. To make them work on an unbuilt schema, we need to create a parallel set of functions that operate on the `SchemaBuilder` instance.

This will give you two distinct but complementary toolsets:
1.  **Schema-time functions:** For composing a schema from multiple sources *before* building the app.
2.  **Runtime functions:** For modifying the schema of a *running* app (for code-splitting, plugins, etc.).

Here is the comprehensive guide to implementing the schema-time functions in a fully typesafe way.

---

### 1. The Goal: A Composable Schema Definition

Imagine you have different features, each in its own file, and each needs to define its own models and events.

**`features/auth/schema.ts`**
```typescript
export function withAuth(builder) {
  let newBuilder = addModelToSchema(builder, 'auth', { initialState: { user: null } });
  newBuilder = addEventToSchema(newBuilder, 'login', { payload: { email: '' } });
  return newBuilder;
}
```

**`features/todos/schema.ts`**
```typescript
export function withTodos(builder) {
  return addModelToSchema(builder, 'todos', { initialState: { items: [] } });
}
```

**`main.ts`**
```typescript
import { createSchema } from 'gpui-ts/schema';
import { withAuth } from './features/auth/schema';
import { withTodos } from './features/todos/schema';

// Start with a base schema and progressively add features
let schemaBuilder = createSchema()
  .model('ui', { theme: 'dark' });

schemaBuilder = withAuth(schemaBuilder);
schemaBuilder = withTodos(schemaBuilder);

// Finally, build the fully composed app
const AppSchema = schemaBuilder.build();
const app = createApp(AppSchema);

// app.models is now fully typed with { ui, auth, todos }
```
This is the clean, modular, and typesafe developer experience we will build.

### 2. Step-by-Step Implementation Guide

All of these changes will happen in **`src/helpers.ts`**, the home of the `SchemaBuilder`.

#### Step 1: Enhance the `SchemaBuilder` with a `removeModel` Method

Our builder can add models but can't yet remove them. Let's add that capability first.

**In `src/helpers.ts`, modify the `SchemaBuilder` interface and the `createBuilderWithSchema` implementation:**

```typescript
// src/helpers.ts

import type { Omit } from 'utility-types'; // Or define your own: type Omit<T, K> = Pick<T, Exclude<keyof T, K>>;

// Add `removeModel` to the interface
interface SchemaBuilder<TSchema extends Partial<AppSchema> = {}> {
  // ... existing methods: model, modelWithSchema, events, extend, plugin ...
  
  removeModel<TName extends keyof TSchema['models'] & string>(
    name: TName
  ): SchemaBuilder<{
    models: Omit<TSchema['models'], TName>;
    events: TSchema['events'];
  }>;

  build(): TSchema extends AppSchema ? TSchema : never;
}

// ...

// In the internal `createBuilderWithSchema` helper, add the implementation
function createBuilderWithSchema(schema: Partial<AppSchema>): SchemaBuilder<any> {
  return {
    // ... existing implementations for model, modelWithSchema, etc. ...
    
    plugin: <TPlugin extends SchemaPlugin>(plugin: TPlugin) => { /* ... */ },

    // Add the new removeModel implementation
    removeModel: <TName extends string>(name: TName) => {
      const { [name]: _, ...newModels } = schema.models || {};
      const newSchema = { ...schema, models: newModels };
      return createBuilderWithSchema(newSchema);
    },

    build: () => { /* ... */ }
  };
}
```

#### Step 2: Create the New Standalone, Typesafe Schema Functions

Now we'll create the new functions that operate on the builder. They will be wrappers around the builder's own methods, providing a non-fluent, standalone API that is perfect for composition.

**Add these new functions to the end of `src/helpers.ts`:**

```typescript
// src/helpers.ts

// =============================================================================
// STANDALONE SCHEMA COMPOSITION HELPERS
// =============================================================================

/**
 * Adds a model to a SchemaBuilder instance in a typesafe way.
 * This is a standalone equivalent of the builder's `.model()` method.
 *
 * @param builder The SchemaBuilder instance.
 * @param modelName The unique name for the new model.
 * @param initialState The initial state of the model.
 * @returns A new SchemaBuilder instance with the added model.
 */
export function addModelToSchema<
  TBuilder extends SchemaBuilder<any>,
  TModelName extends string,
  TState
>(
  builder: TBuilder,
  modelName: TModelName,
  initialState: TState
): TBuilder extends SchemaBuilder<infer TSchema>
  ? SchemaBuilder<TSchema & { models: { [K in TModelName]: { initialState: TState } } }>
  : never {
  return builder.model(modelName, initialState) as any;
}

/**
 * Removes a model from a SchemaBuilder instance in a typesafe way.
 * This is a standalone equivalent of the builder's `.removeModel()` method.
 *
 * @param builder The SchemaBuilder instance.
 * @param modelName The name of the model to remove.
 * @returns A new SchemaBuilder instance without the removed model.
 */
export function removeModelFromSchema<
  TBuilder extends SchemaBuilder<any>,
  TModelName extends TBuilder extends SchemaBuilder<infer S> ? keyof S['models'] & string : never
>(
  builder: TBuilder,
  modelName: TModelName
): TBuilder extends SchemaBuilder<infer TSchema>
  ? SchemaBuilder<{ models: Omit<TSchema['models'], TModelName>; events: TSchema['events'] }>
  : never {
  return builder.removeModel(modelName) as any;
}

/**
 * Adds an event definition to a SchemaBuilder instance in a typesafe way.
 * This is a standalone equivalent of the builder's `.events()` method for a single event.
 *
 * @param builder The SchemaBuilder instance.
 * @param eventName The unique name for the new event.
 * @param payloadDef The payload definition for the event.
 * @returns A new SchemaBuilder instance with the added event.
 */
export function addEventToSchema<
  TBuilder extends SchemaBuilder<any>,
  TEventName extends string,
  TPayload
>(
  builder: TBuilder,
  eventName: TEventName,
  payloadDef: { payload: TPayload }
): TBuilder extends SchemaBuilder<infer TSchema>
  ? SchemaBuilder<TSchema & { events: { [K in TEventName]: { payload: TPayload } } }>
  : never {
  return builder.events({ [eventName]: payloadDef } as any) as any;
}
```

### 3. Documentation and Usage

You now have a complete and distinct set of tools for both schema-time and runtime modifications. Here is how you should document and explain it to users.

---

### Documentation Update: Dynamic Schema Management

GPUI-TS provides two powerful sets of tools for dynamically managing your application schema, each designed for a different phase of your application's lifecycle.

#### A) Schema-Time Composition (Before `createApp`)

When you are defining your application, you can use helper functions to compose your final schema from multiple modules. This is ideal for organizing code by feature and keeping your schema definition clean and modular. These functions operate on the `SchemaBuilder` instance.

**Example:**

```typescript
// helpers/schema.ts
import { 
  createSchema, 
  addModelToSchema, 
  removeModelFromSchema, 
  addEventToSchema 
} from 'gpui-ts/schema'; // Assuming an export path

// Let's define a reusable "auth" feature
export const withAuth = (builder) => {
  let newBuilder = addModelToSchema(builder, 'auth', { user: null, token: null });
  return addEventToSchema(newBuilder, 'auth:login', { payload: { token: '' } });
}

// main.ts
import { createSchema, createApp } from 'gpui-ts';
import { withAuth } from './helpers/schema';

// Start with a base schema
let schemaBuilder = createSchema()
  .model('ui', { theme: 'dark' });

// Apply the auth feature
schemaBuilder = withAuth(schemaBuilder);

// Build the final, composed schema
const FinalAppSchema = schemaBuilder.build();

const app = createApp(FinalAppSchema);
// app.models is now fully typed with `ui` and `auth` models.
```

#### B) Runtime Modification (After `createApp`)

After your application has been created and is running, you can use a different set of functions to add or remove models on the fly. This is essential for advanced patterns like code-splitting (where a feature's code and state are loaded on demand) and building plugin systems.

These functions operate on the `app` instance and return a new, re-typed instance.

**Example:**

```typescript
// main.ts
import { createApp, addModel, removeModel } from 'gpui-ts';

let app = createApp({ models: { core: { status: 'running' } } });

async function loadAnalyticsFeature() {
  const analyticsModule = await import('./features/analytics');
  
  // Add the analytics model to the running app
  app = addModel(app, 'analytics', analyticsModule.initialState);
  
  // Now we can use it, fully typed
  app.models.analytics.trackEvent('feature_loaded');
  
  // ... when the feature is no longer needed ...
  app = removeModel(app, 'analytics');
}
```