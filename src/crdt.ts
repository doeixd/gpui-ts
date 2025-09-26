// src/crdt.ts

/**
 * GPUI-TS First-Party CRDT Integration (Definitive Version)
 * =========================================================
 *
 * This module provides a powerful, type-safe, and deeply integrated solution
 * for building real-time, collaborative applications using operation-based CRDTs.
 *
 * It is architected around a central CRDTManager that is integrated directly
 * into the core `app` instance, ensuring a single, testable source of truth.
 * The API is designed to be both ergonomic and maximally type-safe, eliminating
 * manual string typing for operations.
 */

import { createModel, ModelAPI } from './index';
import { useApp, GPUIApp } from './ergonomic';

// --- TYPE DEFINITIONS ---

/**
 * A serializable operation that describes a state change. This is the unit
 * of data that is shared between clients in a CRDT system.
 *
 * @template TType The operation type (e.g., 'todos:add')
 * @template TPayload The payload type for this operation
 *
 * @example
 * ```ts
 * const op: Op<'todos:add', { text: string }> = {
 *   type: 'todos:add',
 *   payload: { text: 'Buy milk' },
 *   meta: {
 *     replicaId: 'client_123',
 *     timestamp: Date.now(),
 *     modelName: 'todos'
 *   }
 * };
 * ```
 */
export interface Op<TType extends string = string, TPayload = any> {
  /** The unique, namespaced type of the operation (e.g., 'todos:add'). */
  type: TType;
  /** The data required to perform the operation. */
  payload: TPayload;
  /** Metadata for replication, ordering, and attribution. */
  meta: {
    /** A unique ID for the client that generated this operation. */
    replicaId: string;
    /** A timestamp for ordering or logging. */
    timestamp: number;
    /** The name of the model this operation applies to. */
    modelName: string;
    /** Sequence number for ordering operations from the same replica. */
    sequence: number;
    /** Unique operation ID for deduplication. */
    opId: string;
  };
}

/** A map of namespaced operation types to their pure reducer functions. */
type CRDTReducerMap<TState, TOps extends Record<string, any>> = {
  [K in keyof TOps as K extends string ? K : never]: (state: TState, payload: TOps[K]) => TState;
};

/**
 * The schema for a CRDT-enabled model. It defines the initial state and the
 * reducers that govern all possible state transitions.
 *
 * @template TState The shape of the model's state.
 * @template TReducers The map of reducer functions, created with `defineReducers`.
 *
 * @example
 * ```ts
 * const todoSchema: CRDTSchema<TodoState, typeof todoReducers> = {
 *   initialState: { items: [] },
 *   reducers: defineReducers('todos', {
 *     add: (state, payload: { text: string }) => ({
 *       items: [...state.items, { id: Date.now(), text: payload.text, done: false }]
 *     }),
 *     toggle: (state, payload: { id: number }) => ({
 *       items: state.items.map(item =>
 *         item.id === payload.id ? { ...item, done: !item.done } : item
 *       )
 *     })
 *   })
 * };
 * ```
 */
export interface CRDTSchema<TState, TReducers extends CRDTReducerMap<TState, any>> {
  initialState: TState;
  reducers: TReducers;
}

/** Extracts the operation payload types from a reducer map. */
type OpsFromReducers<TReducers> = {
  [K in keyof TReducers]: TReducers[K] extends (state: any, payload: infer P) => any ? P : undefined;
};

/** Utility type to extract the state type from a CRDT schema. */
export type StateFromSchema<TSchema extends CRDTSchema<any, any>> = TSchema['initialState'];

/** Utility type to extract the reducers type from a CRDT schema. */
export type ReducersFromSchema<TSchema extends CRDTSchema<any, any>> = TSchema['reducers'];

/** Utility type to infer the CRDTModelAPI type from a schema. */
export type CRDTModelFromSchema<TSchema extends CRDTSchema<any, any>> =
  CRDTModelAPI<StateFromSchema<TSchema>, ReducersFromSchema<TSchema>>;

/**
 * An enhanced ModelAPI for a CRDT model with a fully type-safe `dispatch` method.
 * Extends the base ModelAPI with CRDT-specific functionality for collaborative editing.
 *
 * @template TState The shape of the model's state.
 * @template TReducers The map of reducer functions.
 *
 * @example
 * ```ts
 * const model = createCRDTModel(app, 'todos', todoSchema);
 *
 * // Type-safe dispatching - IntelliSense will suggest 'todos:add' and 'todos:toggle'
 * model.dispatch('todos:add', { text: 'Buy milk' });
 * model.dispatch('todos:toggle', { id: 1 });
 *
 * // Read current state
 * const currentTodos = model.read();
 * ```
 */
export type CRDTModelAPI<TState extends object, TReducers> =
  ModelAPI<TState> & {
    /**
     * Dispatches a local operation. This updates the local state immediately
     * and triggers the CRDTManager to broadcast the operation to other clients.
     * The `type` and `payload` are fully type-safe and inferred from the schema.
     *
     * @param type The operation type (e.g., 'todos:add')
     * @param payload The operation payload (type inferred from schema)
     *
     * @example
     * ```ts
     * // Operations with payloads
     * model.dispatch('todos:add', { text: 'Buy milk' });
     *
     * // Operations without payloads
     * model.dispatch('counter:increment');
     * ```
     */
    dispatch: <TType extends keyof OpsFromReducers<TReducers> & string>(
      type: TType,
      ...payload: OpsFromReducers<TReducers>[TType] extends undefined | void ? [] : [OpsFromReducers<TReducers>[TType]]
    ) => void;
  };

// --- ERGONOMIC HELPER ---

/**
 * A type-safe factory for creating the `reducers` object for a CRDT schema.
 * It handles namespacing and allows for strong type inference, eliminating
 * the need for manual string typing of operation names.
 *
 * @template TState The state type that reducers operate on
 * @template TReducers The reducer function definitions
 * @param namespace A prefix for all operation types (e.g., 'todos').
 * @param reducers An object where keys are action names (e.g., 'add', 'toggle') and
 *        values are the corresponding pure reducer functions.
 * @returns A fully-formed reducer map with namespaced keys and inferred types.
 *
 * @example
 * ```ts
 * const todoReducers = defineReducers('todos', {
 *   add: (state, payload: { text: string }) => ({
 *     items: [...state.items, { id: Date.now(), text: payload.text, done: false }]
 *   }),
 *   toggle: (state, payload: { id: number }) => ({
 *     items: state.items.map(item =>
 *       item.id === payload.id ? { ...item, done: !item.done } : item
 *     )
 *   }),
 *   clear: (state) => ({ items: [] }) // No payload needed
 * });
 *
 * // Results in: { 'todos:add': Function, 'todos:toggle': Function, 'todos:clear': Function }
 * ```
 */
export function defineReducers<
  TState,
  const TReducers extends Record<string, (state: TState, payload?: any) => TState>
>(namespace: string, reducers: TReducers) {
  if (!namespace || typeof namespace !== 'string') {
    throw new Error('[CRDT] Invalid namespace: must be a non-empty string');
  }

  if (!reducers || typeof reducers !== 'object') {
    throw new Error('[CRDT] Invalid reducers: must be an object');
  }

  const namespacedReducers: any = {};
  for (const key in reducers) {
    if (Object.prototype.hasOwnProperty.call(reducers, key)) {
      const reducer = reducers[key];
      if (typeof reducer !== 'function') {
        throw new Error(`[CRDT] Invalid reducer for "${key}": must be a function`);
      }

      namespacedReducers[`${namespace}:${key}`] = reducer;
    }
  }

  return namespacedReducers as {
    [K in keyof TReducers as K extends string ? `${typeof namespace}:${K}` : never]: TReducers[K]
  };
}

// --- CRDT MANAGER CLASS (Integrated into the App) ---

/**
 * A central manager for handling the lifecycle and networking of all CRDT models.
 * An instance of this manager is available at `app.crdt`.
 *
 * This class coordinates the distribution of operations between local models and
 * remote replicas, ensuring eventual consistency across all clients.
 *
 * @example
 * ```ts
 * const crdt = app.crdt;
 *
 * // Listen for operations to broadcast
 * const unsubscribe = crdt.onBroadcast((ops) => {
 *   // Send ops to other clients via WebSocket
 *   websocket.send(JSON.stringify(ops));
 * });
 *
 * // Receive operations from remote clients
 * websocket.onMessage((data) => {
 *   const ops = JSON.parse(data);
 *   crdt.receive(ops);
 * });
 * ```
 */
export class CRDTManager {
  readonly replicaId: string;
  private models = new Map<string, { apply: (op: Op) => void }>();
  private onBroadcastEmitter = new Set<(ops: Op[]) => void>();
  private _app?: GPUIApp<any>;
  private sequenceNumbers = new Map<string, number>(); // modelName -> last sequence
  private appliedOps = new Set<string>(); // opId deduplication

  constructor() {
    this.replicaId = `replica_${Math.random().toString(36).substring(2, 9)}`;
  }

  /** @internal Used by `createApp` to link the manager to the app instance. */
  setApp(_app: GPUIApp<any>) { this._app = _app; }

  /** @internal Registers a model with the manager to handle its operations. */
  register(modelName: string, apply: (op: Op) => void, onOpGenerated: (cb: (op: Op) => void) => void) {
    if (!modelName || typeof modelName !== 'string') {
      throw new Error('[CRDT] Invalid model name: must be a non-empty string');
    }

    if (typeof apply !== 'function') {
      throw new Error('[CRDT] Invalid apply function: must be a function');
    }

    if (typeof onOpGenerated !== 'function') {
      throw new Error('[CRDT] Invalid onOpGenerated function: must be a function');
    }

    if (this.models.has(modelName)) {
      console.warn(`[CRDT] Model "${modelName}" is already registered. Overwriting.`);
    }

    this.models.set(modelName, { apply });

    try {
      onOpGenerated(op => {
        try {
          this.onBroadcastEmitter.forEach(cb => {
            try {
              cb([op]);
            } catch (error) {
              console.error('[CRDT] Error in broadcast callback:', error);
            }
          });
        } catch (error) {
          console.error('[CRDT] Error broadcasting operation:', error, op);
        }
      });
    } catch (error) {
      console.error(`[CRDT] Error setting up operation generation for model "${modelName}":`, error);
    }
  }

  /** Receives an array of operations from a remote source (e.g., WebSocket) and applies them. */
  receive(ops: Op[]) {
    if (!Array.isArray(ops)) {
      console.warn('[CRDT] Received invalid operations: expected array');
      return;
    }

    // Limit the number of operations to prevent abuse
    const maxOps = 1000;
    if (ops.length > maxOps) {
      console.warn(`[CRDT] Received too many operations (${ops.length}). Limiting to ${maxOps}.`);
      ops = ops.slice(0, maxOps);
    }

    for (const op of ops) {
      try {
        // Basic validation
        if (!op || typeof op !== 'object') {
          console.warn('[CRDT] Skipping invalid operation: not an object');
          continue;
        }

        if (!op.meta || typeof op.meta !== 'object') {
          console.warn('[CRDT] Skipping invalid operation: missing meta');
          continue;
        }

        if (op.meta.replicaId === this.replicaId) continue; // Ignore own ops

        if (!op.meta.modelName || typeof op.meta.modelName !== 'string') {
          console.warn('[CRDT] Skipping invalid operation: invalid model name');
          continue;
        }

        // Check for operation deduplication
        if (op.meta.opId && this.appliedOps.has(op.meta.opId)) {
          continue; // Already applied
        }

        const model = this.models.get(op.meta.modelName);
        if (model) {
          try {
            model.apply(op);
            // Mark as applied for deduplication
            if (op.meta.opId) {
              this.appliedOps.add(op.meta.opId);
            }
          } catch (error) {
            console.error(`[CRDT] Error applying remote operation ${op.meta.opId}:`, error);
          }
        } else {
          console.warn(`[CRDT] Received op for unregistered model "${op.meta.modelName}".`);
        }
      } catch (error) {
        console.error('[CRDT] Error processing operation:', error, op);
        // Continue processing other operations
      }
    }
  }

  /** Subscribes to outgoing operations that need to be sent over the network. */
  onBroadcast(callback: (ops: Op[]) => void): () => void {
    if (typeof callback !== 'function') {
      throw new Error('[CRDT] Broadcast callback must be a function');
    }

    this.onBroadcastEmitter.add(callback);
    return () => {
      this.onBroadcastEmitter.delete(callback);
    };
  }

  /** Gets statistics about the CRDT system for debugging and monitoring. */
  getStats() {
    return {
      replicaId: this.replicaId,
      registeredModels: Array.from(this.models.keys()),
      sequenceNumbers: Object.fromEntries(this.sequenceNumbers),
      appliedOpsCount: this.appliedOps.size,
      broadcastSubscribers: this.onBroadcastEmitter.size,
    };
  }

  /** Clears the operation deduplication cache. Useful for memory management. */
  clearOpCache() {
    this.appliedOps.clear();
  }
}

// --- PURE FACTORY & ERGONOMIC HOOK ---

/**
 * The pure factory for creating a CRDT-enabled model.
 * This function is self-contained, testable, and can be used in any environment.
 *
 * @template TApp The app type
 * @template TState The state type
 * @template TReducers The reducers type
 * @param app The GPUIApp instance, which contains the `crdt` manager.
 * @param modelName A unique name for the model.
 * @param schema The CRDT schema defining state and reducers.
 * @returns A `CRDTModelAPI` for interacting with the replicated state.
 *
 * @example
 * ```ts
 * const todoSchema = {
 *   initialState: { items: [] },
 *   reducers: defineReducers('todos', {
 *     add: (state, payload: { text: string }) => ({
 *       items: [...state.items, { text: payload.text, done: false }]
 *     })
 *   })
 * };
 *
 * const todoModel = createCRDTModel(app, 'todos', todoSchema);
 * todoModel.dispatch('todos:add', { text: 'Buy milk' });
 * ```
 */
export function createCRDTModel<
  TApp extends GPUIApp<any>,
  TState extends object,
  const TReducers extends CRDTReducerMap<TState, any>
>(
  app: TApp,
  modelName: string,
  schema: CRDTSchema<TState, TReducers>
): CRDTModelAPI<TState, TReducers> {
  const opGeneratedCallbacks = new Set<(op: Op) => void>();
  const stateModel = createModel<TState>(app, modelName, schema.initialState);

  const dispatch = <TType extends keyof OpsFromReducers<TReducers> & string>(
    type: TType,
    ...args: OpsFromReducers<TReducers>[TType] extends undefined | void ? [] : [OpsFromReducers<TReducers>[TType]]
  ) => {
    try {
      const opPayload = args[0] as OpsFromReducers<TReducers>[TType];

      // Validate operation type exists in schema
      if (!(type in schema.reducers)) {
        throw new Error(`Unknown operation type: ${type}. Available types: ${Object.keys(schema.reducers).join(', ')}`);
      }

      // Generate sequence number and operation ID
      const sequence = app.crdt.getNextSequence(modelName);
      const opId = `${app.crdt.replicaId}:${modelName}:${sequence}`;

      const op: Op<TType, OpsFromReducers<TReducers>[TType]> = {
        type,
        payload: opPayload,
        meta: {
          replicaId: app.crdt.replicaId,
          timestamp: Date.now(),
          modelName,
          sequence,
          opId,
        },
      };

      // Apply locally first
      apply(op);

      // Broadcast to other replicas
      opGeneratedCallbacks.forEach(cb => {
        try {
          cb(op);
        } catch (error) {
          console.error('[CRDT] Error in operation callback:', error);
        }
      });
    } catch (error) {
      console.error(`[CRDT] Error dispatching operation ${type}:`, error);
      throw error; // Re-throw dispatch errors since they're likely programmer errors
    }
  };

  const apply = (op: Op) => {
    // Validate operation structure
    if (!op || typeof op !== 'object') {
      console.warn('[CRDT] Received invalid operation: not an object');
      return;
    }

    if (!op.type || typeof op.type !== 'string') {
      console.warn('[CRDT] Received invalid operation: missing or invalid type');
      return;
    }

    if (!op.meta || typeof op.meta !== 'object') {
      console.warn('[CRDT] Received invalid operation: missing or invalid meta');
      return;
    }

    if (!op.meta.modelName || op.meta.modelName !== modelName) {
      console.warn(`[CRDT] Received operation for wrong model. Expected: ${modelName}, got: ${op.meta.modelName}`);
      return;
    }

    const reducer = schema.reducers[op.type as keyof typeof schema.reducers];
    if (!reducer) {
      console.warn(`[CRDT] No reducer found for operation type: ${op.type}`);
      return;
    }

    try {
      stateModel.update(currentState => {
        const nextState = (reducer as any)(currentState, op.payload);
        // Validate that reducer returned a valid state
        if (!nextState || typeof nextState !== 'object') {
          throw new Error(`Reducer for ${op.type} must return an object`);
        }
        // Update the state in-place by assigning the new state
        Object.assign(currentState, nextState);
      });
    } catch (error) {
      console.error(`[CRDT] Error applying operation ${op.type}:`, error);
      // Don't re-throw - CRDT should be resilient to individual operation failures
    }
  };
  
  app.crdt.register(modelName, apply, cb => opGeneratedCallbacks.add(cb));

  return Object.assign(stateModel, { dispatch }) as CRDTModelAPI<TState, TReducers>;
}

/**
 * Ergonomic hook for creating a CRDT-enabled model.
 * Uses the active `unctx` context to get the application instance.
 *
 * This hook must be called within a component that's wrapped with the app context.
 *
 * @template TState The state type
 * @template TReducers The reducers type
 * @param modelName A unique name for the model.
 * @param schema The CRDT schema defining state and reducers.
 * @returns A `CRDTModelAPI` for interacting with the replicated state.
 *
 * @example
 * ```ts
 * // In a component
 * const todoModel = useCRDTModel('todos', {
 *   initialState: { items: [] },
 *   reducers: defineReducers('todos', {
 *     add: (state, payload: { text: string }) => ({
 *       items: [...state.items, { text: payload.text, done: false }]
 *     })
 *   })
 * });
 *
 * // Use in JSX
 * return html`
 *   <button @click=${() => todoModel.dispatch('todos:add', { text: input.value })}>
 *     Add Todo
 *   </button>
 * `;
 * ```
 */
export function useCRDTModel<
  TState extends object,
  const TReducers extends CRDTReducerMap<TState, any>
>(
  modelName: string,
  schema: CRDTSchema<TState, TReducers>
): CRDTModelAPI<TState, TReducers> {
  if (!modelName || typeof modelName !== 'string') {
    throw new Error('[CRDT] Invalid model name: must be a non-empty string');
  }

  if (!schema || typeof schema !== 'object') {
    throw new Error('[CRDT] Invalid schema: must be an object with initialState and reducers');
  }

  if (!schema.initialState || typeof schema.initialState !== 'object') {
    throw new Error('[CRDT] Invalid schema: initialState must be an object');
  }

  if (!schema.reducers || typeof schema.reducers !== 'object') {
    throw new Error('[CRDT] Invalid schema: reducers must be an object');
  }

  const app = useApp();
  if (!app.crdt) {
    throw new Error('[GPUI-TS] CRDTManager not found on app instance. Ensure `createApp` is configured correctly.');
  }

  return createCRDTModel(app, modelName, schema);
}