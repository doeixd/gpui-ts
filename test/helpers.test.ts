import { describe, it, expect } from 'vitest'
import {
  createSchema,
  createModelSchema,
  mergeSchemas,
  validateSchema,
  introspectSchema,
  generateTypes,
  // validators,
  // combineValidators,
  // uiStatePlugin,
  // authPlugin,
  // routerPlugin,
  // notificationPlugin,
  // presets,
  type SchemaBuilder,
  type SchemaPlugin,
  type MergeSchemas,
  type ApplyPlugin,
  type ModelNames,
  type ModelState,
  type EventNames
} from '../src/helpers'

describe('Schema Builder API', () => {
  describe('createSchema', () => {
    it('should create a basic schema with models', () => {
      const schema = createSchema()
        .model('user', { name: '', email: '' })
        .model('counter', { count: 0 })
        .build()

      expect(schema.models.user.initialState).toEqual({ name: '', email: '' })
      expect(schema.models.counter.initialState).toEqual({ count: 0 })
    })

    it('should create schema with events', () => {
      const schema = createSchema()
        .events({
          login: { payload: { email: '', password: '' } },
          logout: { payload: {} }
        })
        .model('user', { name: '' })
        .build()

      expect(schema.events?.login.payload).toEqual({ email: '', password: '' })
      expect(schema.events?.logout.payload).toEqual({})
    })

    it('should support modelWithSchema for advanced model configuration', () => {
      const userModelSchema = createModelSchema({ name: '', age: 0 })
        .constraints({
          required: ['name'],
          validate: (state) => state.age >= 0 ? null : ['Age must be positive']
        })
        .build()

      const schema = createSchema()
        .modelWithSchema('user', userModelSchema)
        .build()

      expect(schema.models.user.constraints?.required).toEqual(['name'])
      expect(schema.models.user.initialState).toEqual({ name: '', age: 0 })
    })

    it('should support schema extension', () => {
      const baseSchema = createSchema()
        .model('user', { name: '' })
        .build()

      const extendedSchema = createSchema()
        .extend(baseSchema)
        .model('counter', { count: 0 })
        .build()

      expect(extendedSchema.models.user.initialState).toEqual({ name: '' })
      expect(extendedSchema.models.counter.initialState).toEqual({ count: 0 })
    })

    it('should support plugins', () => {
      const testPlugin: SchemaPlugin = {
        name: 'test',
        apply: (schema) => ({
          ...schema,
          models: {
            ...schema.models,
            test: { initialState: { value: 'test' } }
          }
        })
      }

      const schema = createSchema()
        .model('user', { name: '' })
        .plugin(testPlugin)
        .build()

      expect(schema.models.test.initialState).toEqual({ value: 'test' })
    })
  })

  describe('createModelSchema', () => {
    it('should create a basic model schema', () => {
      const schema = createModelSchema({ name: '', age: 0 }).build()

      expect(schema.initialState).toEqual({ name: '', age: 0 })
    })

    it('should support constraints', () => {
      const schema = createModelSchema({ name: '', age: 0 })
        .constraints({
          required: ['name'],
          readonly: ['id']
        })
        .build()

      expect(schema.constraints?.required).toEqual(['name'])
      expect(schema.constraints?.readonly).toEqual(['id'])
    })

    it('should support validation', () => {
      const schema = createModelSchema({ age: 0 })
        .validate((state) => state.age >= 0 ? null : ['Age must be positive'])
        .build()

      const validation = schema.constraints?.validate?.({ age: -5 })
      expect(validation).toEqual(['Age must be positive'])
    })

    it('should support computed properties', () => {
      const schema = createModelSchema({ firstName: '', lastName: '' })
        .computed({
          fullName: (state) => `${state.firstName} ${state.lastName}`.trim(),
          hasName: (state) => !!(state.firstName || state.lastName)
        })
        .build()

      expect(schema.computed?.fullName).toBeDefined()
      expect(schema.computed?.hasName).toBeDefined()
    })

    it('should support effects', () => {
      const schema = createModelSchema({ count: 0 })
        .effects({
          logChanges: (current, prev, ctx) => {
            if (current.count !== prev.count) {
              console.log(`Count changed from ${prev.count} to ${current.count}`)
            }
          }
        })
        .build()

      expect(schema.effects?.logChanges).toBeDefined()
    })

    it('should support middleware', () => {
      const schema = createModelSchema({ value: 'test' })
        .middleware({
          beforeUpdate: (state, updater) => {
            // Example middleware
            return undefined
          }
        })
        .build()

      expect(schema.middleware?.beforeUpdate).toBeDefined()
    })
  })

  describe('mergeSchemas', () => {
    it('should merge two schemas', () => {
      const schema1 = { models: { user: { initialState: { name: '' } } } }
      const schema2 = { models: { counter: { initialState: { count: 0 } } } }

      const merged = mergeSchemas(schema1, schema2)

      expect(merged.models.user.initialState).toEqual({ name: '' })
      expect(merged.models.counter.initialState).toEqual({ count: 0 })
    })

    it('should merge events', () => {
      const schema1 = { events: { login: { payload: { email: '' } } } }
      const schema2 = { events: { logout: { payload: {} } } }

      const merged = mergeSchemas(schema1, schema2)

      expect(merged.events?.login.payload).toEqual({ email: '' })
      expect(merged.events?.logout.payload).toEqual({})
    })

    it('should allow schema2 to override schema1', () => {
      const schema1 = { models: { user: { initialState: { name: 'John' } } } }
      const schema2 = { models: { user: { initialState: { name: 'Jane' } } } }

      const merged = mergeSchemas(schema1, schema2)

      expect(merged.models.user.initialState).toEqual({ name: 'Jane' })
    })
  })

  describe('validateSchema', () => {
    it('should validate a correct schema', () => {
      const schema = createSchema()
        .model('user', { name: '' })
        .build()

      const result = validateSchema(schema)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject schema without models', () => {
      const schema = { models: {} } as any

      const result = validateSchema(schema)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'MISSING_MODELS')).toBe(true)
    })

    it('should reject invalid model names', () => {
      const schema = createSchema()
        .model('123invalid', { value: 0 })
        .build()

      const result = validateSchema(schema)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.code === 'INVALID_MODEL_NAME')).toBe(true)
    })
  })

  describe('introspectSchema', () => {
    it('should provide basic schema information', () => {
      const schema = createSchema()
        .events({ increment: { payload: {} } })
        .model('user', { name: '' })
        .model('counter', { count: 0 })
        .build()

      const info = introspectSchema(schema)

      expect(info.modelCount).toBe(2)
      expect(info.eventCount).toBe(1)
      expect(info.modelNames).toEqual(['user', 'counter'])
      expect(info.eventNames).toEqual(['increment'])
    })

    it('should analyze schema complexity', () => {
      const simpleSchema = createSchema()
        .model('user', { name: '' })
        .build()

      const complexSchema = createSchema()
        .model('m1', { v: 0 })
        .model('m2', { v: 0 })
        .model('m3', { v: 0 })
        .model('m4', { v: 0 })
        .model('m5', { v: 0 })
        .model('m6', { v: 0 })
        .build()

      const simpleInfo = introspectSchema(simpleSchema)
      const complexInfo = introspectSchema(complexSchema)

      expect(simpleInfo.complexity.simple).toBe(true)
      expect(complexInfo.complexity.simple).toBe(false)
    })

    // it('should detect common patterns', () => {
    //   const authSchema = createSchema()
    //     .plugin(authPlugin)
    //     .build()

    //   const info = introspectSchema(authSchema)

    //   expect(info.patterns.hasAuth).toBe(true)
    // })
  })

  describe('generateTypes', () => {
    it('should generate TypeScript interfaces for models', () => {
      const schema = createSchema()
        .model('user', { name: '', age: 0 })
        .build()

      const types = generateTypes(schema)

      expect(types).toContain('interface UserState')
      expect(types).toContain('name: any')
      expect(types).toContain('age: any')
    })

    it('should generate types for events', () => {
      const schema = createSchema()
        .events({
          login: { payload: { email: '', password: '' } }
        })
        .model('user', { name: '' })
        .build()

      const types = generateTypes(schema)

      expect(types).toContain('type LoginEvent')
      expect(types).toContain('email: any')
      expect(types).toContain('password: any')
    })
  })

  // describe('combineValidators', () => {
  //   it('should combine multiple validators', () => {
  //     const combined = combineValidators(
  //       validators.required('name'),
  //       validators.minLength('name', 2)
  //     )

  //     expect(combined({ name: 'John' })).toBeNull()
  //     expect(combined({ name: '' })).toEqual(['name is required'])
  //     expect(combined({ name: 'J' })).toEqual(['name must be at least 2 characters'])
  //   })

  //   it('should aggregate errors from multiple validators', () => {
  //     const combined = combineValidators(
  //       validators.required('name'),
  //       validators.minLength('name', 5)
  //     )

  //     const errors = combined({ name: '' })
  //     expect(errors).toContain('name is required')
  //   })
  // })

  // describe('Built-in Plugins', () => {
  //   it('should apply uiStatePlugin', () => {
  //     const schema = createSchema()
  //       .plugin(uiStatePlugin)
  //       .build()

  //     expect(schema.models.ui).toBeDefined()
  //     expect(schema.models.ui.initialState).toHaveProperty('loading')
  //     expect(schema.models.ui.initialState).toHaveProperty('error')
  //     expect(schema.models.ui.initialState).toHaveProperty('selectedId')
  //   })

  //   it('should apply authPlugin', () => {
  //     const schema = createSchema()
  //       .plugin(authPlugin)
  //       .build()

  //     expect(schema.models.auth).toBeDefined()
  //     expect(schema.models.auth.initialState).toHaveProperty('user')
  //     expect(schema.models.auth.initialState).toHaveProperty('isAuthenticated')
  //     expect(schema.events).toHaveProperty('login')
  //     expect(schema.events).toHaveProperty('logout')
  //   })

  //   it('should apply routerPlugin', () => {
  //     const schema = createSchema()
  //       .plugin(routerPlugin)
  //       .build()

  //     expect(schema.models.router).toBeDefined()
  //     expect(schema.models.router.initialState).toHaveProperty('currentRoute')
  //     expect(schema.models.router.initialState).toHaveProperty('params')
  //     expect(schema.events).toHaveProperty('navigate')
  //     expect(schema.events).toHaveProperty('goBack')
  //   })

  //   it('should apply notificationPlugin', () => {
  //     const schema = createSchema()
  //       .plugin(notificationPlugin)
  //       .build()

  //     expect(schema.models.notifications).toBeDefined()
  //     expect(schema.models.notifications.initialState).toHaveProperty('items')
  //     expect(schema.events).toHaveProperty('showNotification')
  //     expect(schema.events).toHaveProperty('dismissNotification')
  //   })
  // })

  // describe('Presets', () => {
  //   it('should create CRUD preset', () => {
  //     const schema = presets.crud('product')

  //     expect(schema.models.product).toBeDefined()
  //     expect(schema.models.product.initialState).toHaveProperty('items')
  //     expect(schema.models.product.initialState).toHaveProperty('loading')
  //     expect(schema.models.ui).toBeDefined() // From uiStatePlugin
  //   })

  //   it('should create todo preset', () => {
  //     const schema = presets.todo()

  //     expect(schema.models.todos).toBeDefined()
  //     expect(schema.models.ui).toBeDefined()
  //     expect(schema.events).toHaveProperty('todoAdded')
  //     expect(schema.events).toHaveProperty('todoToggled')
  //   })

  //   it('should create authApp preset', () => {
  //     const schema = presets.authApp()

  //     expect(schema.models.auth).toBeDefined()
  //     expect(schema.models.ui).toBeDefined()
  //     expect(schema.models.notifications).toBeDefined()
  //   })

  //   it('should create SPA preset', () => {
  //     const schema = presets.spa()

  //     expect(schema.models.auth).toBeDefined()
  //     expect(schema.models.router).toBeDefined()
  //     expect(schema.models.ui).toBeDefined()
  //     expect(schema.models.notifications).toBeDefined()
  //   })
  // })

  describe('Type Utilities', () => {
    it('should correctly infer ModelNames', () => {
      const schema = createSchema()
        .model('user', { name: '' })
        .model('counter', { count: 0 })
        .build()

      type Names = ModelNames<typeof schema>
      const names: Names[] = ['user', 'counter']
      expect(names).toEqual(['user', 'counter'])
    })

    it('should correctly infer ModelState', () => {
      const schema = createSchema()
        .model('user', { name: 'John', age: 30 })
        .build()

      type UserState = ModelState<typeof schema, 'user'>
      const state: UserState = { name: 'Jane', age: 25 }
      expect(state.name).toBe('Jane')
      expect(state.age).toBe(25)
    })

    it('should correctly infer EventNames', () => {
      const schema = createSchema()
        .model('user', { name: '' })
        .events({
          login: { payload: { email: '' } },
          logout: { payload: {} }
        })
        .build()

      type Events = EventNames<typeof schema>
      const events: Events[] = ['login', 'logout']
      expect(events).toEqual(['login', 'logout'])
    })
  })

  describe('Schema Builder Type Safety', () => {
    it('should maintain type safety through builder chain', () => {
      const builder = createSchema()
        .model('user', { name: '', email: '' })
        .model('counter', { count: 0 })

      // TypeScript should infer the correct schema type
      const schema = builder.build()

      expect(schema.models.user.initialState.name).toBe('')
      expect(schema.models.counter.initialState.count).toBe(0)
    })

    it('should support plugin type inference', () => {
      const testPlugin: SchemaPlugin = {
        name: 'test',
        apply: (schema) => ({
          ...schema,
          models: {
            ...schema.models,
            testModel: { initialState: { value: 42 } }
          }
        })
      }

      const builder = createSchema()
        .model('user', { name: '' })
        .plugin(testPlugin)

      const schema = builder.build()

      expect(schema.models.testModel.initialState.value).toBe(42)
    })
  })
})