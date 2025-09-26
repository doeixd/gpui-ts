import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, lens } from '../dist/esm/development/index.js'

describe('Edge Cases and Error Handling', () => {
  describe('Error Handling', () => {
    it('should handle invalid model updates gracefully', () => {
      const app = createApp({
        models: {
          test: { initialState: { value: 0 } }
        }
      })

      // Invalid update that throws
      expect(() => {
        app.models.test.update(() => {
          throw new Error('Update failed')
        })
      }).toThrow('Update failed')

      // State should remain unchanged
      expect(app.models.test.read().value).toBe(0)
    })

    it('should handle validation errors in updates', () => {
      const app = createApp({
        models: {
          user: {
            initialState: { name: 'John', email: '' },
            schema: {
              constraints: {
                validate: (state) => {
                  const errors = []
                  if (!state.email.includes('@')) {
                    errors.push('Invalid email format')
                  }
                  return errors.length > 0 ? errors : null
                }
              }
            }
          }
        }
      })

      // Update that would cause validation error
      app.models.user.update(state => {
        state.email = 'invalid-email'
      })

      const validation = app.models.user.validate()
      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.message.includes('email'))).toBe(true)
    })

    it('should handle circular dependencies in computed properties', () => {
      const app = createApp({
        models: {
          a: { initialState: { value: 1 } },
          b: { initialState: { value: 2 } }
        }
      })

      // Create circular subscription
      app.models.a.onChange(() => {
        app.models.b.update(s => s.value++)
      })

      app.models.b.onChange(() => {
        app.models.a.update(s => s.value++)
      })

      // This should not cause infinite loop
      app.models.a.update((s, ctx) => { s.value = 10; ctx.notify() })

      // Values should be updated
      expect(app.models.a.read().value).toBe(10)
      expect(app.models.b.read().value).toBe(3)
    })

    it('should handle memory leaks from unsubscribed listeners', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      let callCount = 0
      const listeners: (() => void)[] = []

      // Add many listeners
      for (let i = 0; i < 100; i++) {
        listeners.push(app.models.counter.onChange(() => {
          callCount++
        }))
      }

      app.models.counter.update((s, ctx) => { s.count++; ctx.notify() })

      expect(callCount).toBe(100)

      // Unsubscribe half of them
      listeners.slice(0, 50).forEach(unsubscribe => unsubscribe())

      app.models.counter.update((s, ctx) => { s.count++; ctx.notify() })

      expect(callCount).toBe(150) // Only 50 more calls
    })

    it('should handle deep nested object updates safely', () => {
      const app = createApp({
        models: {
          data: {
            initialState: {
              level1: {
                level2: {
                  level3: {
                    value: 'deep'
                  }
                }
              }
            }
          }
        }
      })

      // Safe deep update
      app.models.data.updateAt('level1.level2.level3.value', (v) => 'updated')

      expect(app.models.data.read().level1.level2.level3.value).toBe('updated')

      // Attempt to update non-existent path should not crash
      expect(() => {
        app.models.data.updateAt('non.existent.path', (v) => 'test')
      }).not.toThrow()
    })

    it('should handle transactions with errors', () => {
      const app = createApp({
        models: {
          account: { initialState: { balance: 100 } }
        }
      })

      expect(() => {
        app.models.account.transaction(() => {
          app.models.account.update(s => s.balance -= 50)
          throw new Error('Transaction failed')
          app.models.account.update(s => s.balance -= 30)
        })
      }).toThrow('Transaction failed')

      // Balance should be rolled back
      expect(app.models.account.read().balance).toBe(100)
    })
  })

  describe('Performance Edge Cases', () => {
    it('should handle large datasets efficiently', () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        name: `Item ${i}`,
        value: Math.random()
      }))

      const app = createApp({
        models: {
          list: { initialState: { items: largeData } }
        }
      })

      const startTime = performance.now()

      // Bulk update
      app.models.list.update(state => {
        state.items = state.items.map(item => ({
          ...item,
          processed: true
        }))
      })

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100)

      expect(app.models.list.read().items.every(item => item.processed)).toBe(true)
    })

    it('should handle frequent updates without performance degradation', async () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      const updates: number[] = []

      const unsubscribe = app.models.counter.onChange((current, previous) => {
        updates.push(current.count)
      })

      const startTime = performance.now()

      // Rapid updates
      for (let i = 0; i < 1000; i++) {
        app.models.counter.update((s, ctx) => { s.count = i; ctx.notify() })
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete in reasonable time (< 200ms)
      expect(duration).toBeLessThan(200)
      expect(updates.length).toBe(1000)
      expect(app.models.counter.read().count).toBe(999)

      unsubscribe()
    })

    it('should handle complex lens operations efficiently', () => {
      const complexState = {
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          profile: {
            name: `User ${i}`,
            settings: {
              theme: 'light',
              notifications: true
            }
          }
        }))
      }

      const app = createApp({
        models: {
          app: { initialState: complexState }
        }
      })

      const userLens = lens(
        (state) => state.users,
        (state, users) => ({ ...state, users })
      )

      const firstUserLens = userLens.index(0)
      const settingsLens = firstUserLens.at('profile').at('settings')

      const startTime = performance.now()

      // Complex lens update
      const focused = app.models.app.focus(settingsLens)
      focused.update(settings => ({
        ...settings,
        theme: 'dark'
      }))

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete quickly
      expect(duration).toBeLessThan(50)

      const result = app.models.app.read()
      expect(result.users[0].profile.settings.theme).toBe('dark')
    })
  })

  describe('Memory Management', () => {
    it('should clean up resources when models are destroyed', () => {
      const app = createApp({
        models: {
          temp: { initialState: { data: 'test' } }
        }
      })

      let cleanupCalled = false

      app.models.temp.update((state, ctx) => {
        ctx.effect(() => {
          return () => cleanupCalled = true
        })
      })

      // Simulate cleanup
      app.cleanup()

      expect(cleanupCalled).toBe(true)
    })

    it('should handle cross-model subscriptions cleanup', () => {
      const app = createApp({
        models: {
          source: { initialState: { value: 1 } },
          target: { initialState: { value: 0 } }
        }
      })

      let subscriptionCallCount = 0

      const subscription = app.models.source.subscribeTo(app.models.target, (source, target, ctx) => {
        subscriptionCallCount++
      })

      app.models.target.update((s, ctx) => { s.value = 10; ctx.notify() })
      expect(subscriptionCallCount).toBe(1)

      // Unsubscribe
      subscription.unsubscribe()

      app.models.target.update((s, ctx) => { s.value = 20; ctx.notify() })
      expect(subscriptionCallCount).toBe(1) // Should not increase
    })

    it('should prevent memory leaks from event listeners', () => {
      const app = createApp({
        models: {
          events: { initialState: { count: 0 } }
        }
      })

      let eventCount = 0
      const unsubscribers: (() => void)[] = []

      // Add many event listeners
      for (let i = 0; i < 100; i++) {
        unsubscribers.push(app.models.events.onEvent(() => {
          eventCount++
        }))
      }

      app.models.events.emit({ type: 'test' })
      expect(eventCount).toBe(100)

      // Unsubscribe all
      unsubscribers.forEach(unsubscribe => unsubscribe())

      app.models.events.emit({ type: 'test' })
      expect(eventCount).toBe(100) // Should not increase
    })
  })

  describe('Type Safety Edge Cases', () => {
    it('should handle type-safe path operations', () => {
      const app = createApp({
        models: {
          nested: {
            initialState: {
              user: {
                profile: {
                  name: 'John',
                  age: 30
                }
              }
            }
          }
        }
      })

      // Type-safe path reading
      const name = app.models.nested.readAt('user.profile.name')
      expect(name).toBe('John')

      // Type-safe path updating
      app.models.nested.updateAt('user.profile.age', (age) => age + 1)
      expect(app.models.nested.read().user.profile.age).toBe(31)
    })

    it('should handle lens composition type safety', () => {
      const state = {
        users: [
          { id: 1, name: 'John', settings: { theme: 'light' } }
        ]
      }

      const app = createApp({
        models: {
          app: { initialState: state }
        }
      })

        // Create individual lenses
        const usersLens = lens(
          (s: typeof state) => s.users,
          (s: typeof state, users) => ({ ...s, users })
        )

        const userAtIndexLens = lens(
          (users: any[]) => users[0],
          (users: any[], user) => [user, ...users.slice(1)]
        )

        const settingsLens = lens(
          (user: any) => user.settings,
          (user: any, settings) => ({ ...user, settings })
        )

        // Compose them properly: users -> first user -> settings
        const composed = usersLens.compose(userAtIndexLens).compose(settingsLens)

        const root = app.models.app.read()
        expect(root.users[0].settings.theme).toBe('light')

        const updated = composed.set(root, { theme: 'dark' })
        expect(updated.users[0].settings.theme).toBe('dark')
    })
  })

  describe('Concurrency and Race Conditions', () => {
    it('should handle concurrent updates safely', async () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      const promises = []

      // Concurrent updates
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise<void>(resolve => {
            setTimeout(() => {
              app.models.counter.update((s, ctx) => { s.count++; ctx.notify() })
              resolve()
            }, Math.random() * 10)
          })
        )
      }

      await Promise.all(promises)

      expect(app.models.counter.read().count).toBe(100)
    })

    it('should handle batched operations correctly', () => {
      const app = createApp({
        models: {
          multi: { initialState: { a: 1, b: 2, c: 3 } }
        }
      })

      let notifyCount = 0
      app.models.multi.onChange(() => notifyCount++)

      // Batch multiple updates
       app.models.multi.update((state, ctx) => {
         ctx.batch(() => {
           state.a = 10
           state.b = 20
           state.c = 30
           ctx.notify()
         })
       })

      expect(app.models.multi.read()).toEqual({ a: 10, b: 20, c: 30 })
      expect(notifyCount).toBe(1) // Only one notification for the batch
    })

    it('should handle async operations in effects', async () => {
      const app = createApp({
        models: {
          async: { initialState: { loading: false, data: null } }
        }
      })

      let effectCompleted = false

      app.models.async.update((state, ctx) => {
        ctx.effect(async () => {
          state.loading = true
          await new Promise(resolve => setTimeout(resolve, 10))
          state.data = 'loaded'
          state.loading = false
          effectCompleted = true
        })
      })

      // Wait for async effect
      await new Promise(resolve => setTimeout(resolve, 20))

      const result = app.models.async.read()
      expect(result.loading).toBe(false)
      expect(result.data).toBe('loaded')
      expect(effectCompleted).toBe(true)
    })
  })

  describe('Boundary Conditions', () => {
    it('should handle empty and null values', () => {
      const app = createApp({
        models: {
          empty: {
            initialState: {
              array: [],
              object: {},
              string: '',
              number: 0,
              boolean: false,
              null: null,
              undefined: undefined
            }
          }
        }
      })

      const state = app.models.empty.read()
      expect(state.array).toEqual([])
      expect(state.object).toEqual({})
      expect(state.string).toBe('')
      expect(state.number).toBe(0)
      expect(state.boolean).toBe(false)
      expect(state.null).toBe(null)
      expect(state.undefined).toBe(undefined)
    })

    it('should handle extreme values', () => {
      const app = createApp({
        models: {
          extreme: {
            initialState: {
              maxNumber: Number.MAX_SAFE_INTEGER,
              minNumber: Number.MIN_SAFE_INTEGER,
              maxString: 'a'.repeat(10000),
              deepNesting: {} as any
            }
          }
        }
      })

      // Create deep nesting
      let current = app.models.extreme.read().deepNesting
      for (let i = 0; i < 100; i++) {
        current[`level${i}`] = {}
        current = current[`level${i}`]
      }

      expect(() => {
        app.models.extreme.update(state => {
          state.deepNesting = state.deepNesting // Trigger change detection
        })
      }).not.toThrow()
    })

    it('should handle special characters and unicode', () => {
      const app = createApp({
        models: {
          unicode: {
            initialState: {
              emoji: '🚀🌟💻',
              special: '!@#$%^&*()',
              unicode: '你好世界',
              mixed: 'Hello 世界 🚀'
            }
          }
        }
      })

      const state = app.models.unicode.read()
      expect(state.emoji).toBe('🚀🌟💻')
      expect(state.special).toBe('!@#$%^&*()')
      expect(state.unicode).toBe('你好世界')
      expect(state.mixed).toBe('Hello 世界 🚀')
    })
  })
})