/**
 * GPUI-TS Memoized Selectors
 * ===========================
 *
 * Framework-agnostic, performant memoized selectors inspired by reselect.
 * Provides automatic memoization for derived state computations, preventing
 * unnecessary recalculations when input dependencies haven't changed.
 *
 * Features:
 * - Type-safe selector composition
 * - Shallow equality checking for inputs
 * - Framework agnostic (works with any state shape)
 * - Debug metadata for performance monitoring
 * - Zero dependencies
 */

// =============================================================================
// SELECTOR TYPES
// =============================================================================

/**
 * A selector is a function that extracts a value from a given state.
 */
export type Selector<TState, TResult> = (state: TState) => TResult

/**
 * A utility type to infer the result types of an array of selectors.
 */
type SelectorResults<T extends readonly Selector<any, any>[]> = {
  [K in keyof T]: T[K] extends Selector<any, infer R> ? R : never
}

/**
 * Equality comparison function type.
 */
export type EqualityFn = (a: any, b: any) => boolean

/**
 * Cache strategy for selectors.
 */
export type CacheStrategy = 'unbounded' | 'lru' | 'fifo'

/**
 * Configuration options for createSelector.
 */
export interface SelectorOptions {
  /**
   * Custom equality function for comparing input selector results.
   * Defaults to deep equality.
   */
  equalityFn?: EqualityFn

  /**
   * Cache strategy to use. Defaults to 'unbounded'.
   * - 'unbounded': Keep all cached values (default)
   * - 'lru': Keep only the N most recently used values
   * - 'fifo': Keep only the N most recently added values
   */
  cacheStrategy?: CacheStrategy

  /**
   * Maximum cache size when using 'lru' or 'fifo' strategies.
   * Defaults to 1 for single-value memoization.
   */
  maxCacheSize?: number
}

// =============================================================================
// EQUALITY CHECKING
// =============================================================================

/**
 * A shallow equality check for arrays.
 * Compares array length and elements by reference.
 */
export function shallowEqual(a: any, b: any): boolean {
  if (a === b) return true

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }

  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (a[key] !== b[key]) return false
    }
    return true
  }

  return false
}

/**
 * A deep equality check for arrays and objects.
 * Recursively compares elements and properties.
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (!(key in b) || !deepEqual(a[key], b[key])) return false
    }
    return true
  }

  return false
}

// =============================================================================
// CACHE IMPLEMENTATIONS
// =============================================================================

interface CacheEntry<T> {
  args: any[]
  result: T
  timestamp: number
}

class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number
  private keyCounter: number = 0

  constructor(maxSize: number = 1) {
    this.maxSize = Math.max(1, maxSize)
  }

  get(args: readonly any[], equalityFn: EqualityFn): T | undefined {
    for (const [key, entry] of this.cache.entries()) {
      if (equalityFn(entry.args, args as any[])) {
        // Move to end (most recently used)
        this.cache.delete(key)
        this.cache.set(key, { ...entry, timestamp: Date.now() })
        return entry.result
      }
    }
    return undefined
  }

  set(args: readonly any[], result: T): void {
    if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first entry)
      const firstKey = this.cache.keys().next().value as string | undefined
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }

    const key = String(this.keyCounter++)
    this.cache.set(key, { args: args as any[], result, timestamp: Date.now() })
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

class FIFOCache<T> {
  private cache: CacheEntry<T>[] = []
  private maxSize: number

  constructor(maxSize: number = 1) {
    this.maxSize = Math.max(1, maxSize)
  }

  get(args: readonly any[], equalityFn: EqualityFn): T | undefined {
    const entry = this.cache.find(e => equalityFn(e.args, args as any[]))
    return entry?.result
  }

  set(args: readonly any[], result: T): void {
    if (this.cache.length >= this.maxSize) {
      // Remove first in (oldest)
      this.cache.shift()
    }
    this.cache.push({ args: args as any[], result, timestamp: Date.now() })
  }

  clear(): void {
    this.cache = []
  }

  get size(): number {
    return this.cache.length
  }
}

// =============================================================================
// CREATE SELECTOR IMPLEMENTATION
// =============================================================================

/**
 * Creates a memoized selector. The selector will only recompute its result if
 * the values returned by its input selectors have changed.
 *
 * @template TState The type of the state object
 * @template TInputSelectors An array of input selector functions
 * @template TResult The type of the final computed result
 * @param inputSelectors An array of functions that extract values from the state
 * @param combiner A function that takes the results of the input selectors and returns a final value
 * @param options Optional configuration for equality checking and caching strategy
 * @returns A new, memoized selector function
 *
 * @example
 * ```ts
 * // Default: deep equality with unbounded cache
 * const selectVisibleTodos = createSelector(
 *   [selectTodos, selectFilter],
 *   (items, filter) => items.filter(item => ...)
 * )
 *
 * // Shallow equality for better performance
 * const selectCount = createSelector(
 *   [selectItems],
 *   (items) => items.length,
 *   { equalityFn: shallowEqual }
 * )
 *
 * // LRU cache with max 10 entries
 * const selectUserData = createSelector(
 *   [selectUserId],
 *   (userId) => expensiveComputation(userId),
 *   { cacheStrategy: 'lru', maxCacheSize: 10 }
 * )
 * ```
 */
export function createSelector<
  TState,
  TInputSelectors extends readonly Selector<TState, any>[],
  TResult
>(
  inputSelectors: [...TInputSelectors],
  combiner: (...args: SelectorResults<TInputSelectors>) => TResult,
  options: SelectorOptions = {}
): Selector<TState, TResult> {
  const {
    equalityFn = deepEqual,
    cacheStrategy = 'unbounded',
    maxCacheSize = 1
  } = options

  // Simple unbounded cache (original behavior)
  let lastArgs: SelectorResults<TInputSelectors> | null = null
  let lastResult: TResult | null = null

  // Advanced cache strategies
  let lruCache: LRUCache<TResult> | null = null
  let fifoCache: FIFOCache<TResult> | null = null

  if (cacheStrategy === 'lru') {
    lruCache = new LRUCache<TResult>(maxCacheSize)
  } else if (cacheStrategy === 'fifo') {
    fifoCache = new FIFOCache<TResult>(maxCacheSize)
  }

  const memoizedSelector: Selector<TState, TResult> = (state: TState) => {
    // 1. Get the new arguments by running the input selectors.
    const newArgs = inputSelectors.map(selector => selector(state)) as SelectorResults<TInputSelectors>

    // 2. Check cache based on strategy
    if (cacheStrategy === 'lru' && lruCache) {
      const cached = lruCache.get(newArgs, equalityFn)
      if (cached !== undefined) {
        return cached
      }
      const result = combiner(...newArgs)
      lruCache.set(newArgs, result)
      ;(memoizedSelector as any).recomputations++
      return result
    } else if (cacheStrategy === 'fifo' && fifoCache) {
      const cached = fifoCache.get(newArgs, equalityFn)
      if (cached !== undefined) {
        return cached
      }
      const result = combiner(...newArgs)
      fifoCache.set(newArgs, result)
      ;(memoizedSelector as any).recomputations++
      return result
    } else {
      // Unbounded strategy (default)
      if (lastArgs && equalityFn(newArgs, lastArgs)) {
        return lastResult!
      }

      // 3. Re-compute the result
      lastArgs = newArgs
      lastResult = combiner(...newArgs)
      ;(memoizedSelector as any).recomputations++
      return lastResult
    }
  }

  // Attach metadata and cache references for debugging and reset functionality
  ;(memoizedSelector as any).recomputations = 0
  ;(memoizedSelector as any).dependencies = inputSelectors
  ;(memoizedSelector as any).options = options
  ;(memoizedSelector as any).cache = lruCache || fifoCache

  // Attach cache references so resetSelectorCache can access them
  ;(memoizedSelector as any).lastArgs = lastArgs
  ;(memoizedSelector as any).lastResult = lastResult
  ;(memoizedSelector as any).resetCache = () => {
    lastArgs = null
    lastResult = null
    if (lruCache) lruCache.clear()
    if (fifoCache) fifoCache.clear()
    ;(memoizedSelector as any).recomputations = 0
  }

  return memoizedSelector
}

// =============================================================================
// GPUI-TS SPECIFIC SELECTORS
// =============================================================================

/**
 * Creates a selector that extracts data from a specific GPUI-TS model.
 * This is a convenience wrapper around createSelector for common GPUI-TS patterns.
 *
 * @template TApp The app type
 * @template TModelName The name of the model to select from
 * @template TResult The result type
 * @param modelName The name of the model
 * @param selector A function that extracts data from the model's state
 * @returns A memoized selector for the model data
 *
 * @example
 * ```ts
 * const selectTodoItems = createModelSelector('todos', state => state.items)
 * const selectCompletedCount = createSelector(
 *   [selectTodoItems],
 *   items => items.filter(item => item.completed).length
 * )
 * ```
 */
export function createModelSelector<
  TApp extends { models: Record<string, { read(): any }> },
  TModelName extends keyof TApp['models'] & string,
  TResult
>(
  modelName: TModelName,
  selector: (state: ReturnType<TApp['models'][TModelName]['read']>) => TResult
): Selector<TApp, TResult> {
  return (appState: TApp) => {
    const modelState = appState.models[modelName].read()
    return selector(modelState)
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Resets the memoization cache of a selector.
 * This forces the selector to recompute on the next call.
 *
 * @param selector The selector to reset
 */
export function resetSelectorCache(selector: Selector<any, any>): void {
  // Use the attached resetCache method if available
  const sel = selector as any
  if (typeof sel.resetCache === 'function') {
    sel.resetCache()
  }
}

/**
 * Gets debug information about a selector's performance.
 *
 * @param selector The selector to inspect
 * @returns Debug information including recomputation count
 */
export function getSelectorDebugInfo(selector: Selector<any, any>) {
  const sel = selector as any
  return {
    recomputations: sel.recomputations || 0,
    dependencies: sel.dependencies || [],
    hasCache: sel.recomputations > 0 // If it has been computed at least once, it has cache
  }
}

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/*
Example usage with GPUI-TS:

```ts
import { createApp, createSchema } from 'gpui-ts'
import { createSelector, createModelSelector } from 'gpui-ts/selectors'

const AppSchema = createSchema()
  .model('todos', {
    items: [
      { id: 1, text: 'Buy milk', completed: true },
      { id: 2, text: 'Walk the dog', completed: false },
    ],
    filter: 'all' as 'all' | 'active' | 'completed'
  })
  .build()

const app = createApp(AppSchema)

// --- Define Selectors ---

// Input selectors extract raw data from the models.
const selectItems = createModelSelector(app, 'todos', state => state.items)
const selectFilter = createModelSelector(app, 'todos', state => state.filter)

// Memoized selector for completed count. Only re-runs if `items` changes.
const selectCompletedCount = createSelector(
  [selectItems],
  (items) => {
    console.log('Calculating completed count...')
    return items.filter(item => item.completed).length
  }
)

// Memoized selector for visible todos. Only re-runs if `items` or `filter` changes.
const selectVisibleTodos = createSelector(
  [selectItems, selectFilter],
  (items, filter) => {
    console.log('Filtering visible todos...')
    if (filter === 'completed') return items.filter(item => item.completed)
    if (filter === 'active') return items.filter(item => !item.completed)
    return items
  }
)

// --- Using the Selectors ---

console.log('Initial run:')
selectVisibleTodos(app) // "Filtering visible todos..." is logged
selectCompletedCount(app) // "Calculating completed count..." is logged

console.log('\nRunning again with no state change:')
selectVisibleTodos(app) // Nothing is logged, returns cached result
selectCompletedCount(app) // Nothing is logged, returns cached result

console.log('\nChanging filter:')
app.models.todos.update(state => { state.filter = 'active' })
selectVisibleTodos(app) // "Filtering visible todos..." is logged
selectCompletedCount(app) // Nothing is logged, `items` didn't change

console.log('\nCompleting a todo:')
app.models.todos.update(state => {
  state.items[1].completed = true
})
selectVisibleTodos(app) // "Filtering visible todos..." is logged
selectCompletedCount(app) // "Calculating completed count..." is logged
```
*/