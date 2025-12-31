/**
 * Tests for Functional Controller Pattern Utilities
 * Tests createModelEvent and createModelSubject utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp, createModelEvent, createModelSubject, lens } from '../src/index'

describe('Functional Controller Pattern', () => {
  describe('createModelEvent', () => {
    describe('with ModelAPI', () => {
      it('should create event that updates model when emitted', () => {
        const app = createApp({
          models: {
            counter: { initialState: { count: 0 } }
          }
        })

        const [handler, emit] = createModelEvent(
          app.models.counter,
          (amount: number, state) => {
            state.count += amount
          }
        )

        expect(app.models.counter.read().count).toBe(0)
        emit(5)
        expect(app.models.counter.read().count).toBe(5)
        emit(3)
        expect(app.models.counter.read().count).toBe(8)
      })

      it('should provide context to handler', () => {
        const app = createApp({
          models: {
            user: { initialState: { name: '', email: '' } }
          }
        })

        let contextProvided = false
        let notifyCalled = false

        const [handler, emit] = createModelEvent(
          app.models.user,
          (name: string, state, ctx) => {
            state.name = name
            contextProvided = ctx !== undefined
            if (ctx) {
              // Verify we can call context methods
              // ctx.notify() is already called by createModelEvent
              notifyCalled = true
            }
          }
        )

        emit('Alice')
        expect(contextProvided).toBe(true)
        expect(notifyCalled).toBe(true)
      })

      it('should trigger reactive subscriptions', () => {
        const app = createApp({
          models: {
            todos: {
              initialState: {
                items: [] as Array<{ id: number; text: string; completed: boolean }>
              }
            }
          }
        })

        let changeCount = 0
        let lastState: any = null

        app.models.todos.onChange((current) => {
          changeCount++
          lastState = current
        })

        const [handler, emit] = createModelEvent(
          app.models.todos,
          (text: string, state) => {
            state.items.push({ id: Date.now(), text, completed: false })
          }
        )

        emit('Buy milk')
        expect(changeCount).toBe(1)
        expect(lastState.items).toHaveLength(1)
        expect(lastState.items[0].text).toBe('Buy milk')

        emit('Walk dog')
        expect(changeCount).toBe(2)
        expect(lastState.items).toHaveLength(2)
      })

      it('should support event transformation chains', () => {
        const app = createApp({
          models: {
            logs: { initialState: { messages: [] as string[] } }
          }
        })

        const [handler, emit] = createModelEvent(
          app.models.logs,
          (message: string, state) => {
            state.messages.push(message)
          }
        )

        const filtered = handler
          .filter(msg => msg.length > 5)
          .map(msg => msg.toUpperCase())

        const results: string[] = []
        filtered.subscribe(msg => results.push(msg))

        emit('hi')      // Filtered out (too short)
        emit('hello')   // Filtered out (exactly 5 chars)
        emit('hello world')  // Passes through

        expect(results).toEqual(['HELLO WORLD'])
        expect(app.models.logs.read().messages).toEqual(['hi', 'hello', 'hello world'])
      })

      it('should handle errors with automatic rollback', () => {
        const app = createApp({
          models: {
            counter: { initialState: { count: 0 } }
          }
        })

        const [handler, emit] = createModelEvent(
          app.models.counter,
          (amount: number, state) => {
            state.count += amount
            if (state.count > 10) {
              throw new Error('Count exceeded limit')
            }
          }
        )

        emit(5)
        expect(app.models.counter.read().count).toBe(5)

        // This should throw and rollback
        expect(() => emit(10)).toThrow('Count exceeded limit')

        // State should be rolled back to 5
        expect(app.models.counter.read().count).toBe(5)
      })

      it('should infer types correctly', () => {
        const app = createApp({
          models: {
            user: { initialState: { name: '', age: 0 } }
          }
        })

        // This should compile with proper type inference
        const [handler, emit] = createModelEvent(
          app.models.user,
          (data: { name: string; age: number }, state, ctx) => {
            state.name = data.name
            state.age = data.age
            // ctx should be optional but available
            ctx?.notify()
          }
        )

        emit({ name: 'Alice', age: 30 })
        expect(app.models.user.read()).toEqual({ name: 'Alice', age: 30 })
      })

      it('should support void payload', () => {
        const app = createApp({
          models: {
            counter: { initialState: { count: 0 } }
          }
        })

        const [handler, emit] = createModelEvent(
          app.models.counter,
          (_payload, state) => {
            state.count++
          }
        )

        emit()
        expect(app.models.counter.read().count).toBe(1)
        emit()
        expect(app.models.counter.read().count).toBe(2)
      })
    })

    describe('with FocusedModel', () => {
      it('should create event that updates focused model', () => {
        const app = createApp({
          models: {
            user: {
              initialState: {
                profile: { name: '', bio: '' },
                settings: { theme: 'light' }
              }
            }
          }
        })

        const profileLens = lens(
          (state: typeof app.models.user.__state) => state.profile,
          (state, profile) => ({ ...state, profile })
        )

        const focused = app.models.user.focus(profileLens)

        const [handler, emit] = createModelEvent(
          focused,
          (bio: string, state) => {
            state.bio = bio
          }
        )

        emit('Software engineer')
        expect(app.models.user.read().profile.bio).toBe('Software engineer')
      })

      it('should have undefined context for FocusedModel', () => {
        const app = createApp({
          models: {
            user: { initialState: { profile: { name: 'Alice' } } }
          }
        })

        const profileLens = lens(
          (state: typeof app.models.user.__state) => state.profile,
          (state, profile) => ({ ...state, profile })
        )

        const focused = app.models.user.focus(profileLens)

        let contextWasUndefined = false

        const [handler, emit] = createModelEvent(
          focused,
          (name: string, state, ctx) => {
            state.name = name
            contextWasUndefined = ctx === undefined
          }
        )

        emit('Bob')
        expect(contextWasUndefined).toBe(true)
        expect(app.models.user.read().profile.name).toBe('Bob')
      })

      it('should trigger reactive subscriptions on root model', () => {
        const app = createApp({
          models: {
            user: {
              initialState: {
                profile: { name: 'Alice', bio: '' }
              }
            }
          }
        })

        const profileLens = lens(
          (state: typeof app.models.user.__state) => state.profile,
          (state, profile) => ({ ...state, profile })
        )

        const focused = app.models.user.focus(profileLens)

        let changeCount = 0
        app.models.user.onChange(() => changeCount++)

        const [handler, emit] = createModelEvent(
          focused,
          (bio: string, state) => {
            state.bio = bio
          }
        )

        emit('Software engineer')
        expect(changeCount).toBe(1)
      })
    })
  })

  describe('createModelSubject', () => {
    describe('with ModelAPI', () => {
      it('should create subject with initial selector value', () => {
        const app = createApp({
          models: {
            counter: { initialState: { count: 5 } }
          }
        })

        const count = createModelSubject(
          app.models.counter,
          state => state.count
        )

        expect(count()).toBe(5)
      })

      it('should update when model changes', () => {
        const app = createApp({
          models: {
            counter: { initialState: { count: 0 } }
          }
        })

        const count = createModelSubject(
          app.models.counter,
          state => state.count
        )

        expect(count()).toBe(0)

        app.models.counter.updateAndNotify(state => {
          state.count = 10
        })

        expect(count()).toBe(10)
      })

      it('should memoize unchanged selector results', () => {
        const app = createApp({
          models: {
            user: { initialState: { name: 'Alice', age: 30 } }
          }
        })

        let selectorCalls = 0
        const name = createModelSubject(
          app.models.user,
          state => {
            selectorCalls++
            return state.name
          }
        )

        let subjectUpdates = 0
        name.subscribe(() => subjectUpdates++)

        // Initial selector call
        expect(selectorCalls).toBe(1)
        expect(subjectUpdates).toBe(0)

        // Change age (not name) - selector runs but subject doesn't update
        app.models.user.updateAndNotify(state => {
          state.age = 31
        })

        expect(selectorCalls).toBe(2) // Selector ran again
        expect(subjectUpdates).toBe(0) // But subject didn't update (memoized)

        // Change name - selector runs and subject updates
        app.models.user.updateAndNotify(state => {
          state.name = 'Bob'
        })

        expect(selectorCalls).toBe(3)
        expect(subjectUpdates).toBe(1) // Subject updated
        expect(name()).toBe('Bob')
      })

      it('should work with complex selectors', () => {
        const app = createApp({
          models: {
            todos: {
              initialState: {
                items: [
                  { id: 1, text: 'Buy milk', completed: false },
                  { id: 2, text: 'Walk dog', completed: true }
                ]
              }
            }
          }
        })

        const stats = createModelSubject(
          app.models.todos,
          state => ({
            total: state.items.length,
            completed: state.items.filter(t => t.completed).length,
            active: state.items.filter(t => !t.completed).length
          })
        )

        expect(stats()).toEqual({ total: 2, completed: 1, active: 1 })

        app.models.todos.updateAndNotify(state => {
          state.items[0].completed = true
        })

        expect(stats()).toEqual({ total: 2, completed: 2, active: 0 })
      })

      it('should support subject subscriptions', () => {
        const app = createApp({
          models: {
            counter: { initialState: { count: 0 } }
          }
        })

        const count = createModelSubject(
          app.models.counter,
          state => state.count
        )

        let callCount = 0
        let lastValue = -1

        count.subscribe(() => {
          callCount++
          lastValue = count()
        })

        app.models.counter.updateAndNotify(state => {
          state.count = 5
        })

        expect(callCount).toBe(1)
        expect(lastValue).toBe(5)

        app.models.counter.updateAndNotify(state => {
          state.count = 10
        })

        expect(callCount).toBe(2)
        expect(lastValue).toBe(10)
      })

      it('should support subject derivations', () => {
        const app = createApp({
          models: {
            user: { initialState: { name: 'Alice' } }
          }
        })

        const name = createModelSubject(app.models.user, s => s.name)
        const greeting = name.derive(n => `Hello, ${n}!`)

        expect(greeting()).toBe('Hello, Alice!')

        app.models.user.set('name', 'Bob')

        expect(greeting()).toBe('Hello, Bob!')
      })

      it('should handle selector errors gracefully', () => {
        const app = createApp({
          models: {
            user: { initialState: { name: 'Alice' } }
          }
        })

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        let shouldThrow = false
        const name = createModelSubject(
          app.models.user,
          state => {
            if (shouldThrow) throw new Error('Selector error')
            return state.name
          }
        )

        expect(name()).toBe('Alice')

        shouldThrow = true
        app.models.user.updateAndNotify(state => {
          state.name = 'Bob'
        })

        // Subject should keep previous value on error
        expect(name()).toBe('Alice')
        expect(consoleSpy).toHaveBeenCalledWith('[createModelSubject] Selector error:', expect.any(Error))

        consoleSpy.mockRestore()
      })

      it('should infer return type from selector', () => {
        const app = createApp({
          models: {
            user: { initialState: { name: 'Alice', age: 30 } }
          }
        })

        // Number return type
        const age = createModelSubject(app.models.user, s => s.age)
        const ageValue: number = age() // Type should be inferred as number

        // String return type
        const name = createModelSubject(app.models.user, s => s.name)
        const nameValue: string = name() // Type should be inferred as string

        // Object return type
        const full = createModelSubject(app.models.user, s => ({ name: s.name, age: s.age }))
        const fullValue: { name: string; age: number } = full()

        expect(ageValue).toBe(30)
        expect(nameValue).toBe('Alice')
        expect(fullValue).toEqual({ name: 'Alice', age: 30 })
      })
    })

    describe('with FocusedModel', () => {
      it('should work with FocusedModel', () => {
        const app = createApp({
          models: {
            user: {
              initialState: {
                profile: { name: 'Alice', bio: 'Engineer' }
              }
            }
          }
        })

        const profileLens = lens(
          (state: typeof app.models.user.__state) => state.profile,
          (state, profile) => ({ ...state, profile })
        )

        const focused = app.models.user.focus(profileLens)

        const bio = createModelSubject(focused, profile => profile.bio)

        expect(bio()).toBe('Engineer')

        focused.update(p => {
          p.bio = 'Developer'
        })

        expect(bio()).toBe('Developer')
      })

      it('should update when focused model changes', () => {
        const app = createApp({
          models: {
            user: {
              initialState: {
                profile: { name: 'Alice', bio: '' },
                settings: { theme: 'light' }
              }
            }
          }
        })

        const profileLens = lens(
          (state: typeof app.models.user.__state) => state.profile,
          (state, profile) => ({ ...state, profile })
        )

        const focused = app.models.user.focus(profileLens)

        const name = createModelSubject(focused, profile => profile.name)

        let updateCount = 0
        name.subscribe(() => updateCount++)

        focused.update(p => {
          p.name = 'Bob'
        })

        expect(updateCount).toBe(1)
        expect(name()).toBe('Bob')
      })
    })
  })

  describe('Integration: createModelEvent + createModelSubject', () => {
    it('should work together for functional controller pattern', () => {
      // Setup: Todo app
      const app = createApp({
        models: {
          todos: {
            initialState: {
              items: [] as Array<{ id: number; text: string; completed: boolean }>
            }
          }
        }
      })

      // Controller: Actions (writes)
      const [onAddTodo, addTodo] = createModelEvent(
        app.models.todos,
        (text: string, state) => {
          state.items.push({ id: Date.now(), text, completed: false })
        }
      )

      const [onToggleTodo, toggleTodo] = createModelEvent(
        app.models.todos,
        (id: number, state) => {
          const todo = state.items.find(t => t.id === id)
          if (todo) todo.completed = !todo.completed
        }
      )

      // Controller: Reactive reads (subjects)
      const todoCount = createModelSubject(
        app.models.todos,
        state => state.items.length
      )

      const completedCount = createModelSubject(
        app.models.todos,
        state => state.items.filter(t => t.completed).length
      )

      const activeCount = createModelSubject(
        app.models.todos,
        state => state.items.filter(t => !t.completed).length
      )

      // Test initial state
      expect(todoCount()).toBe(0)
      expect(completedCount()).toBe(0)
      expect(activeCount()).toBe(0)

      // Add todos
      addTodo('Buy milk')
      addTodo('Walk dog')

      expect(todoCount()).toBe(2)
      expect(completedCount()).toBe(0)
      expect(activeCount()).toBe(2)

      // Complete a todo
      const firstTodoId = app.models.todos.read().items[0].id
      toggleTodo(firstTodoId)

      expect(todoCount()).toBe(2)
      expect(completedCount()).toBe(1)
      expect(activeCount()).toBe(1)

      // Toggle it back
      toggleTodo(firstTodoId)

      expect(completedCount()).toBe(0)
      expect(activeCount()).toBe(2)
    })
  })
})
