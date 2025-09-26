/**
 * GPUI-TS Ergonomic Context API (with unctx)
 * ==========================================
 *
 * This optional module provides a Composition API-style interface for GPUI-TS,
 * inspired by Vue and powered by `unctx`. It allows functions to access the
 * core application instance, models, and other features without explicit prop drilling.
 * This makes setup code cleaner, more modular, and easier to reason about.
 *
 * --- HOW IT WORKS ---
 * 1. `createAppWithContext` creates your GPUI-TS app and registers it as a
 *    global singleton context using a unique namespace.
 * 2. Helper hooks like `useApp()`, `useModel()`, `useResource()`, etc., can then
 *    be called from anywhere within your synchronous setup code to retrieve the
 *    context or parts of it.
 *
 * --- ASYNC USAGE ---
 * As with all `unctx` implementations, the context is only available synchronously.
 * If you need to use a hook within an async function, you must cache the result
 * in a local variable before the first `await` statement.
 *
 * @dependency unctx: This module requires `unctx`. Install it with `npm install unctx`.
 */

import { getContext } from 'unctx';
import {
  AppSchema,
  createApp,
  EventScope,
  ModelAPI,
} from './index'; // Import from core index
import {
  createResource,
  createMachineModel,
  ResourceState,
  MachineModelAPI,
} from './advanced'; // Import advanced features
import { AnyStateMachine } from 'xstate';
import { fromModel } from './signals';


// --- TYPE DEFINITIONS ---

/**
 * A fully-typed GPUI application instance.
 * @template TSchema The application's schema, used to infer the shape of `models`.
 */
export type GPUIApp<TSchema extends AppSchema> = ReturnType<typeof createApp<TSchema>>;


// --- UNCTX SETUP ---

/**
 * The namespaced context for the GPUI-TS application.
 * Using a unique key ('gpui-ts-app-context') prevents conflicts with other libraries.
 */
const appContext = getContext<GPUIApp<any>>('gpui-ts-app-context');


// --- CORE API ---

/**
 * Creates and initializes a GPUI-TS application, setting it as the
 * active context for all ergonomic hooks. This is the main entry point for this module.
 *
 * @template TSchema The application schema definition.
 * @param schema The application schema.
 * @returns The fully-typed application instance.
 */
export function createAppWithContext<TSchema extends AppSchema>(
  schema: TSchema
): GPUIApp<TSchema> {
  const app = createApp(schema);
  // Set the created app instance as the singleton for our context.
  // The `true` flag allows overwriting, which is useful for HMR in development.
  appContext.set(app, true);
  return app;
}

/**
 * Hook to get the currently active GPUI-TS application instance.
 *
 * @template TApp The specific, fully-typed application type for your app.
 * @returns The application instance. Throws an error if called outside of a context.
 */
export function useApp<TApp extends GPUIApp<any>>(): TApp {
  return appContext.use() as TApp;
}

/**
 * Hook to safely get the currently active GPUI-TS application instance.
 *
 * @template TApp The specific, fully-typed application type for your app.
 * @returns The application instance, or `null` if called outside of a context.
 */
export function tryUseApp<TApp extends GPUIApp<any>>(): TApp | null {
  return appContext.tryUse() as TApp | null;
}

/**
 * Ergonomic hook to directly access a specific model from the active application.
 * Provides full type inference for the returned model based on its name.
 *
 * @template TApp The specific, fully-typed application type.
 * @template TModelName The name of the model to retrieve (must be a key of `TApp['models']`).
 * @param name The name of the model as defined in the schema.
 * @returns The fully-typed ModelAPI instance for the requested model.
 */
export function useModel<
  TApp extends GPUIApp<any>,
  TModelName extends keyof TApp['models']
>(name: TModelName): TApp['models'][TModelName] {
  const app = useApp<TApp>();
  if (!(name in app.models)) {
    // This check is mostly for safety; TypeScript should prevent this at compile time.
    throw new Error(`[GPUI-TS] Model "${String(name)}" does not exist in the application.`);
  }
  return app.models[name];
}

/**
 * Ergonomic hook to get the application's event scope for composition.
 *
 * @returns The EventScope instance.
 */
export function useEventScope(): EventScope {
  return useApp().events;
}


// --- CONTEXT-AWARE ADVANCED FEATURES ---

/**
 * Context-aware hook to create a reactive resource for managing asynchronous data.
 * Automatically uses the active application instance.
 *
 * @template TSource The type of the source model's state.
 * @template TData The type of the data returned by the fetcher.
 * @param name A unique name for this resource model.
 * @param source The reactive GPUI-TS model that provides input to the fetcher.
 * @param fetcher An async function that takes the source state and returns data.
 * @returns A ModelAPI for the resource's state (`{ data, loading, error }`).
 */
export function useResource<TSource extends object, TData>(
  name: string,
  source: ModelAPI<TSource>,
  fetcher: (sourceValue: TSource) => Promise<TData>
): ModelAPI<ResourceState<TData>> {
  const app = useApp();
  return createResource(app, name, source, fetcher);
}

/**
 * Context-aware hook to integrate an XState machine into the GPUI-TS ecosystem.
 * Automatically uses the active application instance.
 *
 * @template TMachine The XState machine definition.
 * @param name A unique name for this machine model.
 * @param machine The XState machine definition.
 * @returns An enhanced ModelAPI containing the machine's state and a type-safe `send` function.
 */
export function useMachineModel<TMachine extends AnyStateMachine>(
  name: string,
  machine: TMachine
): MachineModelAPI<TMachine> {
  const app = useApp();
  return createMachineModel(app, name, machine);
}

/**
 * Ergonomic hook that creates a read-only signal from a GPUI-TS model.
 *
 * This is the most convenient way to bridge state from the centralized GPUI-TS
 * store into the fine-grained signal system. It uses the active application
 * context to find the model by name.
 *
 * @param modelName The name of the model to subscribe to.
 * @param selector An optional function to select a slice of the model's state.
 * @returns A read-only signal accessor `() => T`.
 *
 * @example
 * // In a component setup function:
 * const userName = useSignalFromModel('user', state => state.name);
 * const counter = useSignalFromModel('counter');
 *
 * effect(() => {
 *   console.log(`${userName()}'s count is ${counter().count}`);
 * });
 */
export function useSignalFromModel<
  TApp extends GPUIApp<any>,
  TModelName extends keyof TApp['models'],
  TState extends TApp['models'][TModelName] extends ModelAPI<infer S> ? S : never,
  R
>(
  modelName: TModelName,
  selector: (state: TState) => R = (state) => state as unknown as R
): () => R {
  const model = useModel<TApp, TModelName>(modelName);
  return fromModel(model, selector);
}

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/*
// --- Uncomment this section to see a full usage example ---

// In a file like `my-app-types.ts`:
// import { createApp } from './gpui-ts-core';
// import { AppSchema } from './my-schema';
// export type MyApp = ReturnType<typeof createApp<typeof AppSchema>>;

// --- In your main application setup file (`main.ts`) ---

// Imaginary type for our app
// type MyApp = GPUIApp<{ models: { router: ModelAPI<{ params: { userId: string } }> } }>;

function setupUserFeature() {
  console.log('Setting up user feature...');

  // No need to pass `app` around. We can get the model directly.
  // The type is inferred! `routerModel` is correctly typed.
  const routerModel = useModel<MyApp, 'router'>('router');

  // useResource is now context-aware and doesn't need `app`.
  const userResource = useResource('user', routerModel, async (routerState) => {
    const { userId } = routerState.params;
    if (!userId) return null;
    const res = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
    return res.json();
  });

  console.log('User resource created and attached to router model.');
  return userResource;
}

function setupToggleFeature() {
    console.log('Setting up toggle feature...');
    // Define a simple machine
    const toggleMachine = setup({
        types: { events: {} as { type: 'TOGGLE' } }
    }).createMachine({
        id: 'toggle',
        initial: 'Inactive',
        states: { Inactive: { on: { TOGGLE: 'Active' } }, Active: { on: { TOGGLE: 'Inactive' } } }
    });

    // useMachineModel is also context-aware.
    const toggleModel = useMachineModel('toggle', toggleMachine);
    console.log('Toggle machine model created.');
    return toggleModel;
}


// --- Main Application Bootstrap ---

// 1. Define your schema
const AppSchema = {
  models: {
    router: {
      initialState: { params: { userId: '1' } }
    }
  }
};

// 2. Initialize the app using the context-aware creator. This sets the global context.
const app = createAppWithContext(AppSchema);

// 3. Now, call your setup functions. They will automatically access the context.
const userResource = setupUserFeature();
const toggleModel = setupToggleFeature();

console.log('Application setup complete!');
// Now you can use `app`, `userResource`, and `toggleModel` to build your UI.

*/