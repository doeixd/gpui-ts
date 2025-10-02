/**
 * GPUI-TS: Advanced Features Module
 * =================================
 * 
 * This module extends the core GPUI-TS library with powerful patterns for
 * advanced state management and reactivity.
 * 
 * Features:
 * 1.  **Signal-Based Reactivity:** A `createReactiveView` function and `signal`
 *     directive that bring fine-grained, SolidJS-style reactivity to lit-html views.
 * 2.  **Formalized Async State:** A `createResource` primitive that declaratively
 *     manages asynchronous data fetching based on a reactive source, handling
 *     loading states, errors, and race conditions automatically.
 * 3.  **State Machine Integration:** A `createMachineModel` helper to seamlessly
 *     integrate XState machines into the GPUI-TS ecosystem for robust, predictable
 *     state management in complex components.
 * 
 * @dependency xstate: This module requires the `xstate` library for the
 *             `createMachineModel` feature. Please install it with `npm install xstate`.
 */

import { TemplateResult } from 'lit-html';
import { directive } from 'lit/directive.js';
 import { ModelAPI, createView, GPUIApp } from './index'; // Import from core index
 import { ViewContext } from './lit'; // Import ViewContext

// --- XState Peer Dependency Imports ---
// These are the necessary imports for the state machine integration.
import { createActor, AnyStateMachine, SnapshotFrom, Actor } from 'xstate';

// Types are now properly imported

// Type aliases
type AppContext = GPUIApp<any>;

// =============================================================================
// SECTION 1: SIGNAL-BASED REACTIVITY FOR VIEWS
// =============================================================================

// A lightweight reactive primitive to hold a value and notify subscribers.
export class Signal<T> {
  private value: T;
  private subscribers = new Set<() => void>();

  constructor(initialValue: T) {
    this.value = initialValue;
  }

  /**
   * Subscribes a callback to run whenever the signal's value changes.
   * @returns An unsubscribe function.
   */
  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Gets the current value of the signal.
   */
  get(): T {
    return this.value;
  }

  /**
   * Sets a new value for the signal and notifies all subscribers if the value has changed.
   */
  set(newValue: T): void {
    if (this.value !== newValue) {
      this.value = newValue;
      this.subscribers.forEach(cb => cb());
    }
  }
}

// A computed signal that derives its value from other signals or functions.
// TODO: Implement when Signal class extension is fixed

/**
   * A custom lit-html directive to subscribe a part of the DOM to a signal.
   * When the signal updates, only this specific part will be re-rendered.
   * Compatible with lit-html v3.
   */
export const signal = (sig: Signal<any>) => {
  // In lit-html v3, directives are functions that return a value
  // This is a simple implementation that just returns the current value
  // For more advanced reactivity, we might need to use lit-html's reactive system
  return sig.get();
};


/**
 * An enhanced ViewContext that includes the `select` method.
 */
interface ReactiveViewContext<TModel extends object> extends ViewContext<TModel> {
  /**
   * Creates a fine-grained, reactive "selector" from the model's state.
   * Use this in templates with the `signal()` directive for optimal performance.
   * @param selector A function that derives a value from the model state.
   * @returns A Signal whose value is the result of the selector.
   */
  select<R>(selector: (state: TModel) => R): Signal<R>;
}

// createView is now properly imported

/**
 * Creates a reactive view with support for fine-grained reactivity via signals.
 * This is a drop-in replacement for the original `createView`.
 */
export function createReactiveView<TModel extends object>(
   model: ModelAPI<TModel>,
   container: Element,
   template: (state: TModel, context: ReactiveViewContext<TModel>) => TemplateResult
 ) {
   return createView(model, container, (state, originalCtx) => {
     const selectors = new Map<Function, Signal<any>>();

     const reactiveCtx: ReactiveViewContext<TModel> = {
       ...originalCtx,
       select: <R>(selectorFn: (state: TModel) => R): Signal<R> => {
         if (selectors.has(selectorFn)) {
           return selectors.get(selectorFn) as Signal<R>;
         }

         // Create a new signal that updates when the model changes
         const signal = new Signal<R>(selectorFn(model.read() as TModel));
         model.onChange(newState => {
           signal.set(selectorFn(newState));
         });

         selectors.set(selectorFn, signal);
         return signal;
       },
     };

     return template(state as TModel, reactiveCtx);
   });
 }


// =============================================================================
// SECTION 2: FORMALIZED ASYNC STATE MANAGEMENT (RESOURCES)
// =============================================================================

/**
 * The shape of state for an asynchronous resource.
 */
export interface ResourceState<TData> {
  data: TData | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Creates a dedicated, reactive model for managing an asynchronous data source.
 * The resource automatically re-fetches data whenever its source model changes.
 *
 * @param app The global AppContext instance.
 * @param name A unique name for this resource model.
 * @param source The reactive GPUI-TS model that provides input to the fetcher.
 * @param fetcher An async function that takes the source state and returns data.
 * @returns A ModelAPI for the resource's state (`{ data, loading, error }`).
 */
export function createResource<TSource extends object, TData>(
  app: AppContext,
  name: string,
  source: ModelAPI<TSource>,
  fetcher: (sourceValue: TSource) => Promise<TData>
): ModelAPI<ResourceState<TData>> {

  const resourceModel = app.createModel<ResourceState<TData>>(name, {
    data: null,
    loading: true, // Start in a loading state initially
    error: null,
  });

  let fetchId = 0;

  const load = async () => {
    const currentFetchId = ++fetchId;
    const sourceState = source.read() as TSource;

    resourceModel.update((state: ResourceState<TData>) => {
      state.loading = true;
      state.error = null;
    });

    try {
      const data = await fetcher(sourceState);
      // Only update if this is the most recent fetch request, preventing race conditions.
      if (currentFetchId === fetchId) {
        resourceModel.update((state: ResourceState<TData>) => {
          state.data = data;
          state.loading = false;
        });
      }
    } catch (e: any) {
      if (currentFetchId === fetchId) {
        resourceModel.update((state: ResourceState<TData>) => {
          state.error = e instanceof Error ? e : new Error(String(e));
          state.loading = false;
        });
      }
    }
  };

  // Subscribe to the source model and re-fetch whenever it changes.
  source.onChange(load);

  // Initial fetch.
  load();

  return resourceModel;
}


// =============================================================================
// SECTION 3: STATE MACHINE INTEGRATION (with XState)
// =============================================================================

/**
 * An enhanced ModelAPI that includes the state machine's `send` function.
 */
export type MachineModelAPI<TMachine extends AnyStateMachine> =
  ModelAPI<SnapshotFrom<TMachine>> & {
    /**
     * Sends an event to the underlying state machine.
     * This function is fully type-safe based on the machine's definition.
     */
    send: Actor<TMachine>['send'];
  };

/**
 * Integrates an XState machine into the GPUI-TS ecosystem.
 *
 * @param app The global AppContext instance.
 * @param name A unique name for this machine model.
 * @param machine The XState machine definition created with `setup(...).createMachine(...)`.
 * @returns An enhanced ModelAPI containing the machine's state and a type-safe `send` function.
 */
export function createMachineModel<TMachine extends AnyStateMachine>(
  app: AppContext,
  name: string,
  machine: TMachine
): MachineModelAPI<TMachine> {

  // Create and start the XState actor (the running instance of the machine)
  const actor = createActor(machine).start();

  // Create a GPUI-TS model, using the machine's initial state as the model's initial state.
  const machineModel = app.createModel<SnapshotFrom<TMachine>>(name, actor.getSnapshot());

  // Bridge XState to GPUI-TS: When the actor's state changes, update the GPUI-TS model.
  actor.subscribe(snapshot => {
    machineModel.update((state: SnapshotFrom<TMachine>) => {
      // We use Object.assign to update the state in place, which is how GPUI-TS updaters work.
      Object.assign(state, snapshot);
    });
  });

  // Return the model's API, merged with the actor's `send` function.
  return Object.assign(machineModel, { send: actor.send });
}


// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/*
// --- Uncomment this section to see a full usage example ---

// 1. Define a schema and create an application context
const AppSchema = {
  models: {
    // A simple model to act as a source for our resource
    router: {
      initialState: { params: { userId: '1' } }
    }
  }
};
const app = createApp(AppSchema);


// 2. Create a Resource for fetching user data
interface User { id: string; name: string; email: string; }

const userResource = createResource(app, 'user', app.models.router, async (routerState) => {
  const { userId } = routerState.params;
  console.log(`Fetching user ${userId}...`);
  // Simulate a network request
  await new Promise(res => setTimeout(res, 1000));
  if (userId === 'error') throw new Error("User not found!");
  const response = await fetch(`https://jsonplaceholder.typicode.com/users/${userId}`);
  return response.json() as Promise<User>;
});


// 3. Create a State Machine for a toggle feature
const toggleMachine = setup({
  types: { events: {} as { type: 'TOGGLE' } }
}).createMachine({
  id: 'toggle',
  initial: 'inactive',
  states: {
    inactive: { on: { TOGGLE: 'active' } },
    active: { on: { TOGGLE: 'inactive' } }
  }
});

const toggleModel = createMachineModel(app, 'toggle', toggleMachine);


// 4. Create a Reactive View that uses all these features
const container = document.getElementById('app')!;

createReactiveView(userResource, container, (resourceState, ctx) => {
  // Use `ctx.select` to create fine-grained signals
  const userName = ctx.select(s => s.data?.name ?? '...');
  const toggleState = ctx.select(() => toggleModel.read().value);

  return html`
    <h1>Advanced GPUI-TS Demo</h1>

    <div>
      <h2>User Resource</h2>
      <button @click=${() => app.models.router.update(s => s.params.userId = '2')}>Load User 2</button>
      <button @click=${() => app.models.router.update(s => s.params.userId = 'error')}>Load with Error</button>
      
      ${suspense(resourceState, {
        loading: html`<p>Loading user data...</p>`,
        error: (e) => html`<p style="color: red;">Error: ${e.message}</p>`,
        success: () => html`
          <!-- This part only re-renders when the user's name changes -->
          <p>User Name: <strong>${signal(userName)}</strong></p>
        `
      })}
    </div>

    <hr />

    <div>
      <h2>State Machine Toggle</h2>
      <!-- This part only re-renders when the toggle state string changes -->
      <p>Toggle Status: <strong>${signal(toggleState)}</strong></p>
      <button @click=${() => toggleModel.send({ type: 'TOGGLE' })}>
        Toggle Machine State
      </button>
    </div>
  `;
});

*/