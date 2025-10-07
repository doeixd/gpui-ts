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
  createSubject, 
  Subject
} from './index'; // Import from core index
// import {
//   createResource,
//   createMachineModel,
//   ResourceState,
//   MachineModelAPI,
// } from './advanced'; // Import advanced features
import { fromModel } from './signals';
import { createResource, ResourceReturn } from './resource';


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
  appContext.set(app as GPUIApp<any>, true);
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
/*
export function useResource<TSource extends object, TData>(
  name: string,
  source: ModelAPI<TSource>,
  fetcher: (sourceValue: TSource) => Promise<TData>
): ModelAPI<ResourceState<TData>> {
  const app = useApp();
  return createResource(app, name, source, fetcher);
}
*/

/**
 * Context-aware hook to integrate an XState machine into the GPUI-TS ecosystem.
 * Automatically uses the active application instance.
 *
 * @template TMachine The XState machine definition.
 * @param name A unique name for this machine model.
 * @param machine The XState machine definition.
 * @returns An enhanced ModelAPI containing the machine's state and a type-safe `send` function.
 */
/*
export function useMachineModel<TMachine extends AnyStateMachine>(
  name: string,
  machine: TMachine
): MachineModelAPI<TMachine> {
  const app = useApp();
  return createMachineModel(app, name, machine);
}
*/

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


// Helper type to extract the state type from a Model or Subject
type StateFrom<T> = T extends ModelAPI<infer S> | Subject<infer S> ? S : never;

// Helper type to create a tuple of state types from a tuple of sources
type StatesFrom<T extends readonly any[]> = {
  [K in keyof T]: StateFrom<T[K]>
};

/**
 * Creates a single, unified Subject that is reactively derived from multiple
 * GPUI-TS Models or other Subjects. This is a powerful ergonomic helper for
 * preparing a view's complete state from various sources.
 *
 * It automatically subscribes to all sources and unsubscribes when the
 * returned `destroy` function is called, preventing memory leaks.
 *
 * @param sources An array of reactive sources (ModelAPI or Subject instances).
 * @param combiner A function that receives the latest state from each source
 *                 (in the same order) and returns the combined view state object.
 * @returns An object containing the derived `subject` and a `destroy` function
 *          for cleanup.
 */
export function createViewSubject<
  const TSources extends readonly (ModelAPI<any> | Subject<any>)[],
  TResult extends object
>(
  sources: TSources,
  combiner: (...args: StatesFrom<TSources>) => TResult
): { subject: Subject<TResult>; destroy: () => void } {

  // A helper function to get the current values from all sources at any time.
  const getCurrentValues = (): StatesFrom<TSources> => {
    return sources.map(source => 
      // Subjects are functions, Models have a .read() method
      typeof source === 'function' ? source() : (source as ModelAPI<any>).read()
    ) as StatesFrom<TSources>;
  };

  // Create the final view subject, initialized with the first combined state.
  const viewSubject = createSubject<TResult>(combiner(...getCurrentValues()));

  // The function that will run whenever any source changes.
  const update = () => {
    const newValues = getCurrentValues();
    viewSubject.set(combiner(...newValues));
  };

  // Subscribe to every source and store the unsubscribe functions.
  const unsubscribers = sources.map(source => 
    typeof source === 'function' 
      ? (source as Subject<any>).subscribe(update) 
      : (source as ModelAPI<any>).onChange(update)
  );

  // The destroy function cleans everything up.
  const destroy = () => {
    unsubscribers.forEach(unsub => unsub());
  };

  return { subject: viewSubject, destroy };
}

/**
 * A hook-style utility to manage loading states for non-urgent async updates.
 * This is a GPUI-TS equivalent of React's `useTransition` and Solid's `useTransition`.
 *
 * It provides a reactive boolean to show loading indicators and a function to wrap
 * your async work, which automatically manages the pending state.
 *
 * @returns A tuple `[isPending, startTransition]`.
 *   - `isPending`: A reactive `Subject<boolean>` that is `true` while the transition is active.
 *   - `startTransition`: An async function that you wrap your async work in.
 *
 * @example
 * const [isSaving, startSave] = useTransition();
 *
 * // In your event handler:
 * startSave(async () => {
 *   await api.saveUserData(data);
 * });
 *
 * // In your view:
 * html`${isSaving() ? 'Saving...' : 'Save'}`
 */
export function useTransition(): [Subject<boolean>, (work: () => Promise<any>) => Promise<void>] {
  const isPending = createSubject(false);

  const startTransition = async (work: () => Promise<any>): Promise<void> => {
    isPending.set(true);
    try {
      await work();
    } finally {
      isPending.set(false);
    }
  };

  return [isPending, startTransition];
}


/**
 * A hook-style utility for managing optimistic UI updates. It provides an instantly-updated
 * state for the UI while the actual async operation completes in the background. If the
 * operation fails, the state automatically reverts.
 *
 * @param source The source of truth (a GPUI-TS Model or Subject).
 * @returns A tuple `[optimisticState, startOptimisticUpdate]`.
 *   - `optimisticState`: A new `Subject` that immediately reflects optimistic changes.
 *                      Use this subject for rendering in your view.
 *   - `startOptimisticUpdate`: A function to wrap your async work. It takes an "action"
 *                           function that calculates the optimistic state.
 *
 * @example
 * const [optimisticTodos, updateTodos] = useOptimistic(todosModel);
 *
 * // In event handler:
 * updateTodos(
 *   (currentTodos, newTodo) => [...currentTodos, newTodo], // Optimistic action
 *   async (newTodo) => {
 *     await api.createTodo(newTodo); // Async work
 *   },
 *   newTodo // Arguments for the action/async work
 * );
 */
import type { DeepReadonly } from './index';

export function useOptimistic<TState extends object, TArgs extends any[]>(
  source: ModelAPI<TState> | Subject<DeepReadonly<TState>>
): [
  Subject<DeepReadonly<TState>>,
  (
    action: (currentState: DeepReadonly<TState>, ...args: TArgs) => DeepReadonly<TState>,
    asyncWork: (...args: TArgs) => Promise<any>,
    ...args: TArgs
  ) => Promise<void>
] {
  const getSourceValue = (): DeepReadonly<TState> => 
    typeof source === 'function' ? source() : (source as ModelAPI<TState>).read();
  
  // 1. The optimisticState subject holds the UI-facing state.
  const optimisticState = createSubject<DeepReadonly<TState>>(getSourceValue());

  // 2. Keep the optimistic state in sync with the source of truth.
  const unsubscribe = typeof source === 'function'
    ? source.subscribe((...args: any[]) => {
        // Subject.subscribe passes no arguments, so we call optimisticState.set with current value
        optimisticState.set(source());
      })
    : (source as ModelAPI<TState>).onChange((newState: TState) => {
        return optimisticState.set(structuredClone(newState) as DeepReadonly<TState>);
      });

  // This is a placeholder for a real effect cleanup if this were in a component context.
  // In a real app, you'd tie this to a view's lifecycle.
  // onCleanup(unsubscribe); 

  const startOptimisticUpdate = async (
    action: (currentState: DeepReadonly<TState>, ...args: TArgs) => DeepReadonly<TState>,
    asyncWork: (...args: TArgs) => Promise<any>,
    ...args: TArgs
  ): Promise<void> => {
    const originalState = getSourceValue();
    
    // 1. Immediately apply the optimistic update to our UI-facing subject.
    const newOptimisticState = action(originalState, ...args);
    optimisticState.set(structuredClone(newOptimisticState) as DeepReadonly<TState>);

    try {
      // 2. Perform the async work.
      await asyncWork(...args);
      // 3. On success, the source of truth will eventually be updated by another
      //    mechanism (e.g., a server push or a refetch), which will then flow
      //    down and sync our `optimisticState` via the subscription.
    } catch (error) {
      // 4. On failure, immediately revert the optimistic state to the original state.
      console.error("Optimistic update failed, reverting state.", error);
      optimisticState.set(originalState);
      // Optionally re-throw or handle the error
      throw error;
    }
  };

  return [optimisticState, startOptimisticUpdate];
}

/**
 * Creates a declarative reaction that runs a side-effect whenever a
 * source Model or Subject changes.
 * @param source The reactive source to watch.
 * @param effect The function to run with the new state of the source.
 * @returns A `destroy` function to clean up the subscription.
 */
export function createReaction<T extends object>(
  source: ModelAPI<T> | Subject<T>,
  effect: (value: T) => void
): { destroy: () => void } {
  const unsubscribe = typeof source === 'function'
    ? source.subscribe(() => effect(source()))
    : source.onChange(effect);

  return { destroy: unsubscribe };
}


/**
 * Creates a resource that is driven by a selection from another resource.
 * This encapsulates the common "cascading dropdown" pattern.
 *
 * @param parentResource The resource providing the list of options to select from.
 * @param selectionModel The model that holds the currently selected item from the parent.
 * @param fetcher The async function to fetch the child data based on the selection.
 * @returns The new child resource.
 */
export function createCascadingResource<TParent, TSelection, TChild>(
  parentResource: ResourceReturn<TParent[], any>[0],
  selectionModel: ModelAPI<{ selected: TSelection | null }>,
  fetcher: (selection: TSelection) => Promise<TChild[]>
): ResourceReturn<TChild[], any>[0] {
  // Automatically select the first item when the parent data loads.
  createReaction(parentResource, (res) => {
    if (res.data && res.data.length > 0 && selectionModel.read().selected === null) {
      // Assuming the first item is what we want to select.
      // A more robust version might take a selector function.
      selectionModel.set('selected', res.data[0] as any);
    }
  });

  const [childResource] = createResource(
    selectionModel,
    async ({ selected }) => {
      if (!selected) return [];
      return fetcher(selected);
    }
  );

  return childResource;
}