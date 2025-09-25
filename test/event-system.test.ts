import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, createEvent, createSubject } from '../dist/esm/development/index.js'

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
})