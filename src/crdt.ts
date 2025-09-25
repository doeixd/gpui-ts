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

import { AppSchema, createModel, ModelAPI } from './gpui-ts-core';
import { useApp, GPUIApp } from './context';

// --- TYPE DEFINITIONS ---

/**
 * A serializable operation that describes a state change. This is the unit
 * of data that is shared between clients.
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
  };
}

/** A map of namespaced operation types to their pure reducer functions. */
type CRDTReducerMap<TState, TOps extends Record<string, any>> = {
  [K in keyof TOps as K extends string ? K : never]: (state: TState, payload: TOps[K]) => TState;
};

/**
 * The schema for a CRDT-enabled model. It defines the initial state and the
 * reducers that govern all possible state transitions.
 * @template TState The shape of the model's state.
 * @template TReducers The map of reducer functions, created with `defineReducers`.
 */
export interface CRDTSchema<TState, TReducers extends CRDTReducerMap<TState, any>> {
  initialState: TState;
  reducers: TReducers;
}

/** Extracts the operation payload types from a reducer map. */
type OpsFromReducers<TReducers> = {
  [K in keyof TReducers]: TReducers[K] extends (state: any, payload: infer P) => any ? P : undefined;
};

/**
 * An enhanced ModelAPI for a CRDT model with a fully type-safe `dispatch` method.
 * @template TState The shape of the model's state.
 * @template TReducers The map of reducer functions.
 */
export type CRDTModelAPI<TState, TReducers> =
  ModelAPI<TState> & {
    /**
     * Dispatches a local operation. This updates the local state immediately
     * and triggers the CRDTManager to broadcast the operation to other clients.
     * The `type` and `payload` are fully type-safe and inferred from the schema.
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
 * @param namespace A prefix for all operation types (e.g., 'todos').
 * @param reducers An object where keys are action names (e.g., 'add', 'toggle') and
 *        values are the corresponding pure reducer functions.
 * @returns A fully-formed reducer map with namespaced keys and inferred types.
 */
export function defineReducers<
  TState,
  const TReducers extends Record<string, (state: TState, payload?: any) => TState>
>(namespace: string, reducers: TReducers) {
  const namespacedReducers: any = {};
  for (const key in reducers) {
    if (Object.prototype.hasOwnProperty.call(reducers, key)) {
      namespacedReducers[`${namespace}:${key}`] = reducers[key];
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
 */
export class CRDTManager {
  readonly replicaId: string;
  private models = new Map<string, { apply: (op: Op) => void }>();
  private onBroadcastEmitter = new Set<(ops: Op[]) => void>();
  private app?: GPUIApp<any>;

  constructor() {
    this.replicaId = `replica_${Math.random().toString(36).substring(2, 9)}`;
  }

  /** @internal Used by `createApp` to link the manager to the app instance. */
  setApp(app: GPUIApp<any>) { this.app = app; }

  /** @internal Registers a model with the manager to handle its operations. */
  register(modelName: string, apply: (op: Op) => void, onOpGenerated: (cb: (op: Op) => void) => void) {
    this.models.set(modelName, { apply });
    onOpGenerated(op => {
      this.onBroadcastEmitter.forEach(cb => cb([op]));
    });
  }

  /** Receives an array of operations from a remote source (e.g., WebSocket) and applies them. */
  receive(ops: Op[]) {
    for (const op of ops) {
      if (op.meta.replicaId === this.replicaId) continue; // Ignore own ops
      const model = this.models.get(op.meta.modelName);
      if (model) {
        model.apply(op);
      } else {
        console.warn(`[CRDT] Received op for unregistered model "${op.meta.modelName}".`);
      }
    }
  }

  /** Subscribes to outgoing operations that need to be sent over the network. */
  onBroadcast(callback: (ops: Op[]) => void): () => void {
    this.onBroadcastEmitter.add(callback);
    return () => { this.onBroadcastEmitter.delete(callback) };
  }
}

// --- PURE FACTORY & ERGONOMIC HOOK ---

/**
 * The pure factory for creating a CRDT-enabled model.
 * This function is self-contained, testable, and can be used in any environment.
 *
 * @param app The GPUIApp instance, which contains the `crdt` manager.
 * @param modelName A unique name for the model.
 * @param schema The CRDT schema defining state and reducers.
 * @returns A `CRDTModelAPI` for interacting with the replicated state.
 */
export function createCRDTModel<
  TApp extends GPUIApp<any>,
  TState,
  const TReducers extends CRDTReducerMap<TState, any>
>(
  app: TApp,
  modelName: string,
  schema: CRDTSchema<TState, TReducers>
): CRDTModelAPI<TState, TReducers> {
  const opGeneratedCallbacks = new Set<(op: Op) => void>();
  const stateModel = createModel<TState>(app, modelName, schema.initialState);

  const dispatch = (type: string, ...payloadArg: any[]) => {
    const payload = payloadArg[0];
    const op: Op<string, any> = {
      type,
      payload,
      meta: {
        replicaId: app.crdt.replicaId,
        timestamp: Date.now(),
        modelName,
      },
    };
    apply(op);
    opGeneratedCallbacks.forEach(cb => cb(op));
  };

  const apply = (op: Op) => {
    const reducer = schema.reducers[op.type as keyof typeof schema.reducers];
    if (reducer) {
      stateModel.update(currentState => {
        const nextState = (reducer as any)(currentState, op.payload);
        // A robust way to update the state object in-place for the model.
        Object.keys(currentState as object).forEach(key => delete (currentState as any)[key]);
        Object.assign(currentState, nextState);
      });
    }
  };
  
  app.crdt.register(modelName, apply, cb => opGeneratedCallbacks.add(cb));

  return { ...stateModel, dispatch: dispatch as any };
}

/**
 * Ergonomic hook for creating a CRDT-enabled model.
 * Uses the active `unctx` context to get the application instance.
 *
 * @param modelName A unique name for the model.
 * @param schema The CRDT schema defining state and reducers.
 * @returns A `CRDTModelAPI` for interacting with the replicated state.
 */
export function useCRDTModel<
  TState,
  const TReducers extends CRDTReducerMap<TState, any>
>(
  modelName: string,
  schema: CRDTSchema<TState, TReducers>
): CRDTModelAPI<TState, TReducers> {
  const app = useApp();
  if (!app.crdt) {
    throw new Error('[GPUI-TS] CRDTManager not found on app instance. Ensure `createApp` is configured correctly.');
  }
  return createCRDTModel(app, modelName, schema);
}