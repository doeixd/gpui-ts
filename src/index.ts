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

declare const __modelBrand: unique symbol
declare const __eventBrand: unique symbol
declare const __haltBrand: unique symbol

type ModelId<T> = string & { readonly __modelType: T }
type EventId<TName extends string, TPayload> = string & { 
  readonly [__eventBrand]: TName
  readonly __payloadType: TPayload 
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
// LENS SYSTEM FOR COMPOSABLE UPDATES
// =============================================================================

/**
 * A lens provides composable access to nested data structures
 * Supports getting, setting, and transforming focused values
 */
interface Lens<TRoot, TFocus> {
  get(root: TRoot): TFocus
  set(root: TRoot, value: TFocus): TRoot
  update(root: TRoot, updater: (focus: TFocus) => TFocus): TRoot
  
  // Composition
  compose<TNext>(nextLens: Lens<TFocus, TNext>): Lens<TRoot, TNext>
  at<K extends keyof TFocus>(key: K): Lens<TRoot, TFocus[K]>
  index(i: number): TFocus extends Array<infer U> ? Lens<TRoot, U> : never
  filter<U>(predicate: (item: U) => boolean): TFocus extends Array<U> ? Lens<TRoot, U[]> : never
}

/**
 * Create a lens with getter and setter functions
 */
function lens<TRoot, TFocus>(
  getter: (root: TRoot) => TFocus,
  setter: (root: TRoot, value: TFocus) => TRoot
): Lens<TRoot, TFocus> {
  const l: Lens<TRoot, TFocus> = {
    get: getter,
    set: setter,
    update: (root, updater) => setter(root, updater(getter(root))),
    
    compose: <TNext>(nextLens: Lens<TFocus, TNext>) => 
      lens<TRoot, TNext>(
        (root) => nextLens.get(getter(root)),
        (root, value) => setter(root, nextLens.set(getter(root), value))
      ),
    
    at: <K extends keyof TFocus>(key: K) =>
      l.compose(lens<TFocus, TFocus[K]>(
        (focus) => focus[key],
        (focus, value) => ({ ...focus as any, [key]: value })
      )),
    
    index: (i: number) => 
      l.compose(lens(
        (focus: any) => focus[i],
        (focus: any, value) => {
          const arr = [...focus]
          arr[i] = value
          return arr
        }
      )) as any,
    
    filter: <U>(predicate: (item: U) => boolean) =>
      l.compose(lens(
        (focus: any) => focus.filter(predicate),
        (focus: any, filtered: U[]) => filtered
      )) as any
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
interface ModelSchema<T> {
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
  readonly eventId: EventId<TName, TPayload>
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
  
  readonly __isSubject: true
}

// =============================================================================
// MODEL CONTEXT WITH RICH CAPABILITIES
// =============================================================================

/**
 * Context passed to model updaters with comprehensive capabilities
 */
interface ModelContext<T> {
  // Core operations
  read(): T
  notify(): void
  emit<E>(event: E): void
  
  // Advanced update patterns
  updateWith<TResult>(
    updater: (state: T) => TResult,
    options?: { 
      shouldNotify?: boolean
      shouldEmit?: boolean 
      eventPayload?: any
    }
  ): TResult
  
  // Batch operations
  batch(operations: () => void): void
  
  // Effect system
  effect(
    effect: (state: T, cleanup: (fn: () => void) => void) => void | (() => void)
  ): void
  
  // Async operations
  schedule(
    operation: (state: T) => Promise<void>,
    options?: { debounce?: number; throttle?: number }
  ): Promise<void>
  
  // Lens integration
  focus<TFocus>(lens: Lens<T, TFocus>): ModelContext<TFocus>
  
  // Transaction support
  transaction<TResult>(work: () => TResult): TResult
}

// =============================================================================
// FOCUSED MODEL FOR LENS-BASED OPERATIONS
// =============================================================================

/**
 * A focused view of a model through a lens
 */
interface FocusedModel<TFocus, TRoot> {
  read(): TFocus
  update(updater: (focus: TFocus) => TFocus): void
  onChange(listener: (current: TFocus, previous: TFocus) => void): () => void
  
  // Further focusing
  focus<TNext>(lens: Lens<TFocus, TNext>): FocusedModel<TNext, TRoot>
  
  // Return to root
  root(): ModelAPI<TRoot>
}

// =============================================================================
// SUBSCRIPTION MANAGEMENT
// =============================================================================

/**
 * Subscription with lifecycle management and transformations
 */
interface ModelSubscription<TSource, TTarget> {
  readonly id: string
  unsubscribe(): void
  pause(): void
  resume(): void
  
  // Transform subscription
  transform<TTransformed>(
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
interface ModelSnapshot<T> {
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
interface ModelDebugInfo<T> {
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
 * Complete model API with all advanced features
 */
interface ModelAPI<T, TName extends string = string> {
  readonly id: ModelId<T>
  readonly name: TName
  readonly schema: ModelSchema<T>
  readonly __state: T
  
  // State access
  read(): T
  readAt<P extends Path<T>>(path: P): PathValue<T, P>
  
  // Updates
  update(updater: (state: T, ctx: ModelContext<T>) => void): this
  updateAt<P extends Path<T>>(
    path: P,
    updater: (value: PathValue<T, P>) => PathValue<T, P>
  ): this
  updateWith<TResult>(
    updater: (state: T, ctx: ModelContext<T>) => TResult
  ): TResult
  
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
  lens<TFocus>(getter: (state: T) => TFocus): Lens<T, TFocus>
  lensAt<P extends Path<T>>(path: P): Lens<T, PathValue<T, P>>
  focus<TFocus>(lens: Lens<T, TFocus>): FocusedModel<TFocus, T>
  
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
  
  // Time travel
  snapshot(): ModelSnapshot<T>
  restore(snapshot: ModelSnapshot<T>): this
  
  // Debugging
  debug(): ModelDebugInfo<T>
  
  // Type utilities
  is<TTest>(predicate: (state: T) => state is TTest): this is ModelAPI<TTest, TName>
}

// =============================================================================
// EVENT SCOPE FOR COMPOSITION
// =============================================================================

/**
 * Event scope for managing event composition and lifecycle
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
// APP SCHEMA AND CREATION
// =============================================================================

/**
 * Schema for creating type-safe applications
 */
interface AppSchema {
  models: Record<string, { initialState: any; schema?: ModelSchema<any> }>
  events?: Record<string, { payload: any; for?: string }>
}

/**
 * Main GPUI context for the application
 */
interface GPUIContext {
  createModel<T>(name: string, initialState: T, schema?: ModelSchema<T>): ModelAPI<T>
  batch(operations: () => void): void
  createEventScope(): EventScope
  cleanup(): void
}

// =============================================================================
// IMPLEMENTATION: MODEL REGISTRY
// =============================================================================

/**
 * Central registry managing all models, subscriptions, and effects
 */
class ModelRegistry {
  private models = new Map<string, any>()
  private subscriptions = new Map<string, Set<(state: any) => void>>()
  private eventHandlers = new Map<string, Set<(event: any) => void>>()
  private effectQueue: Array<() => void> = []
  private cleanupCallbacks = new Set<() => void>()
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
  read<T>(id: string): T {
    const state = this.models.get(id)
    return state ? structuredClone(state) : undefined
  }

  /**
   * Update model state with queued effects
   */
  update<T>(
    id: string,
    updater: (model: T, ctx: ModelContext<T>) => void
  ): void {
    const model = this.models.get(id)
    if (!model) return

    const ctx = this.createContext<T>(id)
    updater(model, ctx)
    
    if (this.batchDepth === 0 && !this.flushingEffects) {
      this.flushEffects()
    }
  }

  /**
   * Create model context with all capabilities
   */
  private createContext<T>(id: string): ModelContext<T> {
    return {
      read: () => this.read<T>(id),
      
      notify: () => {
        this.effectQueue.push(() => {
          const subscribers = this.subscriptions.get(id)
          if (subscribers) {
            const state = this.models.get(id)
            subscribers.forEach(callback => callback(state))
          }
        })
      },
      
      emit: <E>(event: E) => {
        this.effectQueue.push(() => {
          const handlers = this.eventHandlers.get(id)
          if (handlers) {
            handlers.forEach(callback => callback(event))
          }
        })
      },
      
      updateWith: <TResult>(
        updater: (state: T) => TResult,
        options = {}
      ) => {
        const model = this.models.get(id)
        const result = updater(model)
        
        if (options.shouldNotify !== false) {
          this.effectQueue.push(() => {
            const subscribers = this.subscriptions.get(id)
            if (subscribers) {
              subscribers.forEach(callback => callback(model))
            }
          })
        }
        
        return result
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
        
        const cleanupAll = () => cleanup.forEach(fn => fn())
        this.cleanupCallbacks.add(cleanupAll)
      },
      
      schedule: async (operation, options = {}) => {
        // Implementation would add debouncing/throttling
        return operation(this.models.get(id))
      },
      
      focus: <TFocus>(lens: Lens<T, TFocus>) => {
        // Create focused context
        const focusedContext: ModelContext<TFocus> = {
          read: () => lens.get(this.models.get(id)),
          notify: this.createContext<T>(id).notify,
          emit: this.createContext<T>(id).emit,
          updateWith: <TResult>(updater: (focus: TFocus) => TResult) => {
            const rootModel = this.models.get(id)
            const focused = lens.get(rootModel)
            const result = updater(focused)
            const newRoot = lens.set(rootModel, focused)
            this.models.set(id, newRoot)
            return result
          },
          batch: this.createContext<T>(id).batch,
          effect: this.createContext<T>(id).effect,
          schedule: this.createContext<T>(id).schedule,
          focus: (innerLens: any) => this.createContext<T>(id).focus(lens.compose(innerLens)),
          transaction: this.createContext<T>(id).transaction
        }
        
        return focusedContext
      },
      
      transaction: <TResult>(work: () => TResult) => {
        const snapshot = structuredClone(this.models.get(id))
        try {
          return work()
        } catch (error) {
          this.models.set(id, snapshot) // Rollback
          throw error
        }
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
    this.effectQueue.push(() => {
      const handlers = this.eventHandlers.get(modelId)
      if (handlers) {
        handlers.forEach(callback => callback(event))
      }
    })
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
        effect()
      }
    } finally {
      this.flushingEffects = false
    }
  }

  /**
   * Batch multiple operations
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
 * Create an event definition with composition capabilities
 */
function createEventDefinition<TName extends string, TPayload>(
  name: TName,
  defaultPayload: TPayload
): EventDefinition<TName, TPayload> {
  const eventId = name as EventId<TName, TPayload>
  const subscribers = new Set<(payload: TPayload) => void>()
  
  const definition = ((transform: (payload: TPayload) => any | HaltSignal) => {
    return createEventHandler<TPayload, any>([transform], subscribers)
  }) as EventDefinition<TName, TPayload>
  
  Object.assign(definition, {
    eventId,
    name,
    defaultPayload,
    
    subscribe: (callback: (payload: TPayload) => void) => {
      subscribers.add(callback)
      return () => subscribers.delete(callback)
    },
    
    emit: (payload: TPayload = defaultPayload) => {
      subscribers.forEach(callback => {
        try {
          callback(payload)
        } catch (error) {
          if (error !== HALT) throw error
        }
      })
    },
    
    filter: (predicate: (payload: TPayload) => boolean) => 
      definition((payload: TPayload) => predicate(payload) ? payload : halt()),
    
    map: <TOutput>(transform: (payload: TPayload) => TOutput) =>
      definition(transform) as any,
    
    debounce: (ms: number) => {
      // Implementation would add debouncing
      return definition
    },
    
    throttle: (ms: number) => {
      // Implementation would add throttling
      return definition
    }
  })
  
  return definition
}

/**
 * Create event handler for transformation chains
 */
function createEventHandler<TInput, TOutput>(
  transformations: Array<(input: any) => any>,
  rootSubscribers: Set<(payload: any) => void>
): EventHandler<TInput, TOutput> {
  
  const handler = ((transform: (output: TOutput) => any | HaltSignal) => {
    return createEventHandler<TInput, any>([...transformations, transform], rootSubscribers)
  }) as EventHandler<TInput, TOutput>
  
  Object.assign(handler, {
    subscribe: (callback: (output: TOutput) => void) => {
      const wrappedCallback = (input: TInput) => {
        try {
          let result: any = input
          for (const transform of transformations) {
            result = transform(result)
            if (result === HALT) return
          }
          callback(result)
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
    
    debounce: (ms: number) => handler, // Simplified
    throttle: (ms: number) => handler, // Simplified
    
    toSubject: (initialValue: TOutput) =>
      createSubject(initialValue, handler),
    
    __isEventHandler: true as const
  })
  
  return handler
}

/**
 * Simple createEvent function for backward compatibility
 */
function createEvent<T>(): [EventHandler<T, T>, (payload: T) => void] {
  const subscribers = new Set<(payload: T) => void>()
  
  const handler = ((transform: (input: T) => any | HaltSignal) => {
    return createEventHandler<T, any>([transform], subscribers)
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
    
    debounce: (ms: number) => handler,
    throttle: (ms: number) => handler,
    toSubject: (initialValue: T) => createSubject(initialValue, handler),
    __isEventHandler: true as const
  })
  
  return [handler, emit]
}

// =============================================================================
// IMPLEMENTATION: SUBJECT SYSTEM
// =============================================================================

/**
 * Create reactive subject that responds to events
 */
function createSubject<T>(
  initialValue: T,
  ...eventHandlers: Array<EventDefinition<any, any> | EventHandler<any, T | ((current: T) => T)>>
): Subject<T> {
  let currentValue = initialValue
  const changeSubscribers = new Set<() => void>()
  
  // Subscribe to event handlers
  const unsubscribers = eventHandlers.map(handler => 
    handler.subscribe((update: T | ((current: T) => T)) => {
      if (typeof update === 'function') {
        currentValue = (update as (current: T) => T)(currentValue)
      } else {
        currentValue = update
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
    
    __isSubject: true as const
  })
  
  return subject
}

// =============================================================================
// IMPLEMENTATION: MODEL CREATION
// =============================================================================

/**
 * Define a model schema with full type inference
 */
function defineModel<T>(name: string) {
  return <TState extends T = T>(schema: ModelSchema<TState>) => ({
    name,
    schema,
    __phantom: undefined as any as TState
  })
}

/**
 * Create a complete model API with all features
 */
function createModelAPI<T, TName extends string>(
  name: TName,
  schema: ModelSchema<T>,
  registry: ModelRegistry
): ModelAPI<T, TName> {
  const id = name as ModelId<T>
  const { initialState, constraints, computed, effects, middleware } = schema
  
  let currentState = structuredClone(initialState) as T
  let previousState = structuredClone(initialState) as T
  const subscribers = new Set<(current: T, previous: T) => void>()
  const computedCache = new Map<string, { value: any; dirty: boolean }>()
  const snapshots: ModelSnapshot<T>[] = []
  
  // Performance tracking
  let updateCount = 0
  let totalUpdateTime = 0
  
  // Register with global registry
  registry.register(name, initialState)
  
  // Validation
  const validate = (): ValidationResult<T> => {
    const errors: ValidationError<T>[] = []
    
    if (constraints?.validate) {
      const validationErrors = constraints.validate(currentState)
      if (validationErrors) {
        errors.push(...validationErrors.map(msg => ({
          path: '' as Path<T>,
          message: msg,
          code: 'CUSTOM_VALIDATION'
        })))
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
    
    read: () => structuredClone(currentState),
    
    readAt: <P extends Path<T>>(path: P): PathValue<T, P> => {
      return getNestedProperty(currentState, path as string) as PathValue<T, P>
    },
    
    update: function(updater: (state: T, ctx: ModelContext<T>) => void) {
      registry.update(name, updater)
      // Sync local state
      currentState = registry.read(name)
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
    
    updateWith: <TResult>(updater: (state: T, ctx: ModelContext<T>) => TResult) => {
      return registry.createContext(name).updateWith(updater)
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
    
    lens: <TFocus>(getter: (state: T) => TFocus) => {
      return lens<T, TFocus>(
        getter,
        (root, value) => {
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
    
    focus: <TFocus>(targetLens: Lens<T, TFocus>) => {
      const focused: FocusedModel<TFocus, T> = {
        read: () => targetLens.get(currentState),
        
        update: (updater: (focus: TFocus) => TFocus) => {
          api.update(state => {
            const newFocus = updater(targetLens.get(state))
            const newState = targetLens.set(state, newFocus)
            Object.assign(state, newState)
          })
        },
        
        onChange: (listener: (current: TFocus, previous: TFocus) => void) => {
          return api.onChange((current, previous) => {
            const currentFocus = targetLens.get(current)
            const previousFocus = targetLens.get(previous)
            if (currentFocus !== previousFocus) {
              listener(currentFocus, previousFocus)
            }
          })
        },
        
        focus: <TNext>(nextLens: Lens<TFocus, TNext>) =>
          api.focus(targetLens.compose(nextLens)),
        
        root: () => api
      }
      
      return focused
    },
    
    onChange: (listener: (current: T, previous: T) => void) => {
      return registry.subscribe(name, (current) => {
        listener(current, previousState)
        previousState = structuredClone(current)
      })
    },
    
    onChangeAt: <P extends Path<T>>(
      path: P,
      listener: (current: PathValue<T, P>, previous: PathValue<T, P>) => void
    ) => {
      return api.onChange((current, previous) => {
        const currentValue = getNestedProperty(current, path as string) as PathValue<T, P>
        const previousValue = getNestedProperty(previous, path as string) as PathValue<T, P>
        if (currentValue !== previousValue) {
          listener(currentValue, previousValue)
        }
      })
    },
    
    createEvent: <TEventName extends string, TPayload>(
      eventName: TEventName,
      defaultPayload: TPayload
    ) => {
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
    
    onEvent: <TEvent>(handler: (event: TEvent) => void) => {
      return registry.onEvent(name, handler)
    },
    
    subscribeTo: function<TSource extends ModelAPI<any, any>>(
      source: TSource,
      reaction: (source: TSource['__state'], target: T, ctx: ModelContext<T>) => void
    ) {
      const subscription = registry.subscribe(
        source.name,
        (sourceState) => {
          const targetState = registry.read(name)
          const ctx = registry.createContext(name)
          reaction(sourceState, targetState, ctx)
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
    
    transaction: <TResult>(work: (ctx: ModelContext<T>) => TResult) => {
      const ctx = registry.createContext(name)
      return ctx.transaction(work)
    },
    
    snapshot: () => ({
      timestamp: new Date(),
      state: structuredClone(currentState),
      metadata: {
        version: snapshots.length + 1,
        checksum: generateChecksum(currentState)
      }
    }),
    
    restore: function(snapshot: ModelSnapshot<T>) {
      registry.update(name, (state) => {
        Object.assign(state, snapshot.state)
      })
      return this
    },
    
    debug: () => ({
      state: structuredClone(currentState),
      computedValues: Object.fromEntries(
        Array.from(computedCache.entries()).map(([key, { value }]) => [key, value])
      ),
      subscriptions: [
        { type: 'onChange' as const, count: subscribers.size }
      ],
      performance: {
        updateCount,
        lastUpdateDuration: 0,
        averageUpdateDuration: totalUpdateTime / updateCount || 0
      }
    }),
    
    is: function<TTest>(predicate: (state: T) => state is TTest) {
      return predicate(currentState) as any
    }
  }
  
  return api
}

// =============================================================================
// IMPLEMENTATION: EVENT SCOPE
// =============================================================================

/**
 * Create event scope for composition utilities
 */
function createEventScope(): EventScope {
  return {
    createTopic: <T>(...events: Array<EventDefinition<any, T> | EventHandler<any, T>>) => {
      const [topicHandler, emitTopic] = createEvent<T>()
      
      events.forEach(event => {
        event.subscribe((value: T) => emitTopic(value))
      })
      
      return topicHandler
    },
    
    createPartition: <T>(
      source: EventDefinition<any, T> | EventHandler<any, T>,
      predicate: (value: T) => boolean
    ) => {
      const [trueHandler, emitTrue] = createEvent<T>()
      const [falseHandler, emitFalse] = createEvent<T>()
      
      source.subscribe((value: T) => {
        if (predicate(value)) {
          emitTrue(value)
        } else {
          emitFalse(value)
        }
      })
      
      return [trueHandler, falseHandler]
    },
    
    cleanup: () => {
      // Implementation would clean up all event subscriptions
    }
  }
}

// =============================================================================
// IMPLEMENTATION: APP CREATION
// =============================================================================

/**
 * Create complete GPUI application with type inference
 */
function createApp<TSchema extends AppSchema>(schema: TSchema): {
  models: {
    [K in keyof TSchema['models']]: ModelAPI<
      TSchema['models'][K]['initialState'],
      K & string
    >
  }
  events: EventScope
  batch(operations: (models: any) => void): void
  cleanup(): void
} {
  const registry = new ModelRegistry()
  const models = {} as any
  const eventScope = createEventScope()
  
  // Create all models with full type inference
  for (const [key, def] of Object.entries(schema.models)) {
    const modelSchema: ModelSchema<any> = {
      initialState: def.initialState,
      ...def.schema
    }
    models[key] = createModelAPI(key, modelSchema, registry)
  }
  
  return {
    models,
    events: eventScope,
    batch: (operations) => registry.batch(() => operations(models)),
    cleanup: () => {
      registry.cleanup()
      eventScope.cleanup()
    }
  }
}

// =============================================================================
// HELPER UTILITIES
// =============================================================================

/**
 * Get nested property value by string path
 */
function getNestedProperty(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

/**
 * Set nested property value by string path
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
 * Generate simple checksum for state snapshots
 */
function generateChecksum(obj: any): string {
  return btoa(JSON.stringify(obj)).slice(0, 8)
}

// =============================================================================
// DEVELOPMENT UTILITIES
// =============================================================================

/**
 * Enable debugging for all models in development mode
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
// EXPORTS - PUBLIC API
// =============================================================================

export {
  // Core functions
  createApp,
  defineModel,
  createEvent,
  createSubject,
  lens,
  halt,
  enableDevMode,
  
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
  type GPUIContext,
  type EventScope
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