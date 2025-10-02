import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, createSchema } from '../src/index'

describe('Event System Integration', () => {
  describe('Schema Builder with Model Events', () => {
    it('should allow defining events on models using the fluent API', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .events({
          increment: (amount: number) => ({ amount }),
          decrement: (amount: number) => ({ amount }),
          reset: () => ({})
        })
        .model('logger', { messages: [] as string[] })
        .build()

      expect(schema.models.counter.events).toBeDefined()
      expect(typeof schema.models.counter.events!.increment).toBe('function')
      expect(typeof schema.models.counter.events!.decrement).toBe('function')
      expect(typeof schema.models.counter.events!.reset).toBe('function')
    })

    it('should create app with typed event namespaces', () => {
      const app = createApp(createSchema()
        .model('counter', { count: 0 })
        .events({
          increment: (amount: number) => ({ amount }),
          reset: () => ({})
        })
        .build())

      // TypeScript should infer the correct types for emit and on
      const counterModel = app.models.counter

      expect(typeof counterModel.emit.increment).toBe('function')
      expect(typeof counterModel.emit.reset).toBe('function')
      expect(typeof counterModel.on.increment).toBe('function')
      expect(typeof counterModel.on.reset).toBe('function')
    })

    it('should emit and receive typed events', () => {
      const app = createApp(createSchema()
        .model('counter', { count: 0 })
        .events({
          increment: (amount: number) => ({ amount }),
          reset: () => ({})
        })
        .build())

      const counterModel = app.models.counter
      let receivedEvents: any[] = []

      // Subscribe to events
      const unsubIncrement = counterModel.on.increment((payload) => {
        receivedEvents.push({ type: 'increment', payload })
      })
      const unsubReset = counterModel.on.reset((payload) => {
        receivedEvents.push({ type: 'reset', payload })
      })

      // Emit events
      counterModel.emit.increment(5)
      counterModel.emit.reset()

      expect(receivedEvents).toEqual([
        { type: 'increment', payload: { amount: 5 } },
        { type: 'reset', payload: {} }
      ])

      unsubIncrement()
      unsubReset()
    })

    it('should support events in update contexts', () => {
      const app = createApp(createSchema()
        .model('counter', { count: 0 })
        .events({
          incremented: (newCount: number) => ({ newCount })
        })
        .build())

      const counterModel = app.models.counter
      let receivedPayload: any = null

      counterModel.on.incremented((payload) => {
        receivedPayload = payload
      })

      // Emit event from within an update
      counterModel.update((state, ctx) => {
        state.count += 10
        ctx.emit.incremented(state.count)
      })

      expect(receivedPayload).toEqual({ newCount: 10 })
    })

    it('should work with multiple models having events', () => {
      const app = createApp(createSchema()
        .model('counter', { count: 0 })
        .events({
          incremented: (amount: number) => ({ amount })
        })
        .model('logger', { logs: [] as string[] })
        .events({
          logged: (message: string) => ({ message })
        })
        .build())

      const counterModel = app.models.counter
      const loggerModel = app.models.logger

      let counterEvents: any[] = []
      let loggerEvents: any[] = []

      counterModel.on.incremented((payload) => {
        counterEvents.push(payload)
      })
      loggerModel.on.logged((payload) => {
        loggerEvents.push(payload)
      })

      counterModel.emit.incremented(5)
      loggerModel.emit.logged('Test message')

      expect(counterEvents).toEqual([{ amount: 5 }])
      expect(loggerEvents).toEqual([{ message: 'Test message' }])
    })

    it('should allow chaining after defining events', () => {
      const schema = createSchema()
        .model('first', { value: 1 })
        .events({
          updated: (value: number) => ({ value })
        })
        .model('second', { value: 2 })
        .build()

      expect(schema.models.first.events).toBeDefined()
      expect(schema.models.second.initialState.value).toBe(2)
    })
  })

  describe('Type Safety', () => {
    it('should enforce correct event payload types', () => {
      const app = createApp(createSchema()
        .model('test', { value: '' })
        .events({
          stringEvent: (text: string) => ({ text }),
          numberEvent: (num: number) => ({ num })
        })
        .build())

      const testModel = app.models.test

      // These should work
      testModel.emit.stringEvent('hello')
      testModel.emit.numberEvent(42)

      // TypeScript should prevent these (but we can't test that at runtime)
      // testModel.emit.stringEvent(123) // Should be type error
      // testModel.emit.numberEvent('world') // Should be type error
    })

    it('should provide correct types for event handlers', () => {
      const app = createApp(createSchema()
        .model('test', { value: 0 })
        .events({
          valueChanged: (oldValue: number, newValue: number) => ({ oldValue, newValue })
        })
        .build())

      const testModel = app.models.test

      testModel.on.valueChanged((payload) => {
        // TypeScript should know payload has oldValue and newValue as numbers
        expect(typeof payload.oldValue).toBe('number')
        expect(typeof payload.newValue).toBe('number')
      })

      testModel.emit.valueChanged(10, 20)
    })
  })
})