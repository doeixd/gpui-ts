/**
 * Tests for Functional Controller Pattern Utilities
 * Tests createModelEvent and createModelSubject utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp, createModelEvent, createModelSubject, createAppEvent, lens, createSchema } from '../src/index'

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

  describe('createAppEvent', () => {
    it('should create event that updates model when emitted', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .build()

      let app = createApp(schema)

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'counter',
        'incremented',
        (amount: number) => ({ amount, timestamp: Date.now() }),
        (payload, state) => {
          state.count += payload.amount
        }
      )

      app = appWithEvent

      expect(app.models.counter.read().count).toBe(0)
      emit(5)
      expect(app.models.counter.read().count).toBe(5)
      emit(3)
      expect(app.models.counter.read().count).toBe(8)
    })

    it('should register event at runtime if not in schema', () => {
      const schema = createSchema()
        .model('todos', { items: [] as Array<{ id: number; text: string }> })
        .build()

      let app = createApp(schema)

      // Verify event helper doesn't exist initially
      expect((app.models.todos as any).__eventHelpers).toBeUndefined()
      expect((app.models.todos as any).on?.todoAdded).toBeUndefined()

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'todos',
        'todoAdded',
        (text: string) => ({ text, timestamp: Date.now() }),
        (payload, state) => {
          state.items.push({ id: Date.now(), text: payload.text })
        }
      )

      app = appWithEvent

      // Verify event was registered
      expect((app.models.todos as any).__eventHelpers).toBeDefined()
      expect((app.models.todos as any).__eventHelpers.emit.todoAdded).toBeInstanceOf(Function)
      expect((app.models.todos as any).on).toBeDefined()
      expect((app.models.todos as any).on.todoAdded).toBeInstanceOf(Function)
    })

    it('should emit through model event system', () => {
      const schema = createSchema()
        .model('todos', { items: [] as Array<{ id: number; text: string }> })
        .build()

      let app = createApp(schema)

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'todos',
        'todoAdded',
        (text: string) => ({ text, timestamp: Date.now() }),
        (payload, state) => {
          state.items.push({ id: Date.now(), text: payload.text })
        }
      )

      app = appWithEvent

      const events: any[] = []
      // Use the on helper created by createAppEvent
      ;(app.models.todos as any).on.todoAdded((payload: any) => {
        events.push(payload)
      })

      emit('Buy milk')
      emit('Walk dog')

      expect(events.length).toBe(2)
      expect(events[0].text).toBe('Buy milk')
      expect(events[1].text).toBe('Walk dog')
      expect(events[0].timestamp).toBeDefined()
      expect(events[1].timestamp).toBeDefined()
    })

    it('should provide typed payload to handler', () => {
      const schema = createSchema()
        .model('user', { name: '', age: 0 })
        .build()

      let app = createApp(schema)

      let receivedPayload: any = null

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'user',
        'userUpdated',
        (name: string, age: number) => ({ name, age, timestamp: Date.now() }),
        (payload, state, ctx) => {
          receivedPayload = payload
          state.name = payload.name
          state.age = payload.age
        }
      )

      app = appWithEvent

      emit('Alice', 30)

      expect(receivedPayload).toBeDefined()
      expect(receivedPayload.name).toBe('Alice')
      expect(receivedPayload.age).toBe(30)
      expect(receivedPayload.timestamp).toBeDefined()
      expect(app.models.user.read().name).toBe('Alice')
      expect(app.models.user.read().age).toBe(30)
    })

    it('should support event transformation chains', () => {
      const schema = createSchema()
        .model('todos', { items: [] as Array<{ id: number; text: string; priority: string }> })
        .build()

      let app = createApp(schema)

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'todos',
        'todoAdded',
        (text: string, priority: 'high' | 'low') => ({ text, priority }),
        (payload, state) => {
          state.items.push({ id: Date.now(), text: payload.text, priority: payload.priority })
        }
      )

      app = appWithEvent

      const highPriorityItems: any[] = []
      const highPriorityHandler = handler
        .filter(([text, priority]) => priority === 'high')
        .map(([text, priority]) => ({ text, urgent: true }))

      highPriorityHandler.subscribe(data => {
        highPriorityItems.push(data)
      })

      emit('Buy milk', 'low')
      emit('Fix bug', 'high')
      emit('Walk dog', 'low')
      emit('Deploy to prod', 'high')

      expect(app.models.todos.read().items.length).toBe(4)
      expect(highPriorityItems.length).toBe(2)
      expect(highPriorityItems[0].text).toBe('Fix bug')
      expect(highPriorityItems[0].urgent).toBe(true)
      expect(highPriorityItems[1].text).toBe('Deploy to prod')
      expect(highPriorityItems[1].urgent).toBe(true)
    })

    it('should allow chaining multiple createAppEvent calls', () => {
      const schema = createSchema()
        .model('todos', { items: [] as Array<{ id: number; text: string; completed: boolean }>, nextId: 1 })
        .build()

      let app = createApp(schema)

      // First event: add todo
      const [onAdd, addTodo, app2] = createAppEvent(
        app,
        'todos',
        'todoAdded',
        (text: string) => ({ text }),
        (payload, state) => {
          state.items.push({ id: state.nextId++, text: payload.text, completed: false })
        }
      )

      // Second event: toggle todo
      const [onToggle, toggleTodo, app3] = createAppEvent(
        app2,
        'todos',
        'todoToggled',
        (id: number) => ({ id }),
        (payload, state) => {
          const todo = state.items.find(t => t.id === payload.id)
          if (todo) todo.completed = !todo.completed
        }
      )

      // Third event: remove todo
      const [onRemove, removeTodo, app4] = createAppEvent(
        app3,
        'todos',
        'todoRemoved',
        (id: number) => ({ id }),
        (payload, state) => {
          state.items = state.items.filter(t => t.id !== payload.id)
        }
      )

      app = app4

      // Verify all events are registered
      expect((app.models.todos as any).__eventHelpers.emit.todoAdded).toBeInstanceOf(Function)
      expect((app.models.todos as any).__eventHelpers.emit.todoToggled).toBeInstanceOf(Function)
      expect((app.models.todos as any).__eventHelpers.emit.todoRemoved).toBeInstanceOf(Function)

      // Test event listeners
      const addedEvents: any[] = []
      const toggledEvents: any[] = []
      const removedEvents: any[] = []

      ;(app.models.todos as any).on.todoAdded((p: any) => addedEvents.push(p))
      ;(app.models.todos as any).on.todoToggled((p: any) => toggledEvents.push(p))
      ;(app.models.todos as any).on.todoRemoved((p: any) => removedEvents.push(p))

      // Use the events
      addTodo('Buy milk')
      addTodo('Walk dog')
      const firstId = app.models.todos.read().items[0].id
      toggleTodo(firstId)
      removeTodo(firstId)

      expect(addedEvents.length).toBe(2)
      expect(toggledEvents.length).toBe(1)
      expect(removedEvents.length).toBe(1)
      expect(app.models.todos.read().items.length).toBe(1)
      expect(app.models.todos.read().items[0].text).toBe('Walk dog')
    })

    it('should handle errors with rollback', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .build()

      let app = createApp(schema)

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'counter',
        'incremented',
        (amount: number) => ({ amount }),
        (payload, state) => {
          state.count += payload.amount
          if (payload.amount > 10) {
            throw new Error('Amount too large')
          }
        }
      )

      app = appWithEvent

      emit(5)
      expect(app.models.counter.read().count).toBe(5)

      // This should fail and rollback
      expect(() => emit(15)).toThrow('Amount too large')
      expect(app.models.counter.read().count).toBe(5) // Should still be 5

      emit(3)
      expect(app.models.counter.read().count).toBe(8)
    })

    it('should trigger reactive subscriptions', () => {
      const schema = createSchema()
        .model('todos', { items: [] as Array<{ id: number; text: string }> })
        .build()

      let app = createApp(schema)

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'todos',
        'todoAdded',
        (text: string) => ({ text }),
        (payload, state) => {
          state.items.push({ id: Date.now(), text: payload.text })
        }
      )

      app = appWithEvent

      const updates: any[] = []
      app.models.todos.onChange(state => {
        updates.push({ itemCount: state.items.length })
      })

      emit('Buy milk')
      emit('Walk dog')

      expect(updates.length).toBe(2)
      expect(updates[0].itemCount).toBe(1)
      expect(updates[1].itemCount).toBe(2)
    })

    it('should work with complex payloads', () => {
      const schema = createSchema()
        .model('tasks', {
          tasks: [] as Array<{
            id: number
            title: string
            priority: 'high' | 'medium' | 'low'
            tags: string[]
            assignee?: string
          }>
        })
        .build()

      let app = createApp(schema)

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'tasks',
        'taskCreated',
        (
          title: string,
          priority: 'high' | 'medium' | 'low',
          tags: string[],
          assignee?: string
        ) => ({
          title,
          priority,
          tags,
          assignee,
          createdAt: Date.now()
        }),
        (payload, state) => {
          state.tasks.push({
            id: Date.now(),
            title: payload.title,
            priority: payload.priority,
            tags: payload.tags,
            assignee: payload.assignee
          })
        }
      )

      app = appWithEvent

      emit('Fix critical bug', 'high', ['backend', 'urgent'], 'Alice')
      emit('Update docs', 'low', ['documentation'])

      expect(app.models.tasks.read().tasks.length).toBe(2)
      expect(app.models.tasks.read().tasks[0].title).toBe('Fix critical bug')
      expect(app.models.tasks.read().tasks[0].priority).toBe('high')
      expect(app.models.tasks.read().tasks[0].tags).toEqual(['backend', 'urgent'])
      expect(app.models.tasks.read().tasks[0].assignee).toBe('Alice')
      expect(app.models.tasks.read().tasks[1].assignee).toBeUndefined()
    })

    it('should provide context to handler', () => {
      const schema = createSchema()
        .model('user', { name: '', notifications: [] as string[] })
        .build()

      let app = createApp(schema)

      let contextProvided = false

      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'user',
        'nameChanged',
        (name: string) => ({ name }),
        (payload, state, ctx) => {
          contextProvided = ctx !== undefined
          state.name = payload.name

          // Use context to emit additional event
          if (ctx) {
            ctx.emit({ type: 'user:notification', payload: { message: `Name changed to ${payload.name}` } })
          }
        }
      )

      app = appWithEvent

      emit('Alice')

      expect(contextProvided).toBe(true)
      expect(app.models.user.read().name).toBe('Alice')
    })

    it('should infer types correctly', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .build()

      let app = createApp(schema)

      // Type inference test - this should compile without explicit types
      const [handler, emit, appWithEvent] = createAppEvent(
        app,
        'counter',
        'incremented',
        (amount: number) => ({ amount, timestamp: Date.now() }),
        (payload, state, ctx) => {
          // payload.amount should be inferred as number
          // state.count should be inferred as number
          state.count += payload.amount
        }
      )

      app = appWithEvent

      // This should compile with correct types
      emit(5) // number argument expected
      // emit('hello') // Would be a type error

      expect(app.models.counter.read().count).toBe(5)
    })
  })
})
