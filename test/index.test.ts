import { describe, it, expect, beforeEach } from 'vitest'

// Import from the built ESM version to avoid TypeScript issues
import { createApp, lens } from '../dist/esm/development/index.js'

describe('GPUI-TS Test Suite', () => {
  describe('Basic Functionality', () => {
    it('should create an app with models', () => {
      const app = createApp({
        models: {
          counter: {
            initialState: { count: 0 }
          }
        }
      })

      expect(app.models.counter).toBeDefined()
      expect(app.models.counter.read()).toEqual({ count: 0 })
    })

    it('should update model state', () => {
      const app = createApp({
        models: {
          counter: {
            initialState: { count: 0 }
          }
        }
      })

      app.models.counter.update((state) => {
        state.count = 5
      })

      expect(app.models.counter.read().count).toBe(5)
    })

    it('should support subscriptions', () => {
      const app = createApp({
        models: {
          counter: {
            initialState: { count: 0 }
          }
        }
      })

      let notifiedValue = 0
      const unsubscribe = app.models.counter.onChange((current) => {
        notifiedValue = current.count
      })

       app.models.counter.update((state, ctx) => {
         state.count = 10
         ctx.notify()
       })

      expect(notifiedValue).toBe(10)

      unsubscribe()
    })
  })

  describe('Lens System', () => {
    it('should create and use lenses', () => {
      const userLens = lens(
        (user) => user.name,
        (user, name) => ({ ...user, name })
      )

      const user = { name: 'John', age: 30 }
      expect(userLens.get(user)).toBe('John')

      const updated = userLens.set(user, 'Jane')
      expect(updated.name).toBe('Jane')
      expect(updated.age).toBe(30)
    })

    it('should compose lenses', () => {
      const user = { profile: { name: 'John', settings: { theme: 'dark' } } }

      const profileLens = lens(
        (u) => u.profile,
        (u, p) => ({ ...u, profile: p })
      )

      const settingsLens = lens(
        (p) => p.settings,
        (p, s) => ({ ...p, settings: s })
      )

      const themeLens = lens(
        (s) => s.theme,
        (s, t) => ({ ...s, theme: t })
      )

      const composed = profileLens.compose(settingsLens).compose(themeLens)

      expect(composed.get(user)).toBe('dark')

      const updated = composed.set(user, 'light')
      expect(updated.profile.settings.theme).toBe('light')
    })

    it('should support lens updates', () => {
      const counterLens = lens(
        (state) => state.count,
        (state, count) => ({ ...state, count })
      )

      const state = { count: 5 }
      const updated = counterLens.update(state, (count) => count * 2)
      expect(updated.count).toBe(10)
    })
  })

  describe('Complex State Management', () => {
    it('should handle nested object updates', () => {
      const app = createApp({
        models: {
          user: {
            initialState: {
              id: 1,
              profile: {
                name: 'John',
                email: 'john@example.com'
              },
              settings: {
                theme: 'dark',
                notifications: true
              }
            }
          }
        }
      })

      app.models.user.update((state) => {
        state.profile.name = 'Jane'
        state.settings.theme = 'light'
      })

      const result = app.models.user.read()
      expect(result.profile.name).toBe('Jane')
      expect(result.settings.theme).toBe('light')
      expect(result.id).toBe(1) // unchanged
    })

    it('should handle array operations', () => {
      const app = createApp({
        models: {
          todos: {
            initialState: {
              items: [
                { id: 1, text: 'Learn GPUI', completed: false },
                { id: 2, text: 'Write tests', completed: false }
              ]
            }
          }
        }
      })

      app.models.todos.update((state) => {
        state.items.push({ id: 3, text: 'Deploy app', completed: false })
        state.items[0].completed = true
      })

      const result = app.models.todos.read()
      expect(result.items).toHaveLength(3)
      expect(result.items[0].completed).toBe(true)
      expect(result.items[2].text).toBe('Deploy app')
    })
  })

  describe('Multiple Models', () => {
    it('should manage multiple independent models', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } },
          user: { initialState: { name: 'Anonymous' } },
          settings: { initialState: { theme: 'light' } }
        }
      })

      // Update different models
      app.models.counter.update((state) => { state.count = 5 })
      app.models.user.update((state) => { state.name = 'John' })
      app.models.settings.update((state) => { state.theme = 'dark' })

      expect(app.models.counter.read().count).toBe(5)
      expect(app.models.user.read().name).toBe('John')
      expect(app.models.settings.read().theme).toBe('dark')
    })

    it('should support cross-model subscriptions', () => {
      const app = createApp({
        models: {
          source: { initialState: { value: 10 } },
          derived: { initialState: { doubled: 0 } }
        }
      })

      // Subscribe derived to source changes
      app.models.source.onChange((sourceState) => {
        app.models.derived.update((derivedState) => {
          derivedState.doubled = sourceState.value * 2
        })
      })

       app.models.source.update((state, ctx) => { state.value = 25; ctx.notify() })

      expect(app.models.derived.read().doubled).toBe(50)
    })
  })

  describe('Event System', () => {
    it('should emit and handle events', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      let eventCount = 0
      let lastPayload = null

      const unsubscribe = app.models.counter.onEvent((event) => {
        eventCount++
        lastPayload = event
      })

      app.models.counter.emit({ type: 'increment', amount: 5 })
      app.models.counter.emit({ type: 'decrement', amount: 2 })

      expect(eventCount).toBe(2)
      expect(lastPayload).toEqual({ type: 'decrement', amount: 2 })

      unsubscribe()
    })
  })

  describe('Batch Operations', () => {
    it('should batch multiple updates', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      let notifyCount = 0
      app.models.counter.onChange(() => { notifyCount++ })

      app.models.counter.update((state, ctx) => {
         ctx.batch(() => {
           state.count = 1
           state.count = 2
           state.count = 3
           ctx.notify()
         })
      })

      expect(app.models.counter.read().count).toBe(3)
      expect(notifyCount).toBe(1) // Only one notification for the batch
    })
  })

  describe('Transactions', () => {
    it('should support transactions with rollback', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      expect(() => {
        app.models.counter.transaction(() => {
          app.models.counter.update((state) => { state.count = 10 })
          throw new Error('Transaction failed')
        })
      }).toThrow('Transaction failed')

      // State should be rolled back
      expect(app.models.counter.read().count).toBe(0)
    })

    it('should commit successful transactions', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      app.models.counter.transaction(() => {
        app.models.counter.update((state) => { state.count = 5 })
        app.models.counter.update((state) => { state.count = 10 })
      })

      expect(app.models.counter.read().count).toBe(10)
    })
  })

  describe('Time Travel', () => {
    it('should create and restore snapshots', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      app.models.counter.update((state) => { state.count = 5 })
      const snapshot = app.models.counter.snapshot()

      app.models.counter.update((state) => { state.count = 10 })

      expect(app.models.counter.read().count).toBe(10)

      app.models.counter.restore(snapshot)
      expect(app.models.counter.read().count).toBe(5)
    })
  })

  describe('Validation', () => {
    it('should validate model state', () => {
      const app = createApp({
        models: {
          user: {
            initialState: { name: '', email: '' },
            constraints: {
              validate: (state) => {
                const errors = []
                if (!state.name.trim()) errors.push('Name is required')
                if (!state.email.includes('@')) errors.push('Invalid email')
                return errors.length > 0 ? errors : null
              }
            }
          }
        }
      })

      const result = app.models.user.validate()
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)

      app.models.user.update((state) => {
        state.name = 'John'
        state.email = 'john@example.com'
      })

      const validResult = app.models.user.validate()
      expect(validResult.valid).toBe(true)
      expect(validResult.errors).toHaveLength(0)
    })
  })

  describe('Computed Properties', () => {
    it('should cache computed values', () => {
      const app = createApp({
        models: {
          calculator: {
            initialState: { a: 2, b: 3 }
          }
        }
      })

      const sumComputed = app.models.calculator.compute('sum', (state) => state.a + state.b)
      const productComputed = app.models.calculator.compute('product', (state) => state.a * state.b)

      expect(sumComputed()).toBe(5)
      expect(productComputed()).toBe(6)

      // Update state
      app.models.calculator.update((state) => { state.a = 4 })

      expect(sumComputed()).toBe(7) // Recalculated
      expect(productComputed()).toBe(12) // Recalculated
    })
  })

  describe('Effects and Cleanup', () => {
    it('should handle effects with cleanup', () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      const cleanupCalls: string[] = []

      app.models.counter.update((state, ctx) => {
        ctx.effect((state2, cleanup) => {
          cleanupCalls.push('setup')
          cleanup(() => cleanupCalls.push('cleanup'))
          return () => cleanupCalls.push('effect-cleanup')
        })
      })

      expect(cleanupCalls).toEqual(['setup'])

      app.cleanup()
      expect(cleanupCalls).toEqual(['setup', 'cleanup', 'effect-cleanup'])
    })
  })

  describe('Path Operations', () => {
    it('should read nested paths', () => {
      const app = createApp({
        models: {
          user: {
            initialState: {
              profile: {
                name: 'John',
                address: {
                  city: 'NYC'
                }
              }
            }
          }
        }
      })

      expect(app.models.user.readAt('profile.name')).toBe('John')
      expect(app.models.user.readAt('profile.address.city')).toBe('NYC')
    })

    it('should update nested paths', () => {
      const app = createApp({
        models: {
          user: {
            initialState: {
              profile: {
                name: 'John',
                address: {
                  city: 'NYC'
                }
              }
            }
          }
        }
      })

      app.models.user.updateAt('profile.name', (name) => 'Jane')
      app.models.user.updateAt('profile.address.city', (city) => 'LA')

      const state = app.models.user.read()
      expect(state.profile.name).toBe('Jane')
      expect(state.profile.address.city).toBe('LA')
    })
  })

  describe('Focused Models', () => {
    it('should create focused views', () => {
      const app = createApp({
        models: {
          user: {
            initialState: {
              profile: { name: 'John', age: 30 },
              settings: { theme: 'dark' }
            }
          }
        }
      })

      const profileLens = lens(
        (state) => state.profile,
        (state, profile) => ({ ...state, profile })
      )

      const focused = app.models.user.focus(profileLens)

      expect(focused.read()).toEqual({ name: 'John', age: 30 })

      focused.update((profile) => {
        profile.name = 'Jane'
        profile.age = 31
      })

      expect(app.models.user.read().profile.name).toBe('Jane')
      expect(app.models.user.read().profile.age).toBe(31)
      expect(app.models.user.read().settings.theme).toBe('dark') // unchanged
    })
  })
})