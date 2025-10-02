/**
 * GPUI-TS: Complete Reactive State Management Framework
 * ===================================================
 * 
 * A production-ready, type-safe reactive framework inspired by Swift's GPUI
 * and solid-events. Features:
 * 
 * - Centralized model ownership with queued effects
 * - Functional reactive event composition
 * - Advanced type inference and path manipulation
 * - Lens system for composable updates
 * - Transaction support with rollback
 * - Time travel debugging
 * - Comprehensive validation
 * - Performance monitoring
 * - Schema-driven development
 * 
 * @version 1.0.0
 * @author GPUI-TS Team
 * @license MIT
 */

// =============================================================================
// CORE TYPES AND BRANDS
// =============================================================================

const __eventBrand = Symbol('__eventBrand')
const __haltBrand = Symbol('__haltBrand')



/**
 * Deep readonly type for immutable state.
 */
type DeepReadonly<T> = T extends (infer R)[] ? ReadonlyArray<DeepReadonly<R>> :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T



/**
 * Nominal typing for stronger type safety.
 */

type ModelId<T> = string & { readonly __modelBrand: T }
















/**
 * Branded type for event identifiers.
 * @template TName The event name type.
 */
type EventId<TName extends string> = string & {
  readonly [__eventBrand]: TName
}

/**
 * Enhanced event definition with discriminated unions.
 */
interface EventDefinition<TName extends string, TPayload> {
  readonly eventId: EventId<TName>
  readonly name: TName
  readonly defaultPayload: TPayload

  // Transform into handler
  <TOutput>(transform: (payload: TPayload) => TOutput | HaltSignal): EventHandler<TPayload, TOutput>

  // Direct operations
  subscribe(callback: (payload: TPayload) => void): () => void
  emit(payload: TPayload): void
  once(callback: (payload: TPayload) => void): () => void
  debounce(ms: number): EventHandler<TPayload, TPayload>
  throttle(ms: number): EventHandler<TPayload, TPayload>
}
type HaltSignal = { readonly [__haltBrand]: true }

const HALT: HaltSignal = { [__haltBrand]: true } as const

/**
 * Halts event propagation in transformation chains
 * Returns never for proper type inference
 */
function halt(): never {
  throw HALT
}

// =============================================================================
// PATH MANIPULATION TYPES
// =============================================================================

/**
 * Generate all possible paths through an object type
 * Supports nested objects and arrays with type-safe access
 */
type PathImpl<T, K extends keyof T> = K extends string
  ? T[K] extends Record<string, any>
    ? T[K] extends ArrayLike<any>
      ? K | `${K}.${PathImpl<T[K], Exclude<keyof T[K], keyof any[]>>}`
      : K | `${K}.${PathImpl<T[K], keyof T[K]>}`
    : K
  : never

type Path<T> = PathImpl<T, keyof T> | keyof T

/**
 * Get the type of a value at a specific path
 */
type PathValue<T, P extends Path<T>> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? Rest extends Path<T[K]>
      ? PathValue<T[K], Rest>
      : never
    : never
  : P extends keyof T
    ? T[P]
    : never

// =============================================================================
// REDUCER SYSTEM FOR ACTION-BASED STATE MANAGEMENT
// =============================================================================

/**
 * A reducer function that takes state and an action, returning new state.
 * @template T The state type.
 * @template TAction The action type.
 */
type Reducer<T, TAction> = (state: T, action: TAction) => T

/**
 * Action interface with required type property.
 */
interface Action {
  type: string
  [key: string]: any
}

/**
 * Configuration for creating a reducer-based model.
 * @template T The state type.
 * @template TAction The action type.
 */
interface ReducerModelConfig<T extends object, TAction extends Action> {
  initialState: T
  reducer: Reducer<T, TAction>
  middleware?: {
    beforeAction?: (state: T, action: TAction) => boolean | TAction
    afterAction?: (state: T, prevState: T, action: TAction, ctx: ModelContext<T>) => void
  }
  constraints?: {
    readonly?: (keyof T)[]
    required?: (keyof T)[]
    validate?: (state: T) => string[] | null
  }
}

/**
 * Creates a type-safe reducer from action type to reducer function mappings.
 * Provides compile-time safety for action types and their payloads.
 *
 * @template T The state type.
 * @template TAction The action union type.
 * @param initialState The initial state value.
 * @param reducers Object mapping action types to their reducer functions.
 * @returns A reducer function that handles all specified actions.
 *
 * @example
 * ```ts
 * type CounterAction = 
 *   | { type: 'increment'; payload?: number }
 *   | { type: 'decrement'; payload?: number }
 *   | { type: 'reset' }
 *
 * const counterReducer = createReducer(
 *   { count: 0 },
 *   {
 *     increment: (state, action) => ({ 
 *       count: state.count + (action.payload ?? 1) 
 *     }),
 *     decrement: (state, action) => ({ 
 *       count: state.count - (action.payload ?? 1) 
 *     }),
 *     reset: () => ({ count: 0 })
 *   }
 * )
 * ```
 */
function createReducer<T extends object, TAction extends Action>(
  _initialState: T,
  reducers: {
    [K in TAction['type']]: Reducer<T, Extract<TAction, { type: K }>>
  }
): Reducer<T, TAction> {
  return (state: T, action: TAction): T => {
    const reducer = reducers[action.type as TAction['type']]
    return reducer ? reducer(state, action as Extract<TAction, { type: TAction['type'] }>) : state
  }
}

/**
 * Creates a model with reducer-based state management.
 * Actions are dispatched through the model API with full type safety.
 *
 * @template T The state type.
 * @template TAction The action type.
 * @template TName The model name type.
 * @param name The name of the model.
 * @param config The reducer model configuration.
 * @param registry The model registry.
 * @returns A ModelAPI with dispatch capabilities.
 *
 * @example
 * ```ts
 * type TodoAction =
 *   | { type: 'add'; payload: { text: string } }
 *   | { type: 'toggle'; payload: { id: string } }
 *   | { type: 'remove'; payload: { id: string } }
 *
 * const todoModel = createReducerModel('todos', {
 *   initialState: { items: [] },
 *   reducer: createReducer(
 *     { items: [] },
 *     {
 *       add: (state, action) => ({ 
 *         items: [...state.items, { id: Date.now().toString(), text: action.payload.text, completed: false }] 
 *       }),
 *       toggle: (state, action) => ({
 *         items: state.items.map(item => 
 *           item.id === action.payload.id ? { ...item, completed: !item.completed } : item
 *         )
 *       }),
 *       remove: (state, action) => ({
 *         items: state.items.filter(item => item.id !== action.payload.id)
 *       })
 *     }
 *   )
 * }, registry)
 * ```
 */
function createReducerModel<T extends object, TAction extends Action, TName extends string>(
  name: TName,
  config: ReducerModelConfig<T, TAction>,
  registry: ModelRegistry
): ModelAPI<T, TName> & { dispatch: (action: TAction) => void } {
  const baseModel = createModelAPI(name, {
    initialState: config.initialState,
    constraints: config.constraints
  }, registry)

  /**
   * Dispatches an action through the reducer to update the model state.
   * @param action The action to dispatch.
   */
  const dispatch = (action: TAction) => {
    baseModel.update((state, ctx) => {
      // Apply middleware before action
      let processedAction = action
      if (config.middleware?.beforeAction) {
        const result = config.middleware.beforeAction(state, action)
        if (result === false) return // Cancel the action
        if (typeof result === 'object') {
          processedAction = result
        }
      }

      // Apply reducer
      const previousState = structuredClone(state)
      const newState = config.reducer(state, processedAction)
      
      // Update state in place
      Object.assign(state, newState)
      
      // Apply middleware after action
      if (config.middleware?.afterAction) {
        config.middleware.afterAction(state, previousState, processedAction, ctx)
      }
      
      // Auto-notify for reducer updates
      ctx.notify()
    })
  }

  // Create enhanced model that preserves ModelAPI methods
  return Object.assign(baseModel, { dispatch }) as ModelAPI<T, TName> & { dispatch: (action: TAction) => void }
}

// =============================================================================
// LENS SYSTEM FOR COMPOSABLE UPDATES
// =============================================================================

/**
 * A lens provides composable, immutable access to nested data structures.
 * Enables functional updates and traversals with full type safety.
 *
 * @template TRoot The root data structure type.
 * @template TFocus The focused value type.
 */
interface Lens<TRoot extends object, TFocus> {
  /** Get the focused value from the root. */
  get(root: TRoot): TFocus | undefined

  /** Set a new value at the focus, returning updated root. */
  set(root: TRoot, value: TFocus | undefined): TRoot

  /** Update the focused value using a function, returning updated root. */
  update(root: TRoot, updater: (focus: TFocus | undefined) => TFocus | undefined): TRoot

  /** Compose with another lens to focus deeper. */
  compose<TNext>(nextLens: Lens<any, TNext>): Lens<TRoot, TNext>

  /** Focus on a property of the current focus. */
  at<TKey extends keyof TFocus>(key: TKey): Lens<TRoot, TFocus[TKey]>

  /** Focus on an array element. */
  index(index: number): Lens<TRoot, any>

  /** Filter array elements. */
  filter(predicate: (item: any) => boolean): Lens<TRoot, any>

  /** Find the first element matching predicate. */
  find(predicate: (item: any) => boolean): Lens<TRoot, any>

  /** Map array elements with a transform function. */
  map<TOut>(transform: (item: any) => TOut): Lens<TRoot, TOut[]>

  /** Check if some elements match predicate. */
  some(predicate: (item: any) => boolean): Lens<TRoot, boolean>

  /** Check if every element matches predicate. */
  every(predicate: (item: any) => boolean): Lens<TRoot, boolean>

  /** Reduce array to a single value. */
  reduce<TAcc>(reducer: (acc: TAcc, item: any) => TAcc, initial: TAcc): Lens<TRoot, TAcc>
}

/**
 * Create a lens with getter and setter functions.
 *
 * @param getter Function to extract the focused value from the root.
 * @param setter Function to create a new root with the focused value updated.
 * @returns A lens for composable data access.
 *
 * @example
 * ```ts
 * const nameLens = lens(
 *   (user: User) => user.name,
 *   (user: User, name: string) => ({ ...user, name })
 * );
 * ```
 */
function lens<TRoot extends object, TFocus>(
  getter: (root: TRoot) => TFocus | undefined,
  setter: (root: TRoot, value: TFocus | undefined) => TRoot
): Lens<TRoot, TFocus> {
  const l: Lens<TRoot, TFocus> = {
    get: getter,
    set: setter,
    update: (root, updater) => setter(root, updater(getter(root))),

    compose: <TNext>(nextLens: Lens<any, TNext>) =>
      lens<TRoot, TNext>(
        (root) => {
          const intermediate = getter(root)
          if (intermediate === undefined || intermediate === null) return undefined
          return nextLens.get(intermediate as any)
        },
        (root, value) => {
          const intermediate = getter(root)
          if (intermediate === undefined || intermediate === null) return root
          return setter(root, nextLens.set(intermediate as any, value))
        }
      ),

      at: <TKey extends keyof TFocus>(key: TKey) =>
        lens<TRoot, TFocus[TKey]>(
           (root) => {
             const obj = getter(root) as any
             if (!obj || typeof obj !== 'object') return undefined
             return obj[key]
           },
           (root, value) => {
             try {
               const current = getter(root) as any
               if (!current || typeof current !== 'object') return root
               return setter(root, { ...current, [key]: value })
             } catch {
               return root
             }
           }
         ),

      index: (index: number) =>
        lens<TRoot, any>(
           (root) => {
             try {
               const arr = getter(root) as any
               if (!arr || !Array.isArray(arr) || arr.length <= index) return undefined
               return arr[index]
             } catch {
               return undefined
             }
           },
          (root, value) => {
             try {
               const current = getter(root) as any
               if (!current || !Array.isArray(current)) return root
               const updated = [...current]
               updated[index] = value
               return setter(root, updated as any)
             } catch {
               return root
             }
           }
        ),

     filter: (predicate: any) =>
       lens<TRoot, any>(
          (root) => {
            try {
              const arr = getter(root) as any
              if (!arr || !Array.isArray(arr)) return undefined
              return arr.filter(predicate)
            } catch {
              return undefined
            }
          },
          (root, value) => {
            try {
              const current = getter(root) as any
              if (!current || !Array.isArray(current)) return root
              // For filter, setting replaces the filtered items with the new values
              // Assumes value.length === filtered.length and predicate doesn't change
              let valueIndex = 0
              const updated = current.map((item: any) => {
                if (predicate(item)) {
                  return value[valueIndex++] || item
                }
                return item
              })
              return setter(root, updated as any)
            } catch {
              return root
            }
          }
       ),

     find: (predicate: any) =>
       lens<TRoot, any>(
          (root) => {
            try {
              const arr = getter(root) as any
              if (!arr || !Array.isArray(arr)) return undefined
              return arr.find(predicate)
            } catch {
              return undefined
            }
          },
          (root, value) => {
            try {
              const current = getter(root) as any
              if (!current || !Array.isArray(current)) return root
              const index = current.findIndex(predicate)
              if (index >= 0) {
                const updated = [...current]
                updated[index] = value
                return setter(root, updated as any)
              } else {
                // If not found, append to the end
                return setter(root, [...current, value] as any)
              }
            } catch {
              return root
            }
          }
       ),

       map: <TOut>(transform: (item: any) => TOut) =>
         lens<TRoot, TOut[]>(
            (root) => {
              try {
                const arr = getter(root) as any
                if (!arr || !Array.isArray(arr)) return []
                return arr.map(transform)
              } catch {
                return []
              }
            },
           (root) => {
             // Setting back mapped values is complex without inverse transform
             // For now, return unchanged root
             return root
           }
         ),

      some: (predicate: any) =>
        lens<TRoot, boolean>(
          (root) => {
            try {
              const arr = getter(root) as any
              if (!arr || !Array.isArray(arr)) return false
              return arr.some(predicate)
            } catch {
              return false
            }
          },
          (root) => {
            // Setting a boolean back is not straightforward
            // Return unchanged root
            return root
          }
        ),

      every: (predicate: any) =>
        lens<TRoot, boolean>(
          (root) => {
            try {
              const arr = getter(root) as any
              if (!arr || !Array.isArray(arr)) return true
              return arr.every(predicate)
            } catch {
              return true
            }
          },
          (root) => {
            // Setting a boolean back is not straightforward
            // Return unchanged root
            return root
          }
        ),

      reduce: <TAcc>(reducer: (acc: TAcc, item: any) => TAcc, initial: TAcc) =>
        lens<TRoot, TAcc>(
           (root) => {
             try {
               const arr = getter(root) as any
               if (!arr || !Array.isArray(arr)) return initial
               return arr.reduce(reducer, initial)
             } catch {
               return initial
             }
           },
          (root) => {
            // Reducing is not invertible
            // Return unchanged root
            return root
          }
        )
  }

  return l
}

// =============================================================================
// MODEL SCHEMA AND VALIDATION
// =============================================================================

/**
 * Validation error with path information
 */
interface ValidationError<T> {
  path: Path<T> | ''
  message: string
  code: string
}

/**
 * Result of model validation
 */
interface ValidationResult<T> {
  valid: boolean
  errors: ValidationError<T>[]
}

/**
 * Comprehensive model schema definition
 */
interface ModelSchema<T extends object> {
  initialState: T
  constraints?: {
    readonly?: (keyof T)[]
    required?: (keyof T)[]
    validate?: (state: T) => string[] | null
  }
  computed?: {
    [K in string]: (state: T) => any
  }
  effects?: {
    [K in string]: (state: T, prev: T, ctx: ModelContext<T>) => void
  }
  middleware?: {
    beforeUpdate?: (state: T, updater: any) => boolean | T
    afterUpdate?: (state: T, prev: T, ctx: ModelContext<T>) => void
  }
  schema?: any
}

// =============================================================================
// EVENT SYSTEM WITH SOLID-EVENTS COMPOSITION
// =============================================================================

/**
 * Event handler supporting transformation chains
 */
interface EventHandler<TInput, TOutput = TInput> {
  // Transform and chain
  <TNext>(transform: (output: TOutput) => TNext | HaltSignal): EventHandler<TInput, TNext>
  
  // Terminal operations
  subscribe(callback: (output: TOutput) => void): () => void
  
  // Utility transformations
  filter(predicate: (output: TOutput) => boolean): EventHandler<TInput, TOutput>
  map<TNext>(transform: (output: TOutput) => TNext): EventHandler<TInput, TNext>
  debounce(ms: number): EventHandler<TInput, TOutput>
  throttle(ms: number): EventHandler<TInput, TOutput>
  
  // Subject integration
  toSubject(initialValue: TOutput): Subject<TOutput>
  
  readonly __isEventHandler: true
}

/**
 * Event definition with composition capabilities
 */
interface EventDefinition<TName extends string, TPayload> {
  readonly eventId: EventId<TName>
  readonly name: TName
  readonly defaultPayload: TPayload
  
  // Transform into handler
  <TOutput>(transform: (payload: TPayload) => TOutput | HaltSignal): EventHandler<TPayload, TOutput>
  
  // Direct operations
  subscribe(callback: (payload: TPayload) => void): () => void
  emit(payload?: TPayload): void
  
  // Utility methods
  filter(predicate: (payload: TPayload) => boolean): EventDefinition<TName, TPayload>
  map<TOutput>(transform: (payload: TPayload) => TOutput): EventDefinition<TName, TOutput>
  debounce(ms: number): EventDefinition<TName, TPayload>
  throttle(ms: number): EventDefinition<TName, TPayload>
}

/**
 * Subject for reactive state management
 */
interface Subject<T> {
  (): T
  set(value: T): void

  // React to events
  on<TEventPayload>(
    event: EventDefinition<any, TEventPayload> | EventHandler<any, TEventPayload>,
    reaction: (payload: TEventPayload) => T | ((current: T) => T)
  ): Subject<T>

  // Derive new subjects
  derive<TDerived>(compute: (value: T) => TDerived): Subject<TDerived>

  // Subscribe to changes
  subscribe(callback: () => void): () => void

  readonly __isSubject: true
}

// =============================================================================
// MODEL CONTEXT WITH RICH CAPABILITIES
// =============================================================================

/**
 * Context API provided during model updates, enabling reactive operations.
 * All methods are type-safe and operate on the current model state.
 *
 * @template T The model state type.
 */
interface ModelContext<T extends object> {
  /** Read the current deeply immutable state. */
  read(): DeepReadonly<T>

  /** Trigger change notifications to subscribers. */
  notify(): void

  /** Emit an event from this model. */
  emit<E>(event: E): void

  /** Perform an atomic state update with optional notification control. */
  updateWith(
    updater: (state: T) => T,
    options?: {
      shouldNotify?: boolean
      shouldEmit?: boolean
      eventPayload?: any
    }
  ): T

  /** Batch multiple operations without intermediate notifications. */
  batch(operations: () => void): void

  /** Register side effects that run when state changes. */
  effect(
    effect: (state: T, cleanup: (fn: () => void) => void) => void | (() => void)
  ): void

  /** Schedule async operations with optional debouncing/throttling. */
  schedule(
    operation: (state: T) => Promise<void>,
    options?: { debounce?: number; throttle?: number }
  ): Promise<void>

   /** Create a focused context for nested state updates. */
   focus<TFocus extends object>(lens: Lens<T, TFocus>): ModelContext<TFocus>

  /** Execute operations in a transaction with automatic rollback on error. */
  transaction<TResult>(work: () => TResult): TResult

   // Context methods
   notify(): void
   batch(operations: () => void): void
   effect(effect: (state: T, cleanup: (fn: () => void) => void) => void | (() => void)): void
   schedule(operation: (state: T) => Promise<void>, options?: { debounce?: number; throttle?: number }): Promise<void>

   /** Schedule async operations with debouncing/throttling and cancellation. */
  scheduleAsync(
    operation: (state: T) => Promise<Partial<T>>,
    options?: {
      debounce?: number
      throttle?: number
      signal?: AbortSignal
    }
  ): Promise<void>

  /** Register async side effects with cleanup. */
  effectAsync(
    effect: (state: T, cleanup: (fn: () => void | Promise<void>) => void) =>
      void | (() => void | Promise<void>)
  ): () => Promise<void>

  /** Schedule async operations. */
  scheduleAsync(operation: (state: T) => Promise<Partial<T>>): Promise<void>
}

// =============================================================================
// FOCUSED MODEL FOR LENS-BASED OPERATIONS
// =============================================================================

/**
 * A focused view of a model through a lens
 */
interface FocusedModel<TFocus extends object, TRoot extends object> {
  read(): TFocus | undefined
  update(updater: (focus: TFocus | undefined) => TFocus | void): void
  onChange(listener: (current: TFocus | undefined, previous: TFocus | undefined) => void): () => void

  // Further focusing
  focus<TNext extends object>(lens: Lens<TFocus, TNext>): FocusedModel<TNext, TRoot>

  // Return to root
  root(): ModelAPI<TRoot>

  // Additional methods like ModelContext
  notify(): void
  emit<E>(event: E): void
  updateWith(updater: (state: TFocus) => TFocus): TFocus
  batch(operations: () => void): void
  effect(effect: (state: TFocus, cleanup: (fn: () => void) => void) => void | (() => void)): void
  schedule(operation: (state: TFocus) => Promise<void>, options?: { debounce?: number; throttle?: number }): Promise<void>
  transaction<TResult>(work: () => TResult): TResult
}

// =============================================================================
// SUBSCRIPTION MANAGEMENT
// =============================================================================

/**
 * Subscription with lifecycle management and transformations
 */
interface ModelSubscription<TSource extends object, TTarget extends object> {
  readonly id: string
  unsubscribe(): void
  pause(): void
  resume(): void
  
  // Transform subscription
  transform<TTransformed extends object>(
    transformer: (source: TSource) => TTransformed
  ): ModelSubscription<TTransformed, TTarget>
  
  // Add conditions and timing
  when(condition: (source: TSource, target: TTarget) => boolean): this
  throttle(ms: number): this
  debounce(ms: number): this
}

// =============================================================================
// COMPUTED PROPERTIES
// =============================================================================

/**
 * Cached computed property with dependency tracking
 */
interface ComputedProperty<T> {
  (): T
  readonly isComputed: true
  invalidate(): void
  dependencies: string[]
}

// =============================================================================
// MODEL SNAPSHOTS FOR TIME TRAVEL
// =============================================================================

/**
 * Model snapshot for time travel debugging
 */
interface ModelSnapshot<T extends object> {
  readonly timestamp: Date
  readonly state: T
  readonly metadata: {
    version: number
    checksum: string
  }
}

// =============================================================================
// DEBUG AND PERFORMANCE
// =============================================================================

/**
 * Debug information for development
 */
interface ModelDebugInfo<T extends object> {
  state: T
  computedValues: Record<string, any>
  subscriptions: Array<{
    type: 'onChange' | 'onEvent' | 'subscription'
    count: number
  }>
  performance: {
    updateCount: number
    lastUpdateDuration: number
    averageUpdateDuration: number
  }
}

// =============================================================================
// MAIN MODEL API
// =============================================================================

/**
 * Complete API for interacting with a typed model.
 * Provides immutable state management with reactive updates, events, and advanced features.
 *
 * @template T The model state type.
 * @template TName The model name type for type safety.
 */
interface ModelAPI<T extends object, TName extends string = string> {
  readonly id: ModelId<T>
  readonly name: TName
  readonly schema: ModelSchema<T>
  readonly __state: T
  
  // State access
  read(): DeepReadonly<T>
  readAt<P extends Path<T>>(path: P): PathValue<T, P>
  
  // Updates
  update(updater: (state: T, ctx: ModelContext<T>) => void): this
  updateAt<P extends Path<T>>(
    path: P,
    updater: (value: PathValue<T, P>) => PathValue<T, P>
  ): this
  updateWith(
    updater: (state: T) => T
  ): T

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
     onError?: (error: unknown, initialState: DeepReadonly<T>) => void
   ): this
  
  // Conditional updates
  updateIf<TGuard extends T>(
    guard: (state: T) => state is TGuard,
    updater: (state: TGuard, ctx: ModelContext<T>) => void
  ): this
  updateWhen(
    condition: (state: T) => boolean,
    updater: (state: T, ctx: ModelContext<T>) => void
  ): this
  
   // Lens system
   focus<TFocus extends object>(lens: Lens<T, TFocus>): FocusedModel<TFocus, T>
  lens<TFocus extends object>(getter: (state: T) => TFocus): Lens<T, TFocus>
  lensAt<P extends Path<T>>(path: P): Lens<T, PathValue<T, P>>
  
  // Subscriptions
  onChange(listener: (current: T, previous: T) => void): () => void
  onChangeAt<P extends Path<T>>(
    path: P,
    listener: (current: PathValue<T, P>, previous: PathValue<T, P>) => void
  ): () => void
  
  // Event integration
  createEvent<TEventName extends string, TPayload>(
    eventName: TEventName,
    defaultPayload: TPayload
  ): EventDefinition<TEventName, TPayload>
  emit<TEvent>(event: TEvent): this
  onEvent<TEvent>(handler: (event: TEvent) => void): () => void
  
  // Cross-model relationships
  subscribeTo<TSource extends ModelAPI<any, any>>(
    source: TSource,
    reaction: (
      source: TSource['__state'],
      target: T,
      ctx: ModelContext<T>
    ) => void
  ): ModelSubscription<TSource['__state'], T>
  
  // Computed properties
  compute<TResult>(
    name: string,
    computation: (state: T) => TResult
  ): ComputedProperty<TResult>
  
  // Validation
  validate(): ValidationResult<T>
  
   // Transactions
   transaction<TResult>(work: (ctx: ModelContext<T>) => TResult): TResult

   // Context methods
   notify(): void
   batch(operations: () => void): void
   effect(effect: (state: T, cleanup: (fn: () => void) => void) => void | (() => void)): void
   schedule(operation: (state: T) => Promise<void>, options?: { debounce?: number; throttle?: number }): Promise<void>

   // Time travel
  snapshot(): ModelSnapshot<T>
  restore(snapshot: ModelSnapshot<T>): this
  
  // Debugging
  debug(): ModelDebugInfo<T>

  // Lifecycle
  destroy(): void

  // Type guards
  is<TGuard extends T>(predicate: (state: T) => state is TGuard): boolean

  // Helper methods for common state manipulations
  set<P extends Path<T>>(path: P, value: PathValue<T, P>): this
  toggle<P extends Path<T>>(
    path: PathValue<T, P> extends boolean ? P : never
  ): this
  reset(): this
  push<P extends Path<T>>(
    path: P,
    ...items: PathValue<T, P> extends (infer U)[] ? U[] : never
  ): this
  removeWhere<P extends Path<T>>(
    path: P,
    predicate: (item: PathValue<T, P> extends (infer U)[] ? U : never) => boolean
  ): this
   updateAsync<LoadingKey extends keyof T, ErrorKey extends keyof T>(
     updater: (state: DeepReadonly<T>) => Promise<Partial<T>>,
    options: {
      loadingKey: PathValue<T, LoadingKey> extends boolean ? LoadingKey : never
      errorKey: ErrorKey
      onError?: (error: unknown, initialState: DeepReadonly<T>) => void
    }
  ): Promise<void>



}

// =============================================================================
// EVENT SCOPE FOR COMPOSITION
// =============================================================================

/**
 * Manages event composition, partitioning, and lifecycle within a scope.
 * Allows creating topics and partitions for complex event handling.
 */
interface EventScope {
  createTopic<T>(...events: Array<EventDefinition<any, T> | EventHandler<any, T>>): EventHandler<never, T>
  createPartition<T>(
    source: EventDefinition<any, T> | EventHandler<any, T>,
    predicate: (value: T) => boolean
  ): [EventHandler<never, T>, EventHandler<never, T>]
  cleanup(): void
}

// =============================================================================
// CRDT INTEGRATION (OPTIONAL)
// =============================================================================

/**
 * Manages Conflict-free Replicated Data Types (CRDTs) for collaborative editing features.
 * Handles replica identification, operation broadcasting, and conflict resolution.
 *
 * @example
 * ```ts
 * const crdt = new CRDTManager();
 * crdt.register('modelName', (op) => console.log('Apply op:', op), (cb) => {
 *   // Broadcast op to other replicas
 *   cb(op);
 * });
 * ```
 */
class CRDTManager {
  readonly replicaId: string;
  private models = new Map<string, { apply: (op: any) => void }>();
  private onBroadcastEmitter = new Set<(ops: any[]) => void>();
  private sequenceNumbers = new Map<string, number>(); // modelName -> last sequence
  private appliedOps = new Set<string>(); // opId deduplication

  constructor() {
    this.replicaId = `replica_${Math.random().toString(36).substring(2, 9)}`;
  }

  register(modelName: string, apply: (op: any) => void, onOpGenerated: (cb: (op: any) => void) => void) {
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

  receive(ops: any[]) {
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

  onBroadcast(callback: (ops: any[]) => void): () => void {
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

  /** Gets the next sequence number for a model. */
  getNextSequence(modelName: string): number {
    const sequence = (this.sequenceNumbers.get(modelName) || 0) + 1;
    this.sequenceNumbers.set(modelName, sequence);
    return sequence;
  }
}

// =============================================================================
// APP SCHEMA AND CREATION
// =============================================================================

/**
 * Schema definition for creating type-safe GPUI applications.
 * Defines models and events for the application.
 */
interface AppSchema {
  models: Record<string, ModelSchema<any>>
  events?: Record<string, { payload: any; for?: string }>
}

/**
 * Main context for the GPUI application, providing access to model creation,
 * batching, event scopes, and cleanup.
 */
interface GPUIContext {
  createModel<T extends object>(name: string, initialState: T, schema?: ModelSchema<T>): ModelAPI<T>
  batch(operations: (models: any) => void): void
  createEventScope(): EventScope
  cleanup(): void
  getRegistry(): ModelRegistry
  crdt: CRDTManager
}

/**
 * Legacy function for creating a model API for backward compatibility.
 * Use createModelAPI directly for new code.
 *
 * @template T The model state type.
 * @param app The GPUIContext instance.
 * @param name The name of the model.
 * @param initialState The initial state of the model.
 * @param schema Optional model schema.
 * @returns A ModelAPI instance.
 */
function createModel<T extends object>(app: GPUIContext, name: string, initialState: T, schema?: ModelSchema<T>): ModelAPI<T> {
  const fullSchema = schema || { initialState }
  return createModelAPI(name, fullSchema, app.getRegistry())
}

// =============================================================================
// IMPLEMENTATION: MODEL REGISTRY
// =============================================================================

/**
 * Central registry for managing all models, their subscriptions, events, and effects.
 * Handles state updates, effect queuing, and cleanup.
 */
class ModelRegistry {
  models = new Map<string, any>()
  private subscriptions = new Map<string, Set<(state: any) => void>>()
  private eventHandlers = new Map<string, Set<(event: any) => void>>()
  private effectQueue: Array<{ type: 'notify' | 'emit', modelId: string, event?: any }> = []
  private cleanupCallbacks = new Set<() => void>()
  private modelCleanupCallbacks = new Map<string, Set<() => void>>()
  private flushingEffects = false
  private batchDepth = 0

  /**
   * Register a new model in the system
   */
  register<T>(id: string, initialState: T): void {
    this.models.set(id, structuredClone(initialState))
    this.subscriptions.set(id, new Set())
    this.eventHandlers.set(id, new Set())
  }

  /**
   * Read model state (immutable copy)
   */
  read<T>(id: string): DeepReadonly<T> {
    const state = this.models.get(id)
    if (!state) throw new Error(`Model ${id} not found`)
    return structuredClone(state)
  }

  /**
   * Update model state with queued effects. This operation is atomic.
   * If the updater throws an error, the state is rolled back.
   */
  update<T extends object>(
    id: string,
    updater: (model: T, ctx: ModelContext<T>) => void
  ): void {
    const model = this.models.get(id) as T
    if (!model) return

    // 1. Create a snapshot for potential rollback.
    const snapshot = structuredClone(model)

    try {
      // 2. Attempt the update.
      const ctx = this.createContext<T>(id)
      updater(model, ctx)
    } catch (error) {
      // 3. If an error occurs, restore the state from the snapshot.
      this.models.set(id, snapshot)
      console.error(`[GPUI-TS] Error during update for model "${id}". State has been rolled back.`, error)
      // 4. Re-throw the error so the caller is aware of the failure.
      throw error
    }

    // 5. If successful, flush effects as normal.
    if (this.batchDepth === 0 && !this.flushingEffects) {
      this.flushEffects()
    }
  }

  /**
   * Create model context with all capabilities
   */
  createContext<T extends object>(id: string): ModelContext<T> {
    return {
      read: () => this.read<T>(id),
      
       notify: () => {
         this.effectQueue.push({ type: 'notify', modelId: id })
       },
      
        emit: <E>(event: E) => {
          this.effectQueue.push({ type: 'emit', modelId: id, event })
          if (!this.flushingEffects) {
            this.flushEffects()
          }
        },
      
        updateWith: (
          updater: (state: T) => T,
          options: {
            shouldNotify?: boolean
            shouldEmit?: boolean
            eventPayload?: any
          } = {}
        ) => {
          const model = this.models.get(id) as T
          const newState = updater(model)

          this.models.set(id, newState)

          if (options.shouldNotify !== false) {
            this.effectQueue.push({ type: 'notify', modelId: id })
            if (!this.flushingEffects) {
              this.flushEffects()
            }
          }

          if (options.shouldEmit) {
            this.effectQueue.push({ type: 'emit', modelId: id, event: options.eventPayload })
            if (!this.flushingEffects) {
              this.flushEffects()
            }
          }

          return newState
        },
      
      batch: (operations) => {
        this.batchDepth++
        try {
          operations()
        } finally {
          this.batchDepth--
          if (this.batchDepth === 0) {
            this.flushEffects()
          }
        }
      },
      
       effect: (effectFn) => {
         const cleanup: Array<() => void> = []
         const cleanupFn = effectFn(this.models.get(id), (fn) => cleanup.push(fn))

         if (cleanupFn) cleanup.push(cleanupFn)

         // Get or create the cleanup set for this specific model
         if (!this.modelCleanupCallbacks.has(id)) {
           this.modelCleanupCallbacks.set(id, new Set())
         }

         const modelCleaners = this.modelCleanupCallbacks.get(id)!
         const cleanupAll = () => cleanup.forEach(fn => fn())
         modelCleaners.add(cleanupAll)

         // Also add to global cleanup for full app teardown
         this.cleanupCallbacks.add(cleanupAll)
       },
      
      schedule: async (operation, options = {}) => {
        if (options.debounce) {
          return new Promise(resolve => {
            setTimeout(() => resolve(operation(this.models.get(id))), options.debounce);
          });
        } else if (options.throttle) {
          // Simple throttle implementation: delay by throttle ms
          return new Promise(resolve => {
            setTimeout(() => resolve(operation(this.models.get(id))), options.throttle);
          });
        } else {
          return operation(this.models.get(id));
        }
      },
      
      focus: <TFocus extends object>(lens: Lens<T, TFocus>) => {
        // Create focused context
        const focusedContext: ModelContext<TFocus> = {
          read: () => lens.get(this.models.get(id)) as DeepReadonly<TFocus>,
          notify: this.createContext<T>(id).notify,
          emit: this.createContext<T>(id).emit,
           updateWith: (
             updater: (state: TFocus) => TFocus,
             options: {
               shouldNotify?: boolean
               shouldEmit?: boolean
               eventPayload?: any
             } = {}
           ) => {
             const rootModel = this.models.get(id) as T
             const focused = lens.get(rootModel) as TFocus
             const newFocus = updater(focused)
             const newRoot = lens.set(rootModel, newFocus)
             this.models.set(id, newRoot)

             if (options.shouldNotify !== false) {
               this.effectQueue.push({ type: 'notify', modelId: id })
               if (!this.flushingEffects) {
                 this.flushEffects()
               }
             }

             if (options.shouldEmit) {
               this.effectQueue.push({ type: 'emit', modelId: id, event: options.eventPayload })
               if (!this.flushingEffects) {
                 this.flushEffects()
               }
             }

             return newFocus
           },
          batch: this.createContext<T>(id).batch,
          effect: this.createContext<T>(id).effect as any,
          schedule: this.createContext<T>(id).schedule as any,
           focus: <TNext extends object>(nextLens: Lens<TFocus, TNext>) => this.createContext<T>(id).focus(lens.compose(nextLens)),
            transaction: <TResult>(work: (ctx: ModelContext<TFocus>) => TResult) => {
              const snapshot = structuredClone(this.models.get(id))
              try {
                return work(focusedContext)
              } catch (error) {
                this.models.set(id, snapshot)
                throw error
              }
            },
            scheduleAsync: this.createContext<T>(id).scheduleAsync as any,
            effectAsync: this.createContext<T>(id).effectAsync as any
        }
        
        return focusedContext
      },
      
       transaction: <TResult>(work: (ctx: ModelContext<T>) => TResult) => {
         const snapshot = structuredClone(this.models.get(id))
         try {
           return work(this.createContext(id))
         } catch (error) {
           this.models.set(id, snapshot) // Rollback
           throw error
         }
       },

       scheduleAsync: async (operation) => {
         // Simplified implementation
         const state = this.models.get(id)
         const result = await operation(state)
         if (result) {
           this.models.set(id, { ...state, ...result })
         }
       },

       effectAsync: (effect) => {
         // Simplified
         const cleanup: Array<() => void | Promise<void>> = []
         const cleanupFn = effect(this.models.get(id), (fn) => cleanup.push(fn))
         if (cleanupFn) cleanup.push(cleanupFn)
         return () => Promise.all(cleanup.map(fn => Promise.resolve(fn()))).then(() => {})
       }
    }
  }

  /**
   * Subscribe to model changes
   */
  subscribe(modelId: string, callback: (state: any) => void): () => void {
    const subscribers = this.subscriptions.get(modelId)
    if (subscribers) {
      subscribers.add(callback)
      return () => subscribers.delete(callback)
    }
    return () => {}
  }

  /**
   * Subscribe to model events
   */
  onEvent(modelId: string, handler: (event: any) => void): () => void {
    const handlers = this.eventHandlers.get(modelId)
    if (handlers) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    }
    return () => {}
  }

  /**
   * Emit event for model
   */
  emit(modelId: string, event: any): void {
    this.effectQueue.push({ type: 'emit', modelId: modelId, event })
    if (!this.flushingEffects) {
      this.flushEffects()
    }
  }

  /**
   * Flush all queued effects
   */
  private flushEffects(): void {
    if (this.flushingEffects) return

    this.flushingEffects = true
    try {
      while (this.effectQueue.length > 0) {
        const effect = this.effectQueue.shift()!
        switch (effect.type) {
          case 'notify':
            const subscribers = this.subscriptions.get(effect.modelId)
            if (subscribers) {
              const state = this.models.get(effect.modelId)
              subscribers.forEach(callback => callback(state))
            }
            break
          case 'emit':
            const handlers = this.eventHandlers.get(effect.modelId)
            if (handlers) {
              handlers.forEach(callback => callback(effect.event))
            }
            break
        }
      }
    } finally {
      this.flushingEffects = false
    }
  }

   /**
    * Destroy a specific model
   */
  destroy(modelId: string): void {
    this.models.delete(modelId)
    this.subscriptions.delete(modelId)
    this.eventHandlers.delete(modelId)
  }

  /**
   * Unregister a specific model and clean up all its resources
   */
  unregister(modelId: string): void {
    // 1. Run and clear all effect cleanup functions for this model
    const modelCleaners = this.modelCleanupCallbacks.get(modelId)
    if (modelCleaners) {
      modelCleaners.forEach(cleanup => {
        cleanup()
        // Remove from global cleanup set as well
        this.cleanupCallbacks.delete(cleanup)
      })
      this.modelCleanupCallbacks.delete(modelId)
    }

    // 2. Remove the model's state
    this.models.delete(modelId)

    // 3. Remove all subscriptions and event handlers
    this.subscriptions.delete(modelId)
    this.eventHandlers.delete(modelId)

     console.log(`[GPUI-TS] Model "${modelId}" and its resources have been unregistered.`)
   }

   /**
    * Batch multiple operations without intermediate notifications.
    */
   batch(operations: () => void): void {
     this.batchDepth++
     try {
       operations()
     } finally {
       this.batchDepth--
       if (this.batchDepth === 0) {
         this.flushEffects()
       }
     }
   }

     /**
      * Clean up all resources
      */
   cleanup(): void {
     this.cleanupCallbacks.forEach(cleanup => cleanup())
     this.cleanupCallbacks.clear()
     this.modelCleanupCallbacks.clear()
     this.models.clear()
     this.subscriptions.clear()
     this.eventHandlers.clear()
     this.effectQueue.length = 0
   }
}

// =============================================================================
// IMPLEMENTATION: EVENT SYSTEM
// =============================================================================

/**
 * Implementation of EventDefinition with support for event composition, transformation,
 * and subscription management. Handles debouncing, throttling, and filtering.
 *
 * @template TName The event name type.
 * @template TPayload The event payload type.
 */
class EventDefinitionImpl<TName extends string, TPayload> {
  readonly eventId: EventId<TName>
  readonly name: TName
  readonly defaultPayload: TPayload
  private subscribers = new Set<(payload: TPayload) => void>()

  constructor(name: TName, defaultPayload: TPayload) {
    this.eventId = Symbol(`event:${name}`) as any
    this.name = name
    this.defaultPayload = defaultPayload
  }

  // Direct operations
  subscribe(callback: (payload: TPayload) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  emit(payload?: TPayload): void {
    const actualPayload = payload !== undefined ? payload : this.defaultPayload
    this.subscribers.forEach(callback => {
      try {
        callback(actualPayload)
      } catch (error) {
        if (error !== HALT) throw error
      }
    })
  }

  // Utility methods
  filter(predicate: (payload: TPayload) => boolean): EventHandler<TPayload, TPayload> {
    return this.call((payload: TPayload) => predicate(payload) ? payload : halt())
  }

  map<TOutput>(transform: (payload: TPayload) => TOutput): EventHandler<TPayload, TOutput> {
    return this.call(transform)
  }

  debounce(ms: number): EventHandler<TPayload, TPayload> {
    return createEventHandler<TPayload, TPayload>([], this.subscribers, { debounce: ms })
  }

  throttle(ms: number): EventHandler<TPayload, TPayload> {
    return createEventHandler<TPayload, TPayload>([], this.subscribers, { throttle: ms })
  }

  // Call signature implementation
  call<TOutput>(transform: (payload: TPayload) => TOutput | HaltSignal): EventHandler<TPayload, TOutput> {
    return createEventHandler<TPayload, TOutput>([transform], this.subscribers, {})
  }
}

function createEventHandlerProxy<TName extends string, TPayload>(
  impl: EventDefinitionImpl<TName, TPayload>,
  _transform?: (payload: TPayload) => any | HaltSignal
): EventDefinition<TName, TPayload> {
  const proxy = new Proxy(impl.call.bind(impl), {
    get(_target, prop) {
      if (prop in impl) {
        return (impl as any)[prop]
      }
      return undefined
    },
    set(_target, prop, value) {
      if (prop in impl) {
        (impl as any)[prop] = value
        return true
      }
      return false
    }
  }) as EventDefinition<TName, TPayload>

  return proxy
}

/**
 * Creates an EventDefinition with the given name and default payload.
 * Provides a foundation for event-driven programming with composition support.
 *
 * @template TName The event name type.
 * @template TPayload The event payload type.
 * @param name The unique name of the event.
 * @param defaultPayload The default payload for the event.
 * @returns An EventDefinition instance.
 *
 * @example
 * ```ts
 * const userLoginEvent = createEventDefinition('USER_LOGIN', { userId: '', timestamp: 0 });
 * userLoginEvent.emit({ userId: '123', timestamp: Date.now() });
 * ```
 */
function createEventDefinition<TName extends string, TPayload>(
  name: TName,
  defaultPayload: TPayload
): EventDefinition<TName, TPayload> {
  const impl = new EventDefinitionImpl(name, defaultPayload)
  return createEventHandlerProxy(impl)
}

/**
 * Creates an EventHandler for chaining transformations, filtering, and timing operations.
 * Supports debouncing, throttling, and mapping of event payloads.
 *
 * @template TInput The input payload type.
 * @template TOutput The output payload type.
 * @param transformations Array of transformation functions to apply.
 * @param rootSubscribers Set of subscribers to the root event.
 * @param options Configuration options like debounce or throttle.
 * @returns An EventHandler instance.
 */
function createEventHandler<TInput, TOutput>(
  transformations: Array<(input: any) => any>,
  rootSubscribers: Set<(payload: any) => void>,
  options: { debounce?: number; throttle?: number } = {}
): EventHandler<TInput, TOutput> {
  
  const handler = ((transform: (output: TOutput) => any | HaltSignal) => {
    return createEventHandler<TInput, any>([...transformations, transform], rootSubscribers, options)
  }) as EventHandler<TInput, TOutput>
  
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastEmit = 0

  Object.assign(handler, {
    subscribe: (callback: (output: TOutput) => void) => {
      const wrappedCallback = (input: TInput) => {
        try {
          let result: any = input
          for (const transform of transformations) {
            result = transform(result)
            if (result === HALT || result === undefined) return
          }

          const emit = () => {
            if (result !== undefined) callback(result)
          }

          if (options.debounce) {
            if (timeoutId) clearTimeout(timeoutId)
            timeoutId = setTimeout(emit, options.debounce)
          } else if (options.throttle) {
            const now = Date.now()
            if (now - lastEmit >= options.throttle) {
              lastEmit = now
              emit()
            }
          } else {
            emit()
          }
        } catch (error) {
          if (error !== HALT) throw error
        }
      }

      rootSubscribers.add(wrappedCallback)
      return () => rootSubscribers.delete(wrappedCallback)
    },
    
    filter: (predicate: (output: TOutput) => boolean) =>
      handler((output: TOutput) => predicate(output) ? output : halt()),
    
    map: <TNext>(transform: (output: TOutput) => TNext) =>
      handler(transform),
    
    debounce: (ms: number) => createEventHandler<TInput, TOutput>(transformations, rootSubscribers, { debounce: ms }),
    throttle: (ms: number) => createEventHandler<TInput, TOutput>(transformations, rootSubscribers, { throttle: ms }),

    toSubject: (initialValue: TOutput) =>
      createSubject(initialValue, handler as any),
    
    __isEventHandler: true as const
  })
  
  return handler
}

/**
 * Creates a simple event handler and emitter pair for backward compatibility.
 * Returns an EventHandler and a direct emit function.
 *
 * @template T The payload type.
 * @returns A tuple of [EventHandler, emitFunction].
 *
 * @example
 * ```ts
 * const [handler, emit] = createEvent<string>();
 * handler.subscribe(payload => console.log('Received:', payload));
 * emit('Hello World');
 * ```
 */
function createEvent<T>(): [EventHandler<T, T>, (payload: T) => void] {
  const subscribers = new Set<(payload: T) => void>()
  
  const handler = ((transform: (input: T) => any | HaltSignal) => {
    return createEventHandler<T, any>([transform], subscribers, {})
  }) as EventHandler<T, T>
  
  const emit = (payload: T) => {
    subscribers.forEach(callback => {
      try {
        callback(payload)
      } catch (error) {
        if (error !== HALT) throw error
      }
    })
  }
  
  Object.assign(handler, {
    subscribe: (callback: (payload: T) => void) => {
      subscribers.add(callback)
      return () => subscribers.delete(callback)
    },
    
    filter: (predicate: (output: T) => boolean) =>
      handler((output: T) => predicate(output) ? output : halt()),
    
    map: <TNext>(transform: (output: T) => TNext) =>
      handler(transform),
    
    debounce: (ms: number) => createEventHandler<T, T>([], subscribers, { debounce: ms }),
    throttle: (ms: number) => createEventHandler<T, T>([], subscribers, { throttle: ms }),
    toSubject: (initialValue: T) => createSubject(initialValue, handler as any),
    __isEventHandler: true as const
  })
  
  return [handler, emit]
}

// =============================================================================
// IMPLEMENTATION: SUBJECT SYSTEM
// =============================================================================

/**
 * Creates a reactive Subject that can respond to events and derive new values.
 * Supports event-driven updates, subscriptions, and derivations.
 *
 * @template T The subject value type.
 * @param initialValue The initial value of the subject.
 * @param eventHandlers Event handlers to react to.
 * @returns A Subject instance.
 *
 * @example
 * ```ts
 * const count = createSubject(0, userClickEvent.map(() => 1));
 * count.subscribe(() => console.log('Count changed:', count()));
 * ```
 */
function createSubject<T>(
  initialValue: T,
  ...eventHandlers: Array<EventDefinition<any, any> | EventHandler<any, T | ((current: T) => T)>>
): Subject<T> {
  let currentValue = initialValue
  const changeSubscribers = new Set<() => void>()
  
  // Subscribe to event handlers
  eventHandlers.forEach(handler =>
    handler.subscribe((update: any) => {
      if (typeof update === 'function') {
        currentValue = (update as (current: T) => T)(currentValue)
      } else {
        // For numbers, add; otherwise set
        if (typeof currentValue === 'number' && typeof update === 'number') {
          currentValue = (currentValue + update) as T
        } else {
          currentValue = update
        }
      }
      changeSubscribers.forEach(callback => callback())
    })
  )
  
  const subject = (() => currentValue) as Subject<T>
  
  Object.assign(subject, {
    set: (value: T) => {
      currentValue = value
      changeSubscribers.forEach(callback => callback())
    },
    
    on: <TEventPayload>(
      event: EventDefinition<any, TEventPayload> | EventHandler<any, TEventPayload>,
      reaction: (payload: TEventPayload) => T | ((current: T) => T)
    ) => {
      event.subscribe((payload: TEventPayload) => {
        const update = reaction(payload)
        if (typeof update === 'function') {
          currentValue = (update as (current: T) => T)(currentValue)
        } else {
          currentValue = update
        }
        changeSubscribers.forEach(callback => callback())
      })
      return subject
    },
    
    derive: <TDerived>(compute: (value: T) => TDerived) => {
      const derived = createSubject(compute(currentValue))
      changeSubscribers.add(() => {
        derived.set(compute(currentValue))
      })
      return derived
    },
    
    __isSubject: true as const,

    subscribe: (callback: () => void) => {
      changeSubscribers.add(callback)
      return () => changeSubscribers.delete(callback)
    }
  })
  
  return subject
}

// =============================================================================
// IMPLEMENTATION: MODEL CREATION
// =============================================================================

/**
 * Defines a model schema with full type inference for creating typed models.
 * Provides a fluent API for specifying model constraints and behaviors.
 *
 * @template T The base model type.
 * @param name The name of the model.
 * @returns A function to define the schema.
 *
 * @example
 * ```ts
 * const userModel = defineModel('user')({
 *   initialState: { name: '', age: 0 },
 *   constraints: { required: ['name'] }
 * });
 * ```
 */
function defineModel<T extends object>(name: string) {
  return <TState extends T = T>(schema: ModelSchema<TState>) => ({
    name,
    schema,
    __phantom: undefined as any as TState
  })
}

/**
 * Creates a complete ModelAPI instance with all features including state management,
 * events, lenses, validation, and transactions.
 *
 * @template T The model state type.
 * @template TName The model name type.
 * @param name The name of the model.
 * @param schema The model schema defining initial state and constraints.
 * @param registry The ModelRegistry instance.
 * @returns A ModelAPI instance.
 */
function createModelAPI<T extends object, TName extends string>(
  name: TName,
  schema: ModelSchema<T>,
  registry: ModelRegistry
): ModelAPI<T, TName> {
  const id = name as unknown as ModelId<T>
  const { initialState, constraints, computed: _computed, effects: _effects, middleware: _middleware } = schema
  
  let currentState = structuredClone(initialState) as T
  let previousState = structuredClone(initialState) as T
  const subscribers = new Set<(current: T, previous: T) => void>()
  const computedCache = new Map<string, { value: any; dirty: boolean }>()
  const snapshots: ModelSnapshot<T>[] = []
  

  
  // Register with global registry
  registry.register(name, initialState)
  
  // Validation
  const validate = (): ValidationResult<T> => {
    const errors: ValidationError<T>[] = []
    const state = registry.read(name) as T

    if (constraints?.validate) {
      try {
        const validationErrors = constraints.validate(state)
        if (validationErrors && validationErrors.length > 0) {
          errors.push(...validationErrors.map(msg => ({
            path: '' as Path<T>,
            message: msg,
            code: 'CUSTOM_VALIDATION'
          })))
        }
      } catch (e) {
        errors.push({
          path: '' as Path<T>,
          message: `Validation error: ${(e as Error).message}`,
          code: 'VALIDATION_EXCEPTION'
        })
      }
    }

    return { valid: errors.length === 0, errors }
  }
  
  // Computed property creation
  const createComputedProperty = <TResult>(
    computeName: string,
    computation: (state: T) => TResult
  ): ComputedProperty<TResult> => {
    const computedProp = (() => {
      const cached = computedCache.get(computeName)
      if (cached && !cached.dirty) {
        return cached.value
      }
      
      const newValue = computation(currentState)
      computedCache.set(computeName, { value: newValue, dirty: false })
      return newValue
    }) as ComputedProperty<TResult>
    
    Object.assign(computedProp, {
      isComputed: true as const,
      invalidate: () => {
        const cached = computedCache.get(computeName)
        if (cached) cached.dirty = true
      },
      dependencies: [name]
    })
    
    return computedProp
  }
  
  // Main API implementation
  const api: ModelAPI<T, TName> = {
    id,
    name,
    schema,
    __state: undefined as any,
    
    read: () => registry.read(name),
    
    readAt: <P extends Path<T>>(path: P): PathValue<T, P> => {
      return getNestedProperty(currentState, path as string) as PathValue<T, P>
    },
    
    update: function(updater: (state: T, ctx: ModelContext<T>) => void) {
      registry.update<T>(name, (state, ctx) => {
        // Check readonly constraints
        if (constraints?.readonly) {
             const originalState = structuredClone(state) as T
          updater(state, ctx)
          // Restore readonly fields
          constraints.readonly.forEach(field => {
            if (field in originalState) {
              (state as any)[field] = originalState[field]
            }
          })
        } else {
          updater(state, ctx)
        }
      })
       // Sync local state
       currentState = registry.read(name) as T
      // Invalidate computed cache
      computedCache.forEach((cached) => {
        cached.dirty = true
      })
      // Check required constraints
      if (constraints?.required) {
        const state = currentState
        for (const field of constraints.required) {
          if (!(field in state) || state[field as keyof T] === undefined || state[field as keyof T] === null) {
            throw new Error(`Required field '${String(field)}' is missing or null`)
          }
        }
      }
      return this
    },
    
    updateAt: function<P extends Path<T>>(
      path: P,
      updater: (value: PathValue<T, P>) => PathValue<T, P>
    ) {
      return this.update(state => {
        const currentValue = getNestedProperty(state, path as string) as PathValue<T, P>
        const newValue = updater(currentValue)
        setNestedProperty(state, path as string, newValue)
      })
    },
    
    updateWith: function(updater: (state: T) => T) {
    const result = registry.createContext<T>(name).updateWith(updater)
    currentState = registry.read<T>(name) as T
    return result
  },

     updateAndNotify: function(
       updater: (state: T) => void,
       onError?: (error: unknown, initialState: DeepReadonly<T>) => void
     ) {
      // Capture the state *before* the update attempt.
      const initialState = this.read()
      try {
        // Use the core `update` method. It's already transactional.
        this.update((state, ctx) => {
          updater(state)
          ctx.notify()
        })
      } catch (error) {
        // If an error was thrown by the (now transactional) update...
        if (onError) {
          // ...call the provided error handler.
          onError(error, initialState as DeepReadonly<T>)
        } else {
          // ...otherwise, re-throw the error to ensure it's not silently swallowed.
          throw error
        }
      }
      return this
    },

    set: function<P extends Path<T>>(path: P, value: PathValue<T, P>) {
      this.updateAndNotify(state => {
        setNestedProperty(state, path as string, value)
      })
      return this
    },

    toggle: function<P extends Path<T>>(path: P) {
      this.updateAndNotify(state => {
        const currentValue = getNestedProperty(state, path as string)
        if (typeof currentValue !== 'boolean') {
          console.warn(`[GPUI-TS] toggle called on non-boolean path "${String(path)}".`)
          return
        }
        setNestedProperty(state, path as string, !currentValue)
      })
      return this
    },

    reset: function() {
      this.updateAndNotify(state => {
        // A safe way to reset without changing the object reference
        Object.keys(state as object).forEach(key => delete (state as any)[key])
        Object.assign(state, structuredClone(schema.initialState))
      })
      return this
    },

    push: function<P extends Path<T>>(path: P, ...items: any[]) {
      this.updateAndNotify(state => {
        const currentArray = getNestedProperty(state, path as string)
        if (!Array.isArray(currentArray)) {
          console.warn(`[GPUI-TS] push called on non-array path "${String(path)}".`)
          return
        }
        currentArray.push(...items)
      })
      return this
    },

    removeWhere: function<P extends Path<T>>(path: P, predicate: (item: any) => boolean) {
      this.updateAndNotify(state => {
        const currentArray = getNestedProperty(state, path as string)
        if (!Array.isArray(currentArray)) {
          console.warn(`[GPUI-TS] removeWhere called on non-array path "${String(path)}".`)
          return
        }
        const filtered = currentArray.filter(item => !predicate(item))
        setNestedProperty(state, path as string, filtered)
      })
      return this
    },

      updateAsync: async function<LoadingKey extends keyof T, ErrorKey extends keyof T>(
        updater: (state: DeepReadonly<T>) => Promise<Partial<T>>,
       options: {
         loadingKey: PathValue<T, LoadingKey> extends boolean ? LoadingKey : never
         errorKey: ErrorKey
         onError?: (error: unknown, initialState: DeepReadonly<T>) => void
       }
     ) {
      const { loadingKey, errorKey, onError } = options

      this.updateAndNotify(state => {
        (state as any)[loadingKey] = true
        ;(state as any)[errorKey] = null
      })

      const initialState = this.read()
      try {
        const result = await updater(initialState)
        this.updateAndNotify(state => {
          Object.assign(state, result)
          ;(state as any)[loadingKey] = false
        })
      } catch (error) {
        this.updateAndNotify(state => {
          ;(state as any)[loadingKey] = false
          ;(state as any)[errorKey] = error
        })
         if (onError) {
           onError(error, initialState)
         }
      }
    },

    updateIf: function<TGuard extends T>(
      guard: (state: T) => state is TGuard,
      updater: (state: TGuard, ctx: ModelContext<T>) => void
    ) {
      return this.update((state, ctx) => {
        if (guard(state)) {
          updater(state, ctx)
        }
      })
    },
    
    updateWhen: function(
      condition: (state: T) => boolean,
      updater: (state: T, ctx: ModelContext<T>) => void
    ) {
      return this.update((state, ctx) => {
        if (condition(state)) {
          updater(state, ctx)
        }
      })
    },
    
     lens: function<TFocus extends object>(getter: (state: T) => TFocus) {
      return lens<T, TFocus>(
        getter,
        (root, _value) => {
          // Sophisticated merging would go here
          const result = structuredClone(root)
          // This is simplified - real implementation would need path tracking
          return result
        }
      )
    },
    
    lensAt: <P extends Path<T>>(path: P) => {
      return lens<T, PathValue<T, P>>(
        (root) => getNestedProperty(root, path as string) as PathValue<T, P>,
        (root, value) => {
          const newRoot = structuredClone(root)
          setNestedProperty(newRoot, path as string, value)
          return newRoot
        }
      )
    },

     transaction: function<TResult>(work: (ctx: ModelContext<T>) => TResult) {
      const ctx = registry.createContext<T>(name)
       const snapshot = structuredClone(registry.read<T>(name) as T)
      try {
        const result = work(ctx)
        const validation = validate()
        if (!validation.valid) {
          registry.models.set(name, snapshot)
          currentState = snapshot
          return result
        }
         currentState = registry.read<T>(name) as T
         return result
         } catch (error) {
           registry.models.set(name, snapshot)
           currentState = registry.read<T>(name) as T
           throw error
         }
    },

      focus: <TFocus extends object>(targetLens: Lens<T, TFocus>) => {
         const focused: FocusedModel<TFocus, T> = {
           read: () => targetLens.get(currentState) as TFocus | undefined,

                update: (updater: (focus: TFocus | undefined) => TFocus | void) => {
                  api.update((state, ctx) => {
                    const currentFocus = targetLens.get(state)
                    const updatedFocus = updater(currentFocus)
                    const newFocus = updatedFocus !== undefined ? updatedFocus : currentFocus
                    if (newFocus !== undefined) {
                      const newRoot = targetLens.set(state, newFocus)
                      Object.assign(state as any, newRoot)
                    }
                    ctx.notify()
                  })
                },

          onChange: (listener: (current: TFocus | undefined, previous: TFocus | undefined) => void) => {
           return api.onChange((current, previous) => {
             const currentFocus = targetLens.get(current)
             const previousFocus = targetLens.get(previous)
             // Deep comparison for objects/arrays, shallow for primitives
             const changed = typeof currentFocus === 'object' && typeof previousFocus === 'object' 
               ? JSON.stringify(currentFocus) !== JSON.stringify(previousFocus)
               : currentFocus !== previousFocus
             if (changed) {
               listener(currentFocus, previousFocus)
             }
           })
         },

          focus: <TNext extends object>(nextLens: Lens<TFocus, TNext>) =>
            api.focus(targetLens.compose(nextLens)),

         root: () => api,

          notify: () => api.notify(),
          emit: (event: any) => api.emit(event),
            updateWith: (updater: (state: TFocus) => TFocus) => {
              let newFocus: TFocus | undefined
              api.updateWith((root) => {
                const currentFocus = targetLens.get(root) as TFocus
                newFocus = updater(currentFocus)
                return targetLens.set(root, newFocus)
              })
              return newFocus!
            },
           batch: (operations: () => void) => api.batch(operations),
             effect: (effect: (state: TFocus, cleanup: (fn: () => void) => void) => void | (() => void)) => api.effect((root, cleanup) => effect(targetLens.get(root) as TFocus, cleanup)),
              schedule: (operation: (state: TFocus) => Promise<void>, options?: { debounce?: number; throttle?: number }) => api.schedule((root) => operation(targetLens.get(root) as TFocus), options),
              transaction: <TResult>(work: (ctx: ModelContext<TFocus>) => TResult) => api.transaction(() => work(api as any))
        }

      return focused
    },
    
     onChange: function(listener: (current: T, previous: T) => void) {
      return registry.subscribe(name, (current) => {
        listener(current, previousState)
        previousState = structuredClone(current)
      })
    },
    
     onChangeAt: function<P extends Path<T>>(
      path: P,
      listener: (current: PathValue<T, P>, previous: PathValue<T, P>) => void
    ) {
      return api.onChange((current, previous) => {
        const currentValue = getNestedProperty(current, path as string) as PathValue<T, P>
        const previousValue = getNestedProperty(previous, path as string) as PathValue<T, P>
        if (currentValue !== previousValue) {
          listener(currentValue, previousValue)
        }
      })
    },
    
     createEvent: function<TEventName extends string, TPayload>(
      eventName: TEventName,
      defaultPayload: TPayload
    ) {
      const event = createEventDefinition(eventName, defaultPayload)

      // Connect to model's event system
      event.subscribe(payload => {
        registry.emit(name, { type: eventName, payload })
      })

      return event
    },
    
    emit: function<TEvent>(event: TEvent) {
      registry.emit(name, event)
      return this
    },
    
     onEvent: function<TEvent>(handler: (event: TEvent) => void) {
      return registry.onEvent(name, handler)
    },
    
     subscribeTo: function<TSource extends ModelAPI<any, any>>(
      source: TSource,
      reaction: (source: TSource['__state'], target: T, ctx: ModelContext<T>) => void
    ) {
      const subscription = registry.subscribe(
        source.name,
        (sourceState) => {
          const targetState = registry.read<T>(name) as T
          const ctx = registry.createContext<T>(name)
          reaction(sourceState as TSource['__state'], targetState, ctx)
        }
      )

      return {
        id: `${source.name}->${name}`,
        unsubscribe: subscription,
        pause: () => {},
        resume: () => {},
        transform: () => this as any,
        when: () => this as any,
        throttle: () => this as any,
        debounce: () => this as any
      } as ModelSubscription<TSource['__state'], T>
    },
    
    compute: createComputedProperty,

    validate,
    
     snapshot: function() {
      return {
        timestamp: new Date(),
        state: structuredClone(currentState),
        metadata: {
          version: snapshots.length + 1,
          checksum: generateChecksum(currentState)
        }
      }
    },
    
    restore: function(snapshot: ModelSnapshot<T>) {
      registry.update(name, (state) => {
        Object.assign(state as any, snapshot.state)
      })
      currentState = registry.read<T>(name) as T
      return this
    },
    
     debug: function() {
      return {
        state: structuredClone(currentState),
        computedValues: Object.fromEntries(
          Array.from(computedCache.entries()).map(([key, { value }]) => [key, value])
        ),
        subscriptions: [
          { type: 'onChange' as const, count: subscribers.size }
        ],
        performance: {
          updateCount: 0,
          lastUpdateDuration: 0,
          averageUpdateDuration: 0
        }
      }
    },

     destroy: function() {
      subscribers.clear()
      computedCache.clear()
      registry.destroy(name)
    },

      is: function<TTest extends T>(predicate: (state: T) => state is TTest) {
       return predicate(currentState)
     },

       notify: function() {
        registry.createContext<T>(name).notify()
      },

       batch: function(operations: () => void) {
        registry.createContext<T>(name).batch(operations)
      },

       effect: function(effect: (state: T, cleanup: (fn: () => void) => void) => void | (() => void)) {
        registry.createContext<T>(name).effect(effect)
      },

       schedule: function(operation: (state: T) => Promise<void>, options?: { debounce?: number; throttle?: number }) {
        return registry.createContext<T>(name).schedule(operation, options)
      }
   }

   return api
}

// =============================================================================
// IMPLEMENTATION: EVENT SCOPE
// =============================================================================

/**
 * Creates an EventScope for managing event composition, topics, and partitions.
 * Provides utilities for combining and filtering events.
 *
 * @returns An EventScope instance.
 */
function createEventScope(): EventScope {
  const unsubscribers: Array<() => void> = []

  return {
    createTopic: <T>(...events: Array<EventDefinition<any, T> | EventHandler<any, T>>) => {
      const [topicHandler, emitTopic] = createEvent<T>()

      events.forEach(event => {
        const unsubscribe = event.subscribe((value: T) => emitTopic(value))
        unsubscribers.push(unsubscribe)
      })

      return topicHandler
    },

    createPartition: <T>(
      source: EventDefinition<any, T> | EventHandler<any, T>,
      predicate: (value: T) => boolean
    ) => {
      const [trueHandler, emitTrue] = createEvent<T>()
      const [falseHandler, emitFalse] = createEvent<T>()

      const unsubscribe = source.subscribe((value: T) => {
        if (predicate(value)) {
          emitTrue(value)
        } else {
          emitFalse(value)
        }
      })
      unsubscribers.push(unsubscribe)

      return [trueHandler, falseHandler]
    },

    cleanup: () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
      unsubscribers.length = 0
    }
  }
}

// =============================================================================
// IMPLEMENTATION: APP CREATION
// =============================================================================

/**
 * Typed GPUI application instance with models, events, and utilities.
 * Provides full type safety for all operations.
 *
 * @template TSchema The application schema type.
 */
type GPUIApp<TSchema extends AppSchema> = {
  models: {
    [K in keyof TSchema['models']]: ModelAPI<
      TSchema['models'][K]['initialState'],
      K & string
    >
  }
  events: EventScope
  batch(operations: (models: any) => void): void
  cleanup(): void
  crdt: CRDTManager
  // Internal properties for extensibility
  _schema: TSchema
  _registry: ModelRegistry
} & GPUIContext

/**
 * Creates a fully typed GPUI application from a schema.
 * Provides complete type safety and inference for all models and operations.
 *
 * @template TSchema The application schema type.
 * @param schema The application schema defining models and their configurations.
 * @returns Typed application instance with models, events, and utilities.
 *
 * @example
 * ```ts
 * const schema = createSchema()
 *   .model('user', { name: '', age: 0 })
 *   .model('todos', { items: [] })
 *   .build();
 *
 * const app = createApp(schema);
 * app.models.user.update(state => ({ ...state, name: 'Alice' }));
 * ```
 */
function createApp<TSchema extends AppSchema>(schema: TSchema): GPUIApp<TSchema> {
  const registry = new ModelRegistry()
  const models = {} as any
  const eventScope = createEventScope()
  const crdt = new CRDTManager()

  // Create all models with full type inference
  for (const [key, def] of Object.entries(schema.models)) {
    // Support nested schema structure
    const modelSchema = def.schema ? { ...def, ...def.schema, schema: undefined } : def
    models[key] = createModelAPI(key, modelSchema, registry)
  }

  const context: GPUIContext = {
    createModel: <T extends object>(name: string, initialState: T, schema?: ModelSchema<T>) => {
      const fullSchema = schema || { initialState }
      return createModelAPI(name, fullSchema, registry)
    },
    batch: (operations) => registry.batch(() => operations(models)),
    createEventScope: () => createEventScope(),
    cleanup: () => {
      registry.cleanup()
      eventScope.cleanup()
    },
    getRegistry: () => registry,
    crdt
  }

  return {
    models,
    events: eventScope,
    batch: context.batch,
    cleanup: context.cleanup,
    crdt,
    createEventScope: context.createEventScope,
    getRegistry: context.getRegistry,
    createModel: context.createModel,
    // Internal properties for extensibility
    _schema: schema,
    _registry: registry
  }
}

/**
 * Dynamically adds a new model to an existing GPUI application instance.
 * This function is fully type-safe. It returns a new `app` object whose type
 * includes the newly added model, allowing for autocompletion and type checking.
 *
 * @template TApp The existing app type.
 * @template TModelName The name of the new model.
 * @template TState The state type of the new model.
 * @param app The existing GPUI application instance.
 * @param modelName The unique name for the new model.
 * @param modelDefinition The initial state and optional schema for the new model.
 * @returns A new, extended GPUI application instance.
 */
function addModel<
  TApp extends GPUIApp<any>,
  TModelName extends string,
  TState extends object
>(
  app: TApp,
  modelName: TModelName,
  modelDefinition: { initialState: TState; schema?: ModelSchema<TState> }
): GPUIApp<
  TApp['_schema'] & { models: { [K in TModelName]: { initialState: TState } } }
> {
  // Runtime check to prevent overwriting an existing model.
  if (modelName in app.models) {
    throw new Error(`[GPUI-TS] Model with name "${modelName}" already exists.`)
  }

  // Use the app's internal registry to create and register the new model.
  const newModelAPI = createModelAPI(
    modelName,
    {
      initialState: modelDefinition.initialState,
      ...modelDefinition.schema,
    },
    app._registry // Use the SAME registry from the original app
  )

  // Create the new, extended `models` object.
  const newModels = {
    ...app.models,
    [modelName]: newModelAPI,
  }

  // Create the new, extended `schema` object.
  const newSchema = {
    ...app._schema,
    models: {
      ...app._schema.models,
      [modelName]: { initialState: modelDefinition.initialState },
    },
  }

  // Return a new app object that includes the new model.
  const extendedApp = {
    ...app,
    models: newModels,
    _schema: newSchema,
  }

  return extendedApp as any // Cast to the complex inferred type.
}

/**
 * Dynamically removes a model from a GPUI application instance.
 * This function is fully type-safe. It unregisters the model and all its
 * associated resources, then returns a new `app` object whose type no longer
 * includes the removed model.
 *
 * @template TApp The existing app type.
 * @template TModelName The name of the model to remove.
 * @param app The existing GPUI application instance.
 * @param modelName The name of the model to remove.
 * @returns A new, narrowed GPUI application instance.
 */
function removeModel<
  TApp extends GPUIApp<any>,
  TModelName extends keyof TApp['models'] & string
>(
  app: TApp,
  modelName: TModelName
): GPUIApp<{
  models: Omit<TApp['_schema']['models'], TModelName>
  events: TApp['_schema']['events']
}> {
  if (!(modelName in app.models)) {
    console.warn(`[GPUI-TS] Model with name "${modelName}" does not exist and cannot be removed.`)
    return app as any
  }

  // Unregister the model from the central registry to clean up all resources.
  app._registry.unregister(modelName)

  // Create new `models` and `schema` objects without the removed model.
  const { [modelName]: _, ...newModels } = app.models
  const { [modelName]: __, ...newSchemaModels } = app._schema.models

  const newSchema = { ...app._schema, models: newSchemaModels }

  // Return the new, more narrowly typed app object.
  const narrowedApp = {
    ...app,
    models: newModels,
    _schema: newSchema,
  }

  return narrowedApp as any
}

/**
 * Dynamically adds a new event definition to an existing GPUI application's schema.
 * This function returns a new `app` object whose schema type includes the new event,
 * enabling type-safe usage of this event throughout the application.
 *
 * @template TApp The existing app type.
 * @template TEventName The name of the new event.
 * @template TPayload The payload type of the new event.
 * @param app The existing GPUI application instance.
 * @param eventName The unique name for the new event.
 * @param payloadDef The payload definition for the event.
 * @returns A new, extended GPUI application instance with the updated schema.
 */
function addEvent<
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
    throw new Error(`[GPUI-TS] Event with name "${eventName}" already exists.`)
  }

  // Create the new, extended schema object.
  const newSchema = {
    ...app._schema,
    events: {
      ...app._schema.events,
      [eventName]: payloadDef,
    },
  }

  // Return a new app object with the updated schema.
  const extendedApp = {
    ...app,
    _schema: newSchema,
  }

  return extendedApp as any
}

// =============================================================================
// HELPER UTILITIES
// =============================================================================

/**
 * Retrieves a nested property value from an object using a dot-separated string path.
 *
 * @param obj The object to traverse.
 * @param path The dot-separated path to the property.
 * @returns The value at the specified path, or undefined if not found.
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

/**
 * Sets a nested property value in an object using a dot-separated string path.
 * Creates intermediate objects if they don't exist.
 *
 * @param obj The object to modify.
 * @param path The dot-separated path to the property.
 * @param value The value to set.
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  const target = keys.reduce((current, key) => {
    if (!(key in current)) current[key] = {}
    return current[key]
  }, obj)
  target[lastKey] = value
}

/**
 * Generates a simple checksum for state snapshots using base64 encoding.
 *
 * @param obj The object to generate a checksum for.
 * @returns A string checksum.
 */
function generateChecksum(obj: any): string {
  return btoa(JSON.stringify(obj)).slice(0, 8)
}

// =============================================================================
// DEVELOPMENT UTILITIES
// =============================================================================

/**
 * Enables development mode with debugging utilities for the GPUI application.
 * Adds global debug helpers to the window object in browser environments.
 *
 * @param app The GPUI application instance.
 */
function enableDevMode(app: ReturnType<typeof createApp>) {
  if (typeof window !== 'undefined') {
    (window as any).__GPUI_DEBUG__ = {
      app,
      models: app.models,
      
      // Debug helpers
      logAllState: () => {
        Object.entries(app.models).forEach(([name, model]) => {
          console.log(`${name}:`, (model as any).read())
        })
      },
      
      // Performance analysis
      analyzePerformance: () => {
        Object.entries(app.models).forEach(([name, model]) => {
          const debug = (model as any).debug()
          console.log(`${name} performance:`, debug.performance)
        })
      },
      
      // State snapshots
      snapshotAll: () => {
        const snapshots: Record<string, any> = {}
        Object.entries(app.models).forEach(([name, model]) => {
          snapshots[name] = (model as any).snapshot()
        })
        return snapshots
      }
    }
  }
}

// =============================================================================
// LIT-HTML INTEGRATION
// =============================================================================

// Re-export lit-html integration
export * from './lit'

// Re-export resource modules
export * from './resource'
export * from './infinite-resource'
// export * from './advanced'
export * from './crdt'
export * from './helpers'
export * from './signals'
export * from './robot'

// =============================================================================
// EXPORTS - PUBLIC API
// =============================================================================

export {
  // Core functions
  createApp,
  addModel,
  removeModel,
  addEvent,
  defineModel,
  createEvent,
  createSubject,
  lens,
  halt,
  enableDevMode,
  createModel,
  getNestedProperty,
  setNestedProperty,

  // Reducer system
  createReducer,
  createReducerModel,

  // Classes
  ModelRegistry,

   // Types
   type ModelAPI,
   type ModelSchema,
   type ModelContext,
   type EventDefinition,
   type EventHandler,
   type Subject,
   type Lens,
   type FocusedModel,
   type Path,
   type PathValue,
   type ValidationResult,
   type ModelSnapshot,
   type ComputedProperty,
   type AppSchema,
   type GPUIApp,
   type GPUIContext,
   type EventScope,
   type DeepReadonly,

   // Reducer types
   type Reducer,
   type Action,
   type ReducerModelConfig
}

// =============================================================================
// USAGE EXAMPLE
// =============================================================================

/*
// Define your app schema
const AppSchema = {
  models: {
    todos: {
      initialState: {
        items: [] as Array<{ id: number; text: string; completed: boolean }>,
        filter: 'all' as 'all' | 'active' | 'completed'
      }
    },
    ui: {
      initialState: {
        newTodoText: '',
        editingId: null as number | null
      }
    }
  }
} satisfies AppSchema

// Create app with full type inference
const app = createApp(AppSchema)

// Create events with composition
const [onAddTodo, emitAddTodo] = createEvent<string>()
const validTodoAdded = onAddTodo
  .filter(text => text.trim().length > 0)
  .map(text => ({ text: text.trim(), id: Date.now(), completed: false }))

// Create reactive subjects
const todos = createSubject(
  [],
  validTodoAdded(todo => todos => [...todos, todo])
)

// Use advanced model features
app.models.todos.updateAt('items.0.completed', completed => !completed)
app.models.todos.subscribeTo(app.models.ui, (ui, todos, ctx) => {
  if (ui.newTodoText.length > 50) {
    ctx.emit({ type: 'warning', message: 'Todo text is getting long' })
  }
})

// Enable development mode
enableDevMode(app)
*/

export * from './helpers'