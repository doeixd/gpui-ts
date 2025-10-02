import { describe, it, expect, beforeEach } from 'vitest'
import { createSelector, createModelSelector, resetSelectorCache, getSelectorDebugInfo, shallowEqual, deepEqual } from '../src/selectors'
import { createApp, createSchema } from '../src/index'

describe('Memoized Selectors', () => {
  describe('createSelector', () => {
    it('should memoize selector results', () => {
      const selector = createSelector(
        [(state: any) => state.a, (state: any) => state.b],
        (a, b) => a + b
      )

      const state1 = { a: 1, b: 2 }
      const state2 = { a: 1, b: 2 } // Same values
      const state3 = { a: 2, b: 2 } // Different a

      expect(selector(state1)).toBe(3)
      expect(selector(state2)).toBe(3) // Should return cached result
      expect(selector(state3)).toBe(4) // Should recompute

      const debug = getSelectorDebugInfo(selector)
      expect(debug.recomputations).toBe(2) // Only two computations
    })

    it('should handle multiple input selectors', () => {
      const selector = createSelector(
        [
          (state: any) => state.x,
          (state: any) => state.y,
          (state: any) => state.z
        ],
        (x, y, z) => x * y * z
      )

      const state = { x: 2, y: 3, z: 4 }
      expect(selector(state)).toBe(24)
    })

    it('should detect changes in input selector results', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.value],
        (value) => {
          callCount++
          return value * 2
        }
      )

      selector({ value: 5 }) // callCount = 1
      selector({ value: 5 }) // cached, callCount still 1
      selector({ value: 10 }) // callCount = 2

      expect(callCount).toBe(2)
    })

    it('should handle complex objects with shallow equality', () => {
      const selector = createSelector(
        [(state: any) => state.items],
        (items) => items.length
      )

      const state1 = { items: [1, 2, 3] }
      const state2 = { items: [1, 2, 3] } // Same content, different reference
      const state3 = { items: [1, 2, 4] } // Different content

      selector(state1) // computes
      selector(state2) // should be cached (shallow equal)
      selector(state3) // should recompute

      const debug = getSelectorDebugInfo(selector)
      expect(debug.recomputations).toBe(2)
    })

    it('should provide debug information', () => {
      const inputSelector = (state: any) => state.value
      const selector = createSelector([inputSelector], (value) => value * 2)

      selector({ value: 1 })

      const debug = getSelectorDebugInfo(selector)
      expect(debug.recomputations).toBe(1)
      expect(debug.dependencies).toEqual([inputSelector])
      expect(debug.hasCache).toBe(true)
    })
  })

  describe('createModelSelector', () => {
    it('should create selectors for GPUI-TS models', () => {
      const app = createApp(createSchema()
        .model('test', { value: 42, name: 'test' })
        .build())

      const selectValue = createModelSelector('test', state => state.value)
      const selectName = createModelSelector('test', state => state.name)

      expect(selectValue(app)).toBe(42)
      expect(selectName(app)).toBe('test')
    })

    it('should work with createSelector', () => {
      const app = createApp(createSchema()
        .model('counter', { count: 10 })
        .model('multiplier', { factor: 2 })
        .build())

      const selectCount = createModelSelector('counter', state => state.count)
      const selectFactor = createModelSelector('multiplier', state => state.factor)

      const selectResult = createSelector(
        [selectCount, selectFactor],
        (count, factor) => count * factor
      )

      expect(selectResult(app)).toBe(20)
    })
  })

  describe('resetSelectorCache', () => {
    it('should reset the selector cache', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.value],
        (value) => {
          callCount++
          return value
        }
      )

      selector({ value: 1 }) // callCount = 1
      selector({ value: 1 }) // cached
      expect(callCount).toBe(1)

      resetSelectorCache(selector)

      selector({ value: 1 }) // should recompute
      expect(callCount).toBe(2)
    })
  })

  describe('Integration with GPUI-TS', () => {
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
      app = createApp(createSchema()
        .model('todos', {
          items: [
            { id: 1, text: 'Buy milk', completed: true },
            { id: 2, text: 'Walk the dog', completed: false },
          ],
          filter: 'all' as 'all' | 'active' | 'completed'
        })
        .build())
    })

    it('should work with real GPUI-TS state', () => {
      const selectItems = createModelSelector('todos', state => state.items)
      const selectFilter = createModelSelector('todos', state => state.filter)

      const selectVisibleTodos = createSelector(
        [selectItems, selectFilter],
        (items, filter) => {
          if (filter === 'completed') return items.filter(item => item.completed)
          if (filter === 'active') return items.filter(item => !item.completed)
          return items
        }
      )

      const selectCompletedCount = createSelector(
        [selectItems],
        (items) => items.filter(item => item.completed).length
      )

      // Initial state
      expect(selectVisibleTodos(app)).toHaveLength(2)
      expect(selectCompletedCount(app)).toBe(1)

      // Change filter
      app.models.todos.update(state => { state.filter = 'active' })
      expect(selectVisibleTodos(app)).toHaveLength(1)
      expect(selectCompletedCount(app)).toBe(1) // Should be cached

      // Complete another todo and change filter to 'all'
      app.models.todos.update(state => {
        state.items[1].completed = true
        state.filter = 'all'
      })
      expect(selectVisibleTodos(app)).toHaveLength(2) // All todos
      expect(selectCompletedCount(app)).toBe(2) // Should recompute
    })

    it('should demonstrate performance benefits', () => {
      let expensiveCallCount = 0

      const selectItems = createModelSelector('todos', state => state.items)
      const selectExpensiveComputation = createSelector(
        [selectItems],
        (items) => {
          expensiveCallCount++
          // Simulate expensive computation
          return items.reduce((sum, item) => sum + item.text.length, 0)
        }
      )

      // First call
      selectExpensiveComputation(app)
      expect(expensiveCallCount).toBe(1)

      // Change unrelated state (filter)
      app.models.todos.update(state => { state.filter = 'completed' })
      selectExpensiveComputation(app) // Should be cached
      expect(expensiveCallCount).toBe(1)

      // Change items
      app.models.todos.update(state => {
        state.items.push({ id: 3, text: 'New todo', completed: false })
      })
      selectExpensiveComputation(app) // Should recompute
      expect(expensiveCallCount).toBe(2)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty input selectors', () => {
      const selector = createSelector(
        [],
        () => 'constant'
      )

      expect(selector({})).toBe('constant')
      expect(selector({})).toBe('constant') // Cached

      const debug = getSelectorDebugInfo(selector)
      expect(debug.recomputations).toBe(1)
    })

    it('should handle selectors that return undefined', () => {
      const selector = createSelector(
        [(state: any) => state.missing],
        (value) => value
      )

      expect(selector({})).toBe(undefined)
      expect(selector({})).toBe(undefined) // Cached
    })

    it('should handle selectors that return null', () => {
      const selector = createSelector(
        [(state: any) => state.value],
        (value) => value
      )

      expect(selector({ value: null })).toBe(null)
      expect(selector({ value: null })).toBe(null) // Cached
      expect(selector({ value: 'not null' })).toBe('not null') // Recomputes
    })
  })

  describe('Custom Equality Functions', () => {
    it('should use shallow equality when specified', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.items],
        (items) => {
          callCount++
          return items.length
        },
        { equalityFn: shallowEqual }
      )

      const items1 = [1, 2, 3]
      const items2 = [1, 2, 3] // Different reference, same values
      const items3 = [1, 2, 4] // Different values

      selector({ items: items1 }) // callCount = 1
      selector({ items: items1 }) // Same reference, cached
      selector({ items: items2 }) // Different reference, should recompute with shallow
      selector({ items: items3 }) // Different values, recompute

      expect(callCount).toBe(3)
    })

    it('should use deep equality by default', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.nested],
        (nested) => {
          callCount++
          return nested.value
        }
      )

      const obj1 = { value: 42, meta: { id: 1 } }
      const obj2 = { value: 42, meta: { id: 1 } } // Different reference, same deep structure
      const obj3 = { value: 43, meta: { id: 1 } } // Different value

      selector({ nested: obj1 }) // callCount = 1
      selector({ nested: obj2 }) // Deep equal, should be cached
      selector({ nested: obj3 }) // Different value, recompute

      expect(callCount).toBe(2)
    })

    it('should support custom equality functions', () => {
      const customEqual = (a: any[], b: any[]) => {
        // a and b are arrays of selector results
        // a[0] and b[0] are the items arrays from the input selector
        // Compare items arrays by their first element
        const itemsA = a[0]
        const itemsB = b[0]
        if (!Array.isArray(itemsA) || !Array.isArray(itemsB)) return false
        return itemsA[0] === itemsB[0]
      }

      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.items],
        (items) => {
          callCount++
          return items[0]
        },
        { equalityFn: customEqual }
      )

      selector({ items: [1, 2, 3] }) // callCount = 1
      selector({ items: [1, 99, 100] }) // First element same, cached
      selector({ items: [2, 2, 3] }) // First element different, recompute

      expect(callCount).toBe(2)
    })
  })

  describe('LRU Cache Strategy', () => {
    it('should cache multiple values with LRU strategy', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.userId],
        (userId) => {
          callCount++
          return `user-${userId}`
        },
        { cacheStrategy: 'lru', maxCacheSize: 3 }
      )

      selector({ userId: 1 }) // callCount = 1
      selector({ userId: 2 }) // callCount = 2
      selector({ userId: 3 }) // callCount = 3
      selector({ userId: 1 }) // Cache hit, callCount = 3
      selector({ userId: 2 }) // Cache hit, callCount = 3
      selector({ userId: 4 }) // Cache miss, evicts 3, callCount = 4
      selector({ userId: 3 }) // Cache miss (was evicted), callCount = 5

      expect(callCount).toBe(5)
    })

    it('should update LRU order on access', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.id],
        (id) => {
          callCount++
          return id * 2
        },
        { cacheStrategy: 'lru', maxCacheSize: 2 }
      )

      selector({ id: 1 }) // Add 1, callCount=1, cache=[1]
      selector({ id: 2 }) // Add 2, callCount=2, cache=[1,2]
      selector({ id: 1 }) // Access 1 (moves to end), callCount=2, cache=[2,1]
      selector({ id: 3 }) // Add 3, evicts 2, callCount=3, cache=[1,3]
      selector({ id: 2 }) // Recompute 2 (was evicted), callCount=4, cache=[3,2]
      selector({ id: 1 }) // Recompute 1 (was evicted), callCount=5

      expect(callCount).toBe(5) // 1, 2, 3, 2, 1 (all recomputed)
    })
  })

  describe('FIFO Cache Strategy', () => {
    it('should cache multiple values with FIFO strategy', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.userId],
        (userId) => {
          callCount++
          return `user-${userId}`
        },
        { cacheStrategy: 'fifo', maxCacheSize: 3 }
      )

      selector({ userId: 1 }) // callCount = 1
      selector({ userId: 2 }) // callCount = 2
      selector({ userId: 3 }) // callCount = 3
      selector({ userId: 1 }) // Cache hit, callCount = 3
      selector({ userId: 4 }) // Cache miss, evicts 1 (first in), callCount = 4
      selector({ userId: 1 }) // Cache miss (was evicted), callCount = 5

      expect(callCount).toBe(5)
    })

    it('should not update order on access (FIFO)', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.id],
        (id) => {
          callCount++
          return id * 2
        },
        { cacheStrategy: 'fifo', maxCacheSize: 2 }
      )

      selector({ id: 1 }) // Add 1
      selector({ id: 2 }) // Add 2
      selector({ id: 1 }) // Access 1 (no change in order)
      selector({ id: 3 }) // Add 3, evicts 1 (first in)
      selector({ id: 1 }) // Recompute 1 (was evicted)

      expect(callCount).toBe(4) // 1, 2, 3, 1 (recomputed)
    })
  })

  describe('Performance with Large Data', () => {
    it('should handle shallow equality efficiently for large arrays', () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => i)

      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.items],
        (items) => {
          callCount++
          return items.length
        },
        { equalityFn: shallowEqual }
      )

      const start = Date.now()
      selector({ items: largeArray })
      selector({ items: largeArray }) // Should be fast (reference check)
      const elapsed = Date.now() - start

      expect(callCount).toBe(1)
      expect(elapsed).toBeLessThan(10) // Should be very fast
    })

    it('should work with LRU cache for varying inputs', () => {
      let callCount = 0
      const selector = createSelector(
        [(state: any) => state.page, (state: any) => state.filter],
        (page, filter) => {
          callCount++
          return `${filter}-${page}`
        },
        { cacheStrategy: 'lru', maxCacheSize: 5 }
      )

      // Simulate pagination with filters
      selector({ page: 1, filter: 'all' })
      selector({ page: 2, filter: 'all' })
      selector({ page: 1, filter: 'active' })
      selector({ page: 1, filter: 'all' }) // Cache hit
      selector({ page: 3, filter: 'completed' })
      selector({ page: 4, filter: 'active' })
      selector({ page: 5, filter: 'completed' })
      selector({ page: 1, filter: 'all' }) // Should still be cached

      expect(callCount).toBeLessThan(8) // Some should be cached
    })
  })
})