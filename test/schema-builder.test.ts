import { describe, it, expect } from 'vitest'
import { createApp, defineModel, type AppSchema, type ModelSchema } from '../dist/esm/development/index.js'

describe('Schema Builder API', () => {
  describe('defineModel', () => {
    it('should create a model definition with type inference', () => {
      const UserModel = defineModel('user')({
        initialState: {
          id: 1,
          name: 'John',
          email: 'john@example.com'
        },
        constraints: {
          required: ['name', 'email'],
          validate: (state) => {
            const errors = []
            if (!state.email.includes('@')) errors.push('Invalid email')
            return errors.length > 0 ? errors : null
          }
        }
      })

      expect(UserModel.name).toBe('user')
      expect(UserModel.schema.initialState).toEqual({
        id: 1,
        name: 'John',
        email: 'john@example.com'
      })
      expect(UserModel.schema.constraints?.required).toEqual(['name', 'email'])
    })

    it('should support computed properties in schema', () => {
      const CalculatorModel = defineModel('calculator')({
        initialState: { a: 2, b: 3 },
        computed: {
          sum: (state) => state.a + state.b,
          product: (state) => state.a * state.b
        }
      })

      expect(CalculatorModel.schema.computed?.sum).toBeDefined()
      expect(CalculatorModel.schema.computed?.product).toBeDefined()
    })

    it('should support effects in schema', () => {
      const CounterModel = defineModel('counter')({
        initialState: { count: 0 },
        effects: {
          logChanges: (state, prev, ctx) => {
            if (state.count !== prev.count) {
              console.log(`Count changed from ${prev.count} to ${state.count}`)
            }
          }
        }
      })

      expect(CounterModel.schema.effects?.logChanges).toBeDefined()
    })

    it('should support middleware in schema', () => {
      const SecureModel = defineModel('secure')({
        initialState: { secret: 'hidden' },
        middleware: {
          beforeUpdate: (state, updater) => {
            // Prevent updates to secret field
            if (typeof updater === 'function') {
              return state // Don't allow updates
            }
            return undefined // Allow updates
          }
        }
      })

      expect(SecureModel.schema.middleware?.beforeUpdate).toBeDefined()
    })
  })

  describe('createApp with AppSchema', () => {
    it('should create app with multiple models from schema', () => {
      const schema: AppSchema = {
        models: {
          user: {
            initialState: { name: 'John', age: 30 }
          },
          counter: {
            initialState: { count: 0 }
          },
          settings: {
            initialState: { theme: 'light', notifications: true }
          }
        }
      }

      const app = createApp(schema)

      expect(app.models.user).toBeDefined()
      expect(app.models.counter).toBeDefined()
      expect(app.models.settings).toBeDefined()

      expect(app.models.user.read()).toEqual({ name: 'John', age: 30 })
      expect(app.models.counter.read()).toEqual({ count: 0 })
      expect(app.models.settings.read()).toEqual({ theme: 'light', notifications: true })
    })

    it('should provide full type inference for models', () => {
      const schema = {
        models: {
          user: {
            initialState: {
              id: 1,
              profile: {
                name: 'John',
                email: 'john@example.com'
              }
            }
          },
          todos: {
            initialState: {
              items: [] as Array<{ id: number; text: string; completed: boolean }>
            }
          }
        }
      } satisfies AppSchema

      const app = createApp(schema)

      // TypeScript should infer the correct types
      const user = app.models.user.read()
      expect(user.id).toBe(1)
      expect(user.profile.name).toBe('John')

      const todos = app.models.todos.read()
      expect(Array.isArray(todos.items)).toBe(true)
    })

    it('should support events in app schema', () => {
      const schema: AppSchema = {
        models: {
          counter: { initialState: { count: 0 } }
        },
        events: {
          increment: { payload: { amount: 5 } },
          reset: { payload: {} }
        }
      }

      const app = createApp(schema)

      // Events should be accessible through the event scope
      expect(app.events).toBeDefined()
      expect(typeof app.events.createTopic).toBe('function')
    })

    it('should initialize models with schema constraints', () => {
      const schema: AppSchema = {
        models: {
          user: {
            initialState: { name: '', email: '' },
            schema: {
              constraints: {
                required: ['name'],
                validate: (state) => {
                  const errors = []
                  if (!state.name.trim()) errors.push('Name is required')
                  if (state.email && !state.email.includes('@')) errors.push('Invalid email')
                  return errors.length > 0 ? errors : null
                }
              }
            }
          }
        }
      }

      const app = createApp(schema)

      const validation = app.models.user.validate()
      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.message === 'Name is required')).toBe(true)
    })

    it('should support readonly fields in schema', () => {
      const schema: AppSchema = {
        models: {
          immutable: {
            initialState: { id: 123, name: 'Immutable' },
            schema: {
              constraints: {
                readonly: ['id']
              }
            }
          }
        }
      }

      const app = createApp(schema)

      // The readonly constraint should be part of the schema
      expect(app.models.immutable.schema.constraints?.readonly).toEqual(['id'])
    })
  })

  describe('Schema Composition', () => {
    it('should allow composing schemas', () => {
      const BaseUserSchema: ModelSchema<{ name: string; email: string }> = {
        initialState: { name: '', email: '' },
        constraints: {
          required: ['name', 'email']
        }
      }

      const AdminUserSchema: ModelSchema<{ name: string; email: string; role: string }> = {
        initialState: { name: '', email: '', role: 'admin' },
        constraints: {
          ...BaseUserSchema.constraints,
          required: ['name', 'email', 'role']
        }
      }

      const schema: AppSchema = {
        models: {
          admin: AdminUserSchema
        }
      }

      const app = createApp(schema)

      expect(app.models.admin.read().role).toBe('admin')
      expect(app.models.admin.schema.constraints?.required).toContain('role')
    })

    it('should support schema inheritance patterns', () => {
      const createTimestampedModel = <T extends Record<string, any>>(
        name: string,
        baseSchema: ModelSchema<T>
      ): ModelSchema<T & { createdAt: Date; updatedAt: Date }> => ({
        initialState: {
          ...baseSchema.initialState,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        constraints: baseSchema.constraints,
        computed: baseSchema.computed,
        effects: {
          ...baseSchema.effects,
          updateTimestamp: (state, prev, ctx) => {
            if (state !== prev) {
              (state as any).updatedAt = new Date()
            }
          }
        },
        middleware: baseSchema.middleware
      })

      const timestampedUserSchema = createTimestampedModel('user', {
        initialState: { name: 'John', email: 'john@example.com' }
      })

      const schema: AppSchema = {
        models: {
          user: timestampedUserSchema
        }
      }

      const app = createApp(schema)

      const user = app.models.user.read()
      expect(user.createdAt).toBeInstanceOf(Date)
      expect(user.updatedAt).toBeInstanceOf(Date)
      expect(user.name).toBe('John')
    })
  })

  describe('Plugin System (Extensibility)', () => {
    it('should allow extending app with custom plugins', () => {
      // Since plugins aren't implemented yet, test that the schema is extensible
      const schema: AppSchema = {
        models: {
          counter: { initialState: { count: 0 } }
        }
      }

      const app = createApp(schema)

      // Test that we can add custom properties to the app
      const extendedApp = {
        ...app,
        customPlugin: {
          getCount: () => app.models.counter.read().count,
          increment: () => app.models.counter.update(s => { s.count++ })
        }
      }

      expect(extendedApp.customPlugin.getCount()).toBe(0)
      extendedApp.customPlugin.increment()
      expect(extendedApp.customPlugin.getCount()).toBe(1)
    })

    it('should support schema plugins for common patterns', () => {
      // Test schema plugins concept
      const withValidation = <T>(schema: ModelSchema<T>, validator: (state: T) => string[] | null) => ({
        ...schema,
        constraints: {
          ...schema.constraints,
          validate: (state: T) => {
            const baseErrors = schema.constraints?.validate?.(state) || []
            const pluginErrors = validator(state) || []
            return [...baseErrors, ...pluginErrors]
          }
        }
      })

      const userSchema = withValidation(
        {
          initialState: { name: '', age: 0 }
        },
        (state) => {
          const errors = []
          if (state.age < 0) errors.push('Age cannot be negative')
          if (state.age > 150) errors.push('Age seems unrealistic')
          return errors.length > 0 ? errors : null
        }
      )

      const schema: AppSchema = {
        models: {
          user: userSchema
        }
      }

      const app = createApp(schema)

      app.models.user.update(s => { s.age = -5 })
      const validation = app.models.user.validate()
      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.message.includes('negative'))).toBe(true)
    })
  })

  describe('Advanced Schema Features', () => {
    it('should support complex nested schemas', () => {
      const complexSchema: AppSchema = {
        models: {
          app: {
            initialState: {
              user: {
                profile: {
                  personal: {
                    name: 'John',
                    age: 30
                  },
                  preferences: {
                    theme: 'dark',
                    language: 'en'
                  }
                },
                settings: {
                  notifications: true,
                  privacy: 'public'
                }
              },
              ui: {
                sidebar: {
                  collapsed: false,
                  width: 250
                }
              }
            },
            schema: {
              constraints: {
                validate: (state) => {
                  const errors = []
                  if (state.user.profile.personal.age < 0) {
                    errors.push('Age cannot be negative')
                  }
                  return errors.length > 0 ? errors : null
                }
              }
            }
          }
        }
      }

      const app = createApp(complexSchema)

      const state = app.models.app.read()
      expect(state.user.profile.personal.name).toBe('John')
      expect(state.ui.sidebar.width).toBe(250)

      // Test validation on nested properties
      app.models.app.update(s => { s.user.profile.personal.age = -10 })
      const validation = app.models.app.validate()
      expect(validation.valid).toBe(false)
    })

    it('should support array schemas with validation', () => {
      const arraySchema: AppSchema = {
        models: {
          todos: {
            initialState: {
              items: [] as Array<{ id: number; text: string; completed: boolean }>
            },
            schema: {
              constraints: {
                validate: (state) => {
                  const errors = []
                  const duplicateIds = state.items.filter((item, index, arr) =>
                    arr.findIndex(i => i.id === item.id) !== index
                  )
                  if (duplicateIds.length > 0) {
                    errors.push('Duplicate todo IDs found')
                  }
                  return errors.length > 0 ? errors : null
                }
              }
            }
          }
        }
      }

      const app = createApp(arraySchema)

      app.models.todos.update(s => {
        s.items = [
          { id: 1, text: 'Task 1', completed: false },
          { id: 2, text: 'Task 2', completed: false },
          { id: 1, text: 'Duplicate', completed: false }
        ]
      })

      const validation = app.models.todos.validate()
      expect(validation.valid).toBe(false)
      expect(validation.errors.some(e => e.message.includes('Duplicate'))).toBe(true)
    })

    it('should support schema with computed properties depending on other models', () => {
      // Note: This tests the concept, though actual cross-model computed properties
      // would need additional implementation
      const schema: AppSchema = {
        models: {
          counter: {
            initialState: { count: 0 },
            computed: {
              isEven: (state) => state.count % 2 === 0
            }
          },
          display: {
            initialState: { message: '' },
            effects: {
              syncWithCounter: (state, prev, ctx) => {
                // This would ideally be a computed property, but for now testing effects
                ctx.emit({ type: 'counter-changed' })
              }
            }
          }
        }
      }

      const app = createApp(schema)

      const isEven = app.models.counter.compute('isEven', s => s.count % 2 === 0)
      expect(isEven()).toBe(true)

      app.models.counter.update(s => { s.count = 3 })
      expect(isEven()).toBe(false)
    })
  })
})