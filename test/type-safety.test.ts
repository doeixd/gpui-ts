/**
 * Type Safety Verification Tests
 *
 * Tests to verify that type inference works correctly throughout
 * the schema builder chain.
 */

import { describe, it, expect } from 'vitest';
import { createSchema } from '../src/helpers';
import { createApp } from '../src/index';

describe('Type Safety Verification', () => {
  describe('Model type inference', () => {
    it('should infer initial state types correctly', () => {
      const schema = createSchema()
        .model('user', { name: 'John', age: 30 })
        .build();

      // Type-level assertion: this should compile
      type UserState = typeof schema.models.user.initialState;
      const user: UserState = { name: 'Jane', age: 25 };

      expect(user.name).toBe('Jane');
      expect(user.age).toBe(25);
    });

    it('should accumulate model types through chain', () => {
      const schema = createSchema()
        .model('first', { a: 1 })
        .model('second', { b: 'hello' })
        .model('third', { c: true })
        .build();

      // All three models should exist with correct types
      expect(schema.models.first.initialState.a).toBe(1);
      expect(schema.models.second.initialState.b).toBe('hello');
      expect(schema.models.third.initialState.c).toBe(true);
    });

    it('should preserve types through model().events() chain', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .events({
          increment: (amount: number) => ({ amount })
        })
        .model('logger', { logs: [] as string[] })
        .build();

      // Both models should be present
      expect(schema.models.counter.initialState.count).toBe(0);
      expect(schema.models.logger.initialState.logs).toEqual([]);

      // Events should be preserved
      expect(schema.models.counter.events).toBeDefined();
      expect(schema.models.counter.events.increment).toBeDefined();
    });
  });

  describe('Event type inference', () => {
    it('should infer event creator parameter types', () => {
      const schema = createSchema()
        .model('todos', { items: [] as Array<{ id: number; text: string }> })
        .events({
          todoAdded: (text: string, priority: number) => ({ text, priority }),
          todoToggled: (id: number) => ({ id })
        })
        .build();

      // Verify events structure
      const app = createApp(schema);

      // Events should be callable (type checking at compile time)
      app.models.todos.emit.todoAdded('Buy milk', 1);
      app.models.todos.emit.todoToggled(123);

      expect(app.models.todos.schema.events).toBeDefined();
    });

    it('should infer event payload types', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .events({
          incremented: (amount: number, timestamp: Date) => ({
            amount,
            timestamp,
            newTotal: 0
          })
        })
        .build();

      const app = createApp(schema);

      // Create a subscription to verify payload structure
      const unsub = app.models.counter.on.incremented((payload) => {
        // TypeScript should know payload structure
        expect(typeof payload.amount).toBe('number');
        expect(payload.timestamp).toBeInstanceOf(Date);
        expect(typeof payload.newTotal).toBe('number');
      });

      app.models.counter.emit.incremented(5, new Date());

      unsub();
    });
  });

  describe('Builder chain type safety', () => {
    it('should maintain types after events()', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .events({
          increment: (n: number) => ({ n })
        })
        .model('logger', { logs: [] as string[] })
        .build();

      expect(schema.models.counter.events.increment).toBeDefined();
      expect(schema.models.logger.initialState.logs).toEqual([]);
    });

    it('should handle nested objects', () => {
      const schema = createSchema()
        .model('app', {
          user: {
            profile: {
              name: 'John',
              age: 30
            },
            settings: {
              theme: 'dark' as const
            }
          }
        })
        .build();

      expect(schema.models.app.initialState.user.profile.name).toBe('John');
      expect(schema.models.app.initialState.user.settings.theme).toBe('dark');
    });

    it('should handle array annotations', () => {
      type Todo = { id: number; text: string; completed: boolean };

      const schema = createSchema()
        .model('todos', {
          items: [] as Array<Todo>
        })
        .build();

      // Should accept correctly typed array
      const app = createApp(schema);
      app.models.todos.update((state) => {
        state.items.push({ id: 1, text: 'Task', completed: false });
      });

      expect(app.models.todos.readAt('items')).toHaveLength(1);
    });
  });

  describe('Edge cases and complex types', () => {
    it('should handle models with methods', () => {
      const schema = createSchema()
        .model('calculator', {
          value: 0,
          history: [] as number[]
        })
        .build();

      const app = createApp(schema);

      app.models.calculator.update((state) => {
        state.value = 42;
        state.history.push(state.value);
      });

      expect(app.models.calculator.readAt('value')).toBe(42);
      expect(app.models.calculator.readAt('history')).toEqual([42]);
    });

    it('should support readonly arrays', () => {
      const schema = createSchema()
        .model('constants', {
          values: [1, 2, 3] as readonly number[]
        })
        .build();

      expect(schema.models.constants.initialState.values).toEqual([1, 2, 3]);
    });

    it('should handle union types', () => {
      type Status = 'idle' | 'loading' | 'success' | 'error';

      const schema = createSchema()
        .model('api', {
          status: 'idle' as Status,
          data: null as any
        })
        .build();

      const app = createApp(schema);

      app.models.api.update((state) => {
        state.status = 'loading';
      });

      expect(app.models.api.readAt('status')).toBe('loading');
    });

    it('should handle complex nested structures', () => {
      interface User {
        id: number;
        name: string;
        profile: {
          bio: string;
          avatar: string;
        };
        friends: Array<{
          id: number;
          name: string;
        }>;
      }

      const schema = createSchema()
        .model('socialNetwork', {
          users: [] as User[],
          activeUserId: null as number | null
        })
        .build();

      const app = createApp(schema);

      app.models.socialNetwork.update((state) => {
        state.users.push({
          id: 1,
          name: 'Alice',
          profile: {
            bio: 'Hello!',
            avatar: '/avatar.png'
          },
          friends: []
        });
        state.activeUserId = 1;
      });

      expect(app.models.socialNetwork.readAt('users')).toHaveLength(1);
      expect(app.models.socialNetwork.readAt('activeUserId')).toBe(1);
    });

    it('should handle multiple event definitions', () => {
      const schema = createSchema()
        .model('counter', { count: 0 })
        .events({
          increment: (by: number) => ({ by }),
          decrement: (by: number) => ({ by }),
          reset: () => ({})
        })
        .build();

      const app = createApp(schema);

      // All events should be available
      expect(app.models.counter.emit.increment).toBeDefined();
      expect(app.models.counter.emit.decrement).toBeDefined();
      expect(app.models.counter.emit.reset).toBeDefined();

      // Should be able to subscribe to all events
      const unsubIncrement = app.models.counter.on.increment((p) => {
        expect(p.by).toBeDefined();
      });
      const unsubDecrement = app.models.counter.on.decrement((p) => {
        expect(p.by).toBeDefined();
      });
      const unsubReset = app.models.counter.on.reset(() => {
        // No payload
      });

      app.models.counter.emit.increment(5);
      app.models.counter.emit.decrement(3);
      app.models.counter.emit.reset();

      unsubIncrement();
      unsubDecrement();
      unsubReset();
    });
  });

  describe('Type inference with removeModel', () => {
    it('should update types after removeModel', () => {
      const schema = createSchema()
        .model('temp', { value: 0 })
        .model('user', { name: '' })
        .removeModel('temp')
        .build();

      // temp should not exist
      expect(schema.models.temp).toBeUndefined();
      // user should exist
      expect(schema.models.user).toBeDefined();
    });
  });

  describe('Type inference with extend', () => {
    it('should preserve types when extending', () => {
      const baseSchema = { models: { base: { initialState: { value: 1 } } }, events: {} };

      const schema = createSchema()
        .extend(baseSchema)
        .model('additional', { extra: 'data' })
        .build();

      // Both models should exist
      expect(schema.models.base).toBeDefined();
      expect(schema.models.additional).toBeDefined();
    });
  });
});
