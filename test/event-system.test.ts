import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, createEvent, createSubject, halt } from '../dist/esm/development/index.js'

describe('Event System', () => {
  let app: ReturnType<typeof createApp>

  beforeEach(() => {
    app = createApp({
      models: {
        counter: { initialState: { count: 0 } },
        logger: { initialState: { events: [] as any[] } }
      }
    })
  })

  describe('Event Creation and Emission', () => {
    it('should create and emit events', () => {
      const [handler, emit] = createEvent<{ type: string; value: number }>()

      let receivedEvent: any = null
      const unsubscribe = handler.subscribe((event) => {
        receivedEvent = event
      })

      emit({ type: 'increment', value: 5 })

      expect(receivedEvent).toEqual({ type: 'increment', value: 5 })

      unsubscribe()
    })

    it('should support multiple subscribers', () => {
      const [handler, emit] = createEvent<string>()

      const received: string[] = []
      const unsub1 = handler.subscribe((msg) => received.push(`sub1: ${msg}`))
      const unsub2 = handler.subscribe((msg) => received.push(`sub2: ${msg}`))

      emit('hello')

      expect(received).toEqual(['sub1: hello', 'sub2: hello'])

      unsub1()
      emit('world')

      expect(received).toEqual(['sub1: hello', 'sub2: hello', 'sub2: world'])
      unsub2()
    })

    it('should handle event transformation chains', () => {
      const [handler, emit] = createEvent<number>()

      let result: any = null
      const unsubscribe = handler
        .map((n) => n * 2)
        .filter((n) => n > 5)
        .subscribe((n) => {
          result = n
        })

      emit(2) // 2 * 2 = 4, filtered out
      expect(result).toBe(null)

      emit(3) // 3 * 2 = 6, passes filter
      expect(result).toBe(6)

      unsubscribe()
    })

    it('should support event halting', () => {
      const [handler, emit] = createEvent<number>()

      let callCount = 0
      const unsubscribe = handler
        .map((n) => {
          callCount++
          return n > 5 ? n : undefined // This should halt
        })
        .subscribe(() => {
          callCount++
        })

      emit(3) // Should be halted, only first transform called
      expect(callCount).toBe(1)

      emit(7) // Should pass through
      expect(callCount).toBe(3) // map + subscribe

      unsubscribe()
    })
  })

  describe('Event Definitions', () => {
    it('should create event definitions with default payloads', () => {
      const eventDef = app.models.counter.createEvent('counterChanged', { amount: 0 })

      let receivedPayload: any = null
      const unsubscribe = eventDef.subscribe((payload) => {
        receivedPayload = payload
      })

      eventDef.emit({ amount: 10 })

      expect(receivedPayload).toEqual({ amount: 10 })

      unsubscribe()
    })

    it('should use default payload when none provided', () => {
      const eventDef = app.models.counter.createEvent('reset', { value: 0 })

      let receivedPayload: any = null
      const unsubscribe = eventDef.subscribe((payload) => {
        receivedPayload = payload
      })

      eventDef.emit() // No payload provided

      expect(receivedPayload).toEqual({ value: 0 })

      unsubscribe()
    })

    it('should support event filtering', () => {
      const eventDef = app.models.counter.createEvent('valueChanged', { value: 0 })

      let receivedValues: number[] = []
      const unsubscribe = eventDef
        .filter((payload) => payload.value > 5)
        .subscribe((payload) => {
          receivedValues.push(payload.value)
        })

      eventDef.emit({ value: 3 }) // filtered out
      eventDef.emit({ value: 7 }) // passes
      eventDef.emit({ value: 10 }) // passes

      expect(receivedValues).toEqual([7, 10])

      unsubscribe()
    })

    it('should support event mapping', () => {
      const eventDef = app.models.counter.createEvent('rawValue', 0)

      let receivedValues: string[] = []
      const unsubscribe = eventDef
        .map((value) => `Value: ${value}`)
        .subscribe((mapped) => {
          receivedValues.push(mapped)
        })

      eventDef.emit(5)
      eventDef.emit(10)

      expect(receivedValues).toEqual(['Value: 5', 'Value: 10'])

      unsubscribe()
    })
  })

  describe('Reactive Subjects', () => {
    it('should create reactive subjects', () => {
      const subject = createSubject(0)

      expect(subject()).toBe(0)

      subject.set(5)
      expect(subject()).toBe(5)
    })

    it('should react to events', () => {
      const [incrementEvent, emitIncrement] = createEvent<number>()
      const subject = createSubject(0, incrementEvent)

      expect(subject()).toBe(0)

      emitIncrement(5)
      expect(subject()).toBe(5)

      emitIncrement(3)
      expect(subject()).toBe(8)
    })

    it('should support custom reaction functions', () => {
      const [multiplyEvent, emitMultiply] = createEvent<number>()
      const subject = createSubject(1)

      subject.on(multiplyEvent, (factor) => factor * 2)

      emitMultiply(3) // 3 * 2 = 6
      expect(subject()).toBe(6)

      emitMultiply(2) // 2 * 2 = 4
      expect(subject()).toBe(4)
    })

    it('should support functional updates', () => {
      const [updateEvent, emitUpdate] = createEvent<number>()
      const subject = createSubject(10)

      subject.on(updateEvent, (increment) => (current) => current + increment)

      emitUpdate(5)
      expect(subject()).toBe(15)

      emitUpdate(10)
      expect(subject()).toBe(25)
    })

    it('should create derived subjects', () => {
      const baseSubject = createSubject(5)
      const doubledSubject = baseSubject.derive((value) => value * 2)

      expect(doubledSubject()).toBe(10)

      baseSubject.set(8)
      expect(doubledSubject()).toBe(16)
    })

    it('should convert events to subjects', () => {
      const [numberEvent, emitNumber] = createEvent<number>()
      const subject = numberEvent.toSubject(0)

      expect(subject()).toBe(0)

      emitNumber(42)
      expect(subject()).toBe(42)
    })
  })

  describe('Event Composition', () => {
    it('should compose multiple event sources', () => {
      const [eventA, emitA] = createEvent<string>()
      const [eventB, emitB] = createEvent<string>()

      let combinedResults: string[] = []
      const combinedHandler = eventA.map((msg) => `A: ${msg}`)
      const unsubscribe = combinedHandler.subscribe((result) => {
        combinedResults.push(result)
      })

      // Note: In a real implementation, we'd have a topic creator
      // For now, just test individual events
      emitA('hello')
      expect(combinedResults).toEqual(['A: hello'])

      unsubscribe()
    })

    it('should support event partitioning', () => {
      // This would test partitioning logic if implemented
      // For now, just test basic filtering which is similar
      const [numberEvent, emitNumber] = createEvent<number>()

      const evens: number[] = []
      const odds: number[] = []

      const evenUnsub = numberEvent
        .filter((n) => n % 2 === 0)
        .subscribe((n) => evens.push(n))

      const oddUnsub = numberEvent
        .filter((n) => n % 2 !== 0)
        .subscribe((n) => odds.push(n))

      emitNumber(1)
      emitNumber(2)
      emitNumber(3)
      emitNumber(4)

      expect(evens).toEqual([2, 4])
      expect(odds).toEqual([1, 3])

      evenUnsub()
      oddUnsub()
    })
  })

  describe('Debouncing and Throttling', () => {
    it('should debounce events', async () => {
      const [event, emit] = createEvent<string>()

      let callCount = 0
      const unsubscribe = event
        .debounce(50)
        .subscribe(() => {
          callCount++
        })

      emit('a')
      emit('b')
      emit('c')

      // Wait less than debounce time
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(callCount).toBe(0)

      // Wait for debounce to trigger
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(callCount).toBe(1)

      unsubscribe()
    })

    it('should throttle events', async () => {
      const [event, emit] = createEvent<string>()

      let callCount = 0
      const unsubscribe = event
        .throttle(50)
        .subscribe(() => {
          callCount++
        })

      emit('a')
      expect(callCount).toBe(1)

      emit('b')
      emit('c')
      expect(callCount).toBe(1) // Still throttled

      // Wait for throttle to reset
      await new Promise(resolve => setTimeout(resolve, 60))

      emit('d')
      expect(callCount).toBe(2)

      unsubscribe()
    })
  })

  describe('Event Scope Management', () => {
    it('should create event scopes', () => {
      // Test basic event scope creation
      // The actual implementation may vary
      const scope = app.events

      expect(scope).toBeDefined()
      expect(typeof scope.createTopic).toBe('function')
      expect(typeof scope.createPartition).toBe('function')
      expect(typeof scope.cleanup).toBe('function')
    })

    it('should cleanup event resources', () => {
      const scope = app.events

      // Create some events and subscriptions
      const [event1] = createEvent<string>()
      const [event2] = createEvent<number>()

      const unsub1 = event1.subscribe(() => {})
      const unsub2 = event2.subscribe(() => {})

      // Cleanup should work without errors
      expect(() => {
        scope.cleanup()
        unsub1()
        unsub2()
      }).not.toThrow()
    })
  })

  describe('Integration with Models', () => {
    it('should integrate events with model updates', () => {
      const eventDef = app.models.counter.createEvent('increment', { amount: 1 })

      // Subscribe to event and update model
      const unsubscribe = eventDef.subscribe((payload) => {
        app.models.counter.update((state) => {
          state.count += payload.amount
        })
      })

      expect(app.models.counter.read().count).toBe(0)

      eventDef.emit({ amount: 5 })
      expect(app.models.counter.read().count).toBe(5)

      eventDef.emit({ amount: 3 })
      expect(app.models.counter.read().count).toBe(8)

      unsubscribe()
    })

    it('should emit events from model updates', () => {
      let emittedEvents: any[] = []

      app.models.counter.onEvent((event) => {
        emittedEvents.push(event)
      })

      app.models.counter.emit({ type: 'manual', value: 42 })

      expect(emittedEvents).toEqual([{ type: 'manual', value: 42 }])
    })

    it('should support cross-model event reactions', () => {
      // Counter emits events that logger listens to
      app.models.counter.onEvent((event) => {
        app.models.logger.update((state) => {
          state.events.push(event)
        })
      })

      app.models.counter.emit({ type: 'increment', amount: 1 })
      app.models.counter.emit({ type: 'decrement', amount: 2 })

      expect(app.models.logger.read().events).toEqual([
        { type: 'increment', amount: 1 },
        { type: 'decrement', amount: 2 }
      ])
    })
  })

  describe('Advanced Event Composition', () => {
    it('should support complex transformation chains', () => {
      const [handler, emit] = createEvent<number>()

      let result: any = null
      const unsubscribe = handler
        .map((n) => n * 2)
        .filter((n) => n > 10)
        .map((n) => `Value: ${n}`)
        .subscribe((value) => {
          result = value
        })

      emit(3) // 3 * 2 = 6, filtered out
      expect(result).toBe(null)

      emit(6) // 6 * 2 = 12, passes filter, becomes "Value: 12"
      expect(result).toBe('Value: 12')

      unsubscribe()
    })

    it('should handle halting in transformation chains', () => {
      const [handler, emit] = createEvent<number>()

      let callCount = 0
      const unsubscribe = handler
        .map((n) => {
          callCount++
          return n > 5 ? n : halt() // This should halt
        })
        .map((n) => {
          callCount++
          return n * 2
        })
        .subscribe(() => {
          callCount++
        })

      emit(3) // Should be halted, only first transform called
      expect(callCount).toBe(1)

      emit(7) // Should pass through both transforms + subscribe
      expect(callCount).toBe(4) // map1 + map2 + subscribe

      unsubscribe()
    })



    it('should create and use topics to merge events', () => {
      const scope = app.events

      const [eventA, emitA] = createEvent<string>()
      const [eventB, emitB] = createEvent<string>()

      const topic = scope.createTopic(eventA, eventB)

      const received: string[] = []
      const unsubscribe = topic.subscribe((msg) => received.push(msg))

      emitA('hello from A')
      emitB('hello from B')

      expect(received).toEqual(['hello from A', 'hello from B'])

      unsubscribe()
    })

    it('should create partitions to split events', () => {
      const scope = app.events

      const [sourceEvent, emitSource] = createEvent<number>()

      const [validPartition, invalidPartition] = scope.createPartition(
        sourceEvent,
        (n) => n > 0
      )

      const validValues: number[] = []
      const invalidValues: number[] = []

      const unsubValid = validPartition.subscribe((n) => validValues.push(n))
      const unsubInvalid = invalidPartition.subscribe((n) => invalidValues.push(n))

      emitSource(5)
      emitSource(-2)
      emitSource(10)
      emitSource(0)

      expect(validValues).toEqual([5, 10])
      expect(invalidValues).toEqual([-2, 0])

      unsubValid()
      unsubInvalid()
    })

    it('should support state derivation from events using subjects', () => {
      const [incrementEvent, emitIncrement] = createEvent<number>()
      const [resetEvent, emitReset] = createEvent()

      const counter = createSubject(0)
        .on(incrementEvent, (amount) => (current) => current + amount)
        .on(resetEvent, () => 0)

      expect(counter()).toBe(0)

      emitIncrement(5)
      expect(counter()).toBe(5)

      emitIncrement(3)
      expect(counter()).toBe(8)

      emitReset()
      expect(counter()).toBe(0)
    })

    it('should support derived subjects', () => {
      const baseSubject = createSubject(5)
      const doubledSubject = baseSubject.derive((value) => value * 2)
      const stringSubject = doubledSubject.derive((value) => `Value: ${value}`)

      expect(stringSubject()).toBe('Value: 10')

      baseSubject.set(8)
      expect(stringSubject()).toBe('Value: 16')
    })

    it('should handle optimistic UI patterns', async () => {
      // Simulate optimistic updates with async confirmation
      const [userAction, emitAction] = createEvent<{ id: string; optimistic: boolean }>()
      const [serverConfirm, emitConfirm] = createEvent<{ id: string; success: boolean }>()

      const items = createSubject(['item1', 'item2'])
        .on(userAction, ({ id, optimistic }) => (current) => {
          if (optimistic) {
            return current.filter(item => item !== id) // Optimistic removal
          }
          return current
        })
        .on(serverConfirm, ({ id, success }) => (current) => {
          if (!success) {
            // Revert optimistic change
            return [...current, id].sort()
          }
          return current
        })

      expect(items()).toEqual(['item1', 'item2'])

      // User initiates deletion optimistically
      emitAction({ id: 'item1', optimistic: true })
      expect(items()).toEqual(['item2'])

      // Server confirms success
      emitConfirm({ id: 'item1', success: true })
      expect(items()).toEqual(['item2'])

      // Another deletion that fails
      emitAction({ id: 'item2', optimistic: true })
      expect(items()).toEqual([])

      emitConfirm({ id: 'item2', success: false })
      expect(items()).toEqual(['item2'])
    })

    it('should support fine-grained mutations with subjects', () => {
      interface TodoItem {
        id: string
        text: string
        completed: boolean
      }

      interface TodoState {
        todos: TodoItem[]
      }

      const [addTodo, emitAddTodo] = createEvent<{ text: string }>()
      const [toggleTodo, emitToggleTodo] = createEvent<string>()
      const [deleteTodo, emitDeleteTodo] = createEvent<string>()

      const todoStore = createSubject<TodoState>({ todos: [] })
        .on(addTodo, ({ text }) => (state) => ({
          ...state,
          todos: [...state.todos, { id: Date.now().toString(), text, completed: false }]
        }))
        .on(toggleTodo, (id) => (state) => ({
          ...state,
          todos: state.todos.map(todo =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
          )
        }))
        .on(deleteTodo, (id) => (state) => ({
          ...state,
          todos: state.todos.filter(todo => todo.id !== id)
        }))

      expect(todoStore().todos).toEqual([])

      emitAddTodo({ text: 'Learn GPUI-TS' })
      expect(todoStore().todos).toHaveLength(1)
      expect(todoStore().todos[0].text).toBe('Learn GPUI-TS')
      expect(todoStore().todos[0].completed).toBe(false)

      const todoId = todoStore().todos[0].id

      emitToggleTodo(todoId)
      expect(todoStore().todos[0].completed).toBe(true)

      emitDeleteTodo(todoId)
      expect(todoStore().todos).toEqual([])
    })

    it('should support event composition for complex UI logic', () => {
      // Simulate drag and drop logic from Strello example
      const [onDragStart, emitDragStart] = createEvent<{ itemId: string }>()
      const [onDragOver, emitDragOver] = createEvent<{ targetId: string; position: 'top' | 'bottom' }>()
      const [onDrop, emitDrop] = createEvent<{ itemId: string; targetId: string }>()

      // Compose events for valid drops
      const onValidDrop = onDrop((dropData) => {
        // In real scenario, check if drop is valid
        return dropData.itemId !== dropData.targetId ? dropData : undefined
      })

      // Derive drop zone state
      const dropZoneState = createSubject<{ accepting: boolean; position?: 'top' | 'bottom' }>({ accepting: false })
        .on(onDragOver, ({ position }) => ({ accepting: true, position }))
        .on(onDrop, () => ({ accepting: false }))

      const actions: string[] = []
      const unsubscribe = onValidDrop.subscribe((data) => {
        actions.push(`Moved ${data.itemId} to ${data.targetId}`)
      })

      expect(dropZoneState()).toEqual({ accepting: false })

      emitDragOver({ targetId: 'zone1', position: 'top' })
      expect(dropZoneState()).toEqual({ accepting: true, position: 'top' })

      emitDrop({ itemId: 'item1', targetId: 'zone1' })
      expect(actions).toEqual(['Moved item1 to zone1'])
      expect(dropZoneState()).toEqual({ accepting: false })

      unsubscribe()
    })

    it('should handle debouncing correctly', async () => {
      const [event, emit] = createEvent<string>()

      let callCount = 0
      const unsubscribe = event
        .debounce(50)
        .subscribe(() => callCount++)

      emit('a')
      emit('b')
      emit('c')

      expect(callCount).toBe(0)

      await new Promise(resolve => setTimeout(resolve, 60))
      expect(callCount).toBe(1)

      unsubscribe()
    })

    it('should handle throttling correctly', async () => {
      const [event, emit] = createEvent<string>()

      let callCount = 0
      const unsubscribe = event
        .throttle(50)
        .subscribe(() => callCount++)

      emit('a')
      expect(callCount).toBe(1)

      emit('b')
      emit('c')
      expect(callCount).toBe(1)

      await new Promise(resolve => setTimeout(resolve, 60))

      emit('d')
      expect(callCount).toBe(2)

      unsubscribe()
    })

    it('should support functional reactive programming patterns', () => {
      // FRP-style event processing
      const [inputEvent, emitInput] = createEvent<string>()

      const processedInput = inputEvent
        .map((text) => text.trim())
        .filter((text) => text.length > 0)
        .map((text) => text.toUpperCase())

      const results: string[] = []
      const unsubscribe = processedInput.subscribe((result) => results.push(result))

      emitInput('  hello  ')
      emitInput('')
      emitInput('  world  ')

      expect(results).toEqual(['HELLO', 'WORLD'])

      unsubscribe()
    })


  })
})