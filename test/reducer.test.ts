import { describe, it, expect } from 'vitest'
import { 
  createReducer, 
  createReducerModel, 
  ModelRegistry,
  type Action 
} from '../dist/esm/development/index.js'

describe('Reducer System', () => {
  describe('createReducer', () => {
    it('should create a type-safe reducer from action mappings', () => {
      type CounterAction =
        | { type: 'increment'; payload?: number }
        | { type: 'decrement'; payload?: number }
        | { type: 'reset' }

      const counterReducer = createReducer(
        { count: 0 },
        {
          increment: (state, action) => ({ 
            count: state.count + (action.payload ?? 1) 
          }),
          decrement: (state, action) => ({ 
            count: state.count - (action.payload ?? 1) 
          }),
          reset: () => ({ count: 0 })
        }
      )

      // Test increment without payload
      let result = counterReducer({ count: 0 }, { type: 'increment' })
      expect(result.count).toBe(1)

      // Test increment with payload
      result = counterReducer({ count: 5 }, { type: 'increment', payload: 3 })
      expect(result.count).toBe(8)

      // Test decrement
      result = counterReducer({ count: 10 }, { type: 'decrement', payload: 4 })
      expect(result.count).toBe(6)

      // Test reset
      result = counterReducer({ count: 25 }, { type: 'reset' })
      expect(result.count).toBe(0)

      // Test unknown action
      result = counterReducer({ count: 5 }, { type: 'unknown' } as any)
      expect(result.count).toBe(5) // Should remain unchanged
    })

    it('should handle complex state shapes', () => {
      type TodoAction =
        | { type: 'add'; payload: { text: string } }
        | { type: 'toggle'; payload: { id: string } }
        | { type: 'remove'; payload: { id: string } }

      interface TodoState {
        items: Array<{ id: string; text: string; completed: boolean }>
        filter: 'all' | 'active' | 'completed'
      }

      const todoReducer = createReducer<TodoState, TodoAction>(
        { items: [], filter: 'all' },
        {
          add: (state, action) => ({
            ...state,
            items: [...state.items, {
              id: Date.now().toString(),
              text: action.payload.text,
              completed: false
            }]
          }),
          toggle: (state, action) => ({
            ...state,
            items: state.items.map(item =>
              item.id === action.payload.id 
                ? { ...item, completed: !item.completed }
                : item
            )
          }),
          remove: (state, action) => ({
            ...state,
            items: state.items.filter(item => item.id !== action.payload.id)
          })
        }
      )

      let state: TodoState = { items: [], filter: 'all' }
      
      // Add todo
      state = todoReducer(state, { type: 'add', payload: { text: 'Test todo' } })
      expect(state.items).toHaveLength(1)
      expect(state.items[0].text).toBe('Test todo')
      expect(state.items[0].completed).toBe(false)

      const todoId = state.items[0].id

      // Toggle todo
      state = todoReducer(state, { type: 'toggle', payload: { id: todoId } })
      expect(state.items[0].completed).toBe(true)

      // Remove todo
      state = todoReducer(state, { type: 'remove', payload: { id: todoId } })
      expect(state.items).toHaveLength(0)
    })
  })

  describe('createReducerModel', () => {
    it('should create a model with dispatch capabilities', () => {
      type CounterAction =
        | { type: 'increment'; payload?: number }
        | { type: 'decrement'; payload?: number }
        | { type: 'reset' }

      const registry = new ModelRegistry()
      
      const counterModel = createReducerModel('counter', {
        initialState: { count: 0 },
        reducer: createReducer(
          { count: 0 },
          {
            increment: (state, action) => ({ 
              count: state.count + (action.payload ?? 1) 
            }),
            decrement: (state, action) => ({ 
              count: state.count - (action.payload ?? 1) 
            }),
            reset: () => ({ count: 0 })
          }
        )
      }, registry)

      expect(counterModel.read().count).toBe(0)

      // Test dispatch
      counterModel.dispatch({ type: 'increment' })
      expect(counterModel.read().count).toBe(1)

      counterModel.dispatch({ type: 'increment', payload: 5 })
      expect(counterModel.read().count).toBe(6)

      counterModel.dispatch({ type: 'decrement', payload: 2 })
      expect(counterModel.read().count).toBe(4)

      counterModel.dispatch({ type: 'reset' })
      expect(counterModel.read().count).toBe(0)
    })

    it('should support middleware for actions', () => {
      type CounterAction =
        | { type: 'increment'; payload?: number }
        | { type: 'decrement'; payload?: number }
        | { type: 'reset' }

      const registry = new ModelRegistry()
      
      let beforeActionCalled = false
      let afterActionCalled = false
      let lastAction: CounterAction | null = null

      const counterModel = createReducerModel('counter', {
        initialState: { count: 0 },
        reducer: createReducer(
          { count: 0 },
          {
            increment: (state, action) => ({ 
              count: state.count + (action.payload ?? 1) 
            }),
            decrement: (state, action) => ({ 
              count: state.count - (action.payload ?? 1) 
            }),
            reset: () => ({ count: 0 })
          }
        ),
        middleware: {
          beforeAction: (state, action) => {
            beforeActionCalled = true
            lastAction = action
            return action
          },
          afterAction: (state, prevState, action, ctx) => {
            afterActionCalled = true
          }
        }
      }, registry)

      counterModel.dispatch({ type: 'increment', payload: 3 })

      expect(beforeActionCalled).toBe(true)
      expect(afterActionCalled).toBe(true)
      expect(lastAction).toEqual({ type: 'increment', payload: 3 })
      expect(counterModel.read().count).toBe(3)
    })

    it('should cancel actions when middleware returns false', () => {
      type CounterAction = { type: 'increment'; payload?: number }

      const registry = new ModelRegistry()
      
      const counterModel = createReducerModel('counter', {
        initialState: { count: 0 },
        reducer: createReducer(
          { count: 0 },
          {
            increment: (state, action) => ({ 
              count: state.count + (action.payload ?? 1) 
            })
          }
        ),
        middleware: {
          beforeAction: (state, action) => {
            // Cancel if payload is negative
            if (action.payload && action.payload < 0) {
              return false
            }
            return action
          }
        }
      }, registry)

      counterModel.dispatch({ type: 'increment', payload: 5 })
      expect(counterModel.read().count).toBe(5)

      // This should be cancelled
      counterModel.dispatch({ type: 'increment', payload: -3 })
      expect(counterModel.read().count).toBe(5) // Should remain unchanged
    })

    it('should transform actions in middleware', () => {
      type CounterAction = { type: 'increment'; payload?: number }

      const registry = new ModelRegistry()
      
      const counterModel = createReducerModel('counter', {
        initialState: { count: 0 },
        reducer: createReducer(
          { count: 0 },
          {
            increment: (state, action) => ({ 
              count: state.count + (action.payload ?? 1) 
            })
          }
        ),
        middleware: {
          beforeAction: (state, action) => {
            // Double the payload
            if (action.payload) {
              return { ...action, payload: action.payload * 2 }
            }
            return action
          }
        }
      }, registry)

      counterModel.dispatch({ type: 'increment', payload: 3 })
      expect(counterModel.read().count).toBe(6) // 3 * 2 = 6
    })

    it('should notify subscribers of state changes', () => {
      type CounterAction = { type: 'increment'; payload?: number }

      const registry = new ModelRegistry()
      
      const counterModel = createReducerModel('counter', {
        initialState: { count: 0 },
        reducer: createReducer(
          { count: 0 },
          {
            increment: (state, action) => ({ 
              count: state.count + (action.payload ?? 1) 
            })
          }
        )
      }, registry)

      let changeCount = 0
      let lastState: any = null

      counterModel.onChange((current, previous) => {
        changeCount++
        lastState = current
      })

      counterModel.dispatch({ type: 'increment', payload: 5 })

      expect(changeCount).toBe(1)
      expect(lastState.count).toBe(5)
    })

    it('should work with constraints', () => {
      type CounterAction = { type: 'increment' }

      const registry = new ModelRegistry()
      
      expect(() => {
        createReducerModel('counter', {
          initialState: { count: 0, name: 'test' },
          reducer: createReducer(
            { count: 0, name: 'test' },
            {
              increment: (state) => ({ 
                count: state.count + 1,
                name: state.name 
              })
            }
          ),
          constraints: {
            required: ['name'],
            readonly: ['name']
          }
        }, registry)
      }).not.toThrow()
    })
  })
})
