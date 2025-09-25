/**
 * GPUI-TS Schema Helpers
 * ======================
 * 
 * Type-safe, ergonomic utilities for building, extending, and composing
 * AppSchemas with maximum developer experience and compile-time safety.
 * 
 * Features:
 * - Fluent schema builder API
 * - Schema composition and merging
 * - Type-safe model extensions
 * - Validation and constraints helpers
 * - Plugin system for schema augmentation
 * - Development utilities
 */

import type { AppSchema, ModelSchema, ValidationResult, Path, PathValue } from './gpui-ts'

// =============================================================================
// SCHEMA BUILDER TYPES
// =============================================================================

/**
 * Fluent schema builder interface
 */
interface SchemaBuilder<TSchema extends Partial<AppSchema> = {}> {
  // Add models
  model<TName extends string, TState>(
    name: TName,
    initialState: TState
  ): SchemaBuilder<TSchema & { 
    models: TSchema['models'] extends Record<string, any> 
      ? TSchema['models'] & { [K in TName]: { initialState: TState } }
      : { [K in TName]: { initialState: TState } }
  }>
  
  // Add model with full schema
  modelWithSchema<TName extends string, TState>(
    name: TName,
    schema: ModelSchema<TState>
  ): SchemaBuilder<TSchema & {
    models: TSchema['models'] extends Record<string, any>
      ? TSchema['models'] & { [K in TName]: { initialState: TState; schema: ModelSchema<TState> } }
      : { [K in TName]: { initialState: TState; schema: ModelSchema<TState> } }
  }>
  
  // Add events
  events<TEvents extends Record<string, { payload: any; for?: string }>>(
    events: TEvents
  ): SchemaBuilder<TSchema & { events: TEvents }>
  
  // Extend existing schema
  extend<TExtension extends Partial<AppSchema>>(
    extension: TExtension
  ): SchemaBuilder<MergeSchemas<TSchema, TExtension>>
  
  // Apply plugins
  plugin<TPlugin extends SchemaPlugin>(
    plugin: TPlugin
  ): SchemaBuilder<ApplyPlugin<TSchema, TPlugin>>
  
  // Build final schema
  build(): TSchema extends AppSchema ? TSchema : never
}

/**
 * Schema plugin interface
 */
interface SchemaPlugin<TInput extends Partial<AppSchema> = any, TOutput extends Partial<AppSchema> = any> {
  name: string
  apply(schema: TInput): TOutput
}

// =============================================================================
// TYPE UTILITIES FOR SCHEMA MANIPULATION
// =============================================================================

/**
 * Merge two schemas with proper type inference
 */
type MergeSchemas<T1 extends Partial<AppSchema>, T2 extends Partial<AppSchema>> = {
  models: T1['models'] extends Record<string, any>
    ? T2['models'] extends Record<string, any>
      ? T1['models'] & T2['models']
      : T1['models']
    : T2['models'] extends Record<string, any>
      ? T2['models']
      : {}
  events?: T1['events'] extends Record<string, any>
    ? T2['events'] extends Record<string, any>
      ? T1['events'] & T2['events']
      : T1['events']
    : T2['events'] extends Record<string, any>
      ? T2['events']
      : undefined
}

/**
 * Apply plugin transformation to schema
 */
type ApplyPlugin<TSchema extends Partial<AppSchema>, TPlugin extends SchemaPlugin> = 
  TPlugin extends SchemaPlugin<any, infer TOutput> ? MergeSchemas<TSchema, TOutput> : TSchema

/**
 * Extract model names from schema
 */
type ModelNames<TSchema extends AppSchema> = keyof TSchema['models']

/**
 * Extract model state type by name
 */
type ModelState<TSchema extends AppSchema, TName extends ModelNames<TSchema>> = 
  TSchema['models'][TName]['initialState']

/**
 * Extract event names from schema
 */
type EventNames<TSchema extends AppSchema> = TSchema['events'] extends Record<string, any>
  ? keyof TSchema['events']
  : never

// =============================================================================
// SCHEMA BUILDER IMPLEMENTATION
// =============================================================================

/**
 * Create a new schema builder
 */
function createSchema(): SchemaBuilder<{}> {
  const currentSchema: Partial<AppSchema> = {
    models: {},
    events: {}
  }
  
  const builder: SchemaBuilder<any> = {
    model: <TName extends string, TState>(name: TName, initialState: TState) => {
      const newSchema = {
        ...currentSchema,
        models: {
          ...currentSchema.models,
          [name]: { initialState }
        }
      }
      return createBuilderWithSchema(newSchema)
    },
    
    modelWithSchema: <TName extends string, TState>(
      name: TName,
      schema: ModelSchema<TState>
    ) => {
      const newSchema = {
        ...currentSchema,
        models: {
          ...currentSchema.models,
          [name]: { initialState: schema.initialState, schema }
        }
      }
      return createBuilderWithSchema(newSchema)
    },
    
    events: <TEvents extends Record<string, { payload: any; for?: string }>>(
      events: TEvents
    ) => {
      const newSchema = {
        ...currentSchema,
        events: { ...currentSchema.events, ...events }
      }
      return createBuilderWithSchema(newSchema)
    },
    
    extend: <TExtension extends Partial<AppSchema>>(extension: TExtension) => {
      const newSchema = mergeSchemas(currentSchema, extension)
      return createBuilderWithSchema(newSchema)
    },
    
    plugin: <TPlugin extends SchemaPlugin>(plugin: TPlugin) => {
      const newSchema = plugin.apply(currentSchema)
      return createBuilderWithSchema(newSchema)
    },
    
    build: () => {
      if (!currentSchema.models || Object.keys(currentSchema.models).length === 0) {
        throw new Error('Schema must contain at least one model')
      }
      return currentSchema as any
    }
  }
  
  return builder
}

/**
 * Internal helper to create builder with existing schema
 */
function createBuilderWithSchema(schema: Partial<AppSchema>): SchemaBuilder<any> {
  return {
    model: <TName extends string, TState>(name: TName, initialState: TState) => {
      const newSchema = {
        ...schema,
        models: {
          ...schema.models,
          [name]: { initialState }
        }
      }
      return createBuilderWithSchema(newSchema)
    },
    
    modelWithSchema: <TName extends string, TState>(
      name: TName,
      modelSchema: ModelSchema<TState>
    ) => {
      const newSchema = {
        ...schema,
        models: {
          ...schema.models,
          [name]: { initialState: modelSchema.initialState, schema: modelSchema }
        }
      }
      return createBuilderWithSchema(newSchema)
    },
    
    events: <TEvents extends Record<string, { payload: any; for?: string }>>(
      events: TEvents
    ) => {
      const newSchema = {
        ...schema,
        events: { ...schema.events, ...events }
      }
      return createBuilderWithSchema(newSchema)
    },
    
    extend: <TExtension extends Partial<AppSchema>>(extension: TExtension) => {
      const newSchema = mergeSchemas(schema, extension)
      return createBuilderWithSchema(newSchema)
    },
    
    plugin: <TPlugin extends SchemaPlugin>(plugin: TPlugin) => {
      const newSchema = plugin.apply(schema)
      return createBuilderWithSchema(newSchema)
    },
    
    build: () => {
      if (!schema.models || Object.keys(schema.models).length === 0) {
        throw new Error('Schema must contain at least one model')
      }
      return schema as any
    }
  }
}

/**
 * Merge two schemas at runtime
 */
function mergeSchemas(
  schema1: Partial<AppSchema>, 
  schema2: Partial<AppSchema>
): Partial<AppSchema> {
  return {
    models: { ...schema1.models, ...schema2.models },
    events: { ...schema1.events, ...schema2.events }
  }
}

// =============================================================================
// MODEL SCHEMA HELPERS
// =============================================================================

/**
 * Create model schema with fluent API
 */
function createModelSchema<T>(initialState: T) {
  let schema: ModelSchema<T> = { initialState }
  
  return {
    // Add constraints
    constraints(constraints: NonNullable<ModelSchema<T>['constraints']>) {
      schema.constraints = constraints
      return this
    },
    
    // Add validation
    validate(validator: (state: T) => string[] | null) {
      schema.constraints = { ...schema.constraints, validate: validator }
      return this
    },
    
    // Add computed properties
    computed<TComputed extends Record<string, (state: T) => any>>(computed: TComputed) {
      schema.computed = { ...schema.computed, ...computed }
      return this
    },
    
    // Add effects
    effects<TEffects extends Record<string, (state: T, prev: T, ctx: any) => void>>(effects: TEffects) {
      schema.effects = { ...schema.effects, ...effects }
      return this
    },
    
    // Add middleware
    middleware(middleware: NonNullable<ModelSchema<T>['middleware']>) {
      schema.middleware = middleware
      return this
    },
    
    // Build the schema
    build(): ModelSchema<T> {
      return schema
    }
  }
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Common validation rules
 */
const validators = {
  required: <T>(path: Path<T>) => (state: T): string[] | null => {
    const value = getPathValue(state, path)
    return value == null ? [`${String(path)} is required`] : null
  },
  
  minLength: <T>(path: Path<T>, min: number) => (state: T): string[] | null => {
    const value = getPathValue(state, path)
    if (typeof value === 'string' && value.length < min) {
      return [`${String(path)} must be at least ${min} characters`]
    }
    return null
  },
  
  maxLength: <T>(path: Path<T>, max: number) => (state: T): string[] | null => {
    const value = getPathValue(state, path)
    if (typeof value === 'string' && value.length > max) {
      return [`${String(path)} must be no more than ${max} characters`]
    }
    return null
  },
  
  email: <T>(path: Path<T>) => (state: T): string[] | null => {
    const value = getPathValue(state, path)
    if (typeof value === 'string' && !value.includes('@')) {
      return [`${String(path)} must be a valid email address`]
    }
    return null
  },
  
  range: <T>(path: Path<T>, min: number, max: number) => (state: T): string[] | null => {
    const value = getPathValue(state, path)
    if (typeof value === 'number' && (value < min || value > max)) {
      return [`${String(path)} must be between ${min} and ${max}`]
    }
    return null
  },
  
  custom: <T>(path: Path<T>, validator: (value: any) => boolean, message: string) => (state: T): string[] | null => {
    const value = getPathValue(state, path)
    return validator(value) ? null : [message]
  }
}

/**
 * Combine multiple validators
 */
function combineValidators<T>(...validators: Array<(state: T) => string[] | null>) {
  return (state: T): string[] | null => {
    const errors: string[] = []
    for (const validator of validators) {
      const result = validator(state)
      if (result) errors.push(...result)
    }
    return errors.length > 0 ? errors : null
  }
}

// =============================================================================
// BUILT-IN PLUGINS
// =============================================================================

/**
 * Plugin to add common UI state patterns
 */
const uiStatePlugin: SchemaPlugin = {
  name: 'uiState',
  apply: (schema) => ({
    ...schema,
    models: {
      ...schema.models,
      ui: {
        initialState: {
          loading: false,
          error: null as string | null,
          selectedId: null as string | number | null,
          searchText: '',
          sortBy: 'name' as string,
          sortDirection: 'asc' as 'asc' | 'desc'
        }
      }
    }
  })
}

/**
 * Plugin to add authentication state
 */
const authPlugin: SchemaPlugin = {
  name: 'auth',
  apply: (schema) => ({
    ...schema,
    models: {
      ...schema.models,
      auth: {
        initialState: {
          user: null as { id: string; name: string; email: string } | null,
          isAuthenticated: false,
          token: null as string | null,
          permissions: [] as string[]
        }
      }
    },
    events: {
      ...schema.events,
      login: { payload: { email: string; password: string } },
      logout: { payload: {} },
      tokenRefresh: { payload: { token: string } }
    }
  })
}

/**
 * Plugin to add router state
 */
const routerPlugin: SchemaPlugin = {
  name: 'router',
  apply: (schema) => ({
    ...schema,
    models: {
      ...schema.models,
      router: {
        initialState: {
          currentRoute: '/' as string,
          params: {} as Record<string, string>,
          query: {} as Record<string, string>,
          history: [] as string[]
        }
      }
    },
    events: {
      ...schema.events,
      navigate: { payload: { path: string; replace?: boolean } },
      goBack: { payload: {} },
      goForward: { payload: {} }
    }
  })
}

/**
 * Plugin to add notification system
 */
const notificationPlugin: SchemaPlugin = {
  name: 'notifications',
  apply: (schema) => ({
    ...schema,
    models: {
      ...schema.models,
      notifications: {
        initialState: {
          items: [] as Array<{
            id: string
            type: 'info' | 'success' | 'warning' | 'error'
            title: string
            message: string
            timestamp: Date
            dismissed: boolean
          }>
        }
      }
    },
    events: {
      ...schema.events,
      showNotification: { 
        payload: { 
          type: 'info' | 'success' | 'warning' | 'error'
          title: string
          message: string 
        } 
      },
      dismissNotification: { payload: { id: string } },
      clearAllNotifications: { payload: {} }
    }
  })
}

// =============================================================================
// DEVELOPMENT UTILITIES
// =============================================================================

/**
 * Validate schema at build time
 */
function validateSchema<TSchema extends AppSchema>(schema: TSchema): ValidationResult<TSchema> {
  const errors: Array<{ path: string; message: string; code: string }> = []
  
  // Check for empty models
  if (!schema.models || Object.keys(schema.models).length === 0) {
    errors.push({
      path: 'models',
      message: 'Schema must contain at least one model',
      code: 'MISSING_MODELS'
    })
  }
  
  // Validate model names
  Object.keys(schema.models || {}).forEach(modelName => {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(modelName)) {
      errors.push({
        path: `models.${modelName}`,
        message: 'Model names must be valid identifiers',
        code: 'INVALID_MODEL_NAME'
      })
    }
  })
  
  // Check for circular dependencies (simplified)
  // Real implementation would do proper dependency analysis
  
  return {
    valid: errors.length === 0,
    errors: errors as any
  }
}

/**
 * Generate TypeScript type definitions from schema
 */
function generateTypes<TSchema extends AppSchema>(schema: TSchema): string {
  const modelTypes = Object.entries(schema.models).map(([name, model]) => {
    const stateName = `${capitalize(name)}State`
    return `interface ${stateName} ${JSON.stringify(model.initialState, null, 2).replace(/"/g, '')}`
  }).join('\n\n')
  
  const eventTypes = schema.events ? Object.entries(schema.events).map(([name, event]) => {
    return `type ${capitalize(name)}Event = ${JSON.stringify(event.payload, null, 2).replace(/"/g, '')}`
  }).join('\n\n') : ''
  
  return `${modelTypes}\n\n${eventTypes}`
}

/**
 * Schema introspection utilities
 */
function introspectSchema<TSchema extends AppSchema>(schema: TSchema) {
  return {
    modelCount: Object.keys(schema.models).length,
    eventCount: schema.events ? Object.keys(schema.events).length : 0,
    modelNames: Object.keys(schema.models),
    eventNames: schema.events ? Object.keys(schema.events) : [],
    
    // Analyze complexity
    complexity: {
      simple: Object.keys(schema.models).length <= 3,
      moderate: Object.keys(schema.models).length <= 10,
      complex: Object.keys(schema.models).length > 10
    },
    
    // Check for common patterns
    patterns: {
      hasAuth: 'auth' in schema.models,
      hasUI: 'ui' in schema.models,
      hasRouter: 'router' in schema.models,
      hasNotifications: 'notifications' in schema.models
    }
  }
}

// =============================================================================
// PRESET SCHEMAS
// =============================================================================

/**
 * Common preset schemas for quick setup
 */
const presets = {
  /**
   * Basic CRUD application with UI state
   */
  crud: <TEntity>(entityName: string, entityState: TEntity) => 
    createSchema()
      .model(entityName, { items: [] as TEntity[], loading: false })
      .plugin(uiStatePlugin)
      .build(),
  
  /**
   * Todo application preset
   */
  todo: () =>
    createSchema()
      .model('todos', {
        items: [] as Array<{ id: number; text: string; completed: boolean }>,
        filter: 'all' as 'all' | 'active' | 'completed',
        nextId: 1
      })
      .model('ui', {
        newTodoText: '',
        editingId: null as number | null,
        editingText: ''
      })
      .events({
        todoAdded: { payload: { text: string } },
        todoToggled: { payload: { id: number } },
        todoDeleted: { payload: { id: number } }
      })
      .build(),
  
  /**
   * Authentication-enabled application
   */
  authApp: () =>
    createSchema()
      .plugin(authPlugin)
      .plugin(uiStatePlugin)
      .plugin(notificationPlugin)
      .build(),
  
  /**
   * Full-featured SPA
   */
  spa: () =>
    createSchema()
      .plugin(authPlugin)
      .plugin(routerPlugin)
      .plugin(uiStatePlugin)
      .plugin(notificationPlugin)
      .build()
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get value at path (simplified implementation)
 */
function getPathValue<T>(obj: T, path: Path<T>): any {
  return String(path).split('.').reduce((current: any, key) => current?.[key], obj)
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Core functions
  createSchema,
  createModelSchema,
  mergeSchemas,
  validateSchema,
  introspectSchema,
  generateTypes,
  
  // Validation helpers
  validators,
  combineValidators,
  
  // Built-in plugins
  uiStatePlugin,
  authPlugin,
  routerPlugin,
  notificationPlugin,
  
  // Presets
  presets,
  
  // Types
  type SchemaBuilder,
  type SchemaPlugin,
  type MergeSchemas,
  type ApplyPlugin,
  type ModelNames,
  type ModelState,
  type EventNames
}

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/*
// 1. Fluent schema building
const MyAppSchema = createSchema()
  .model('user', { id: '', name: '', email: '' })
  .model('posts', { items: [], loading: false })
  .events({
    userLogin: { payload: { email: string; password: string } },
    postCreated: { payload: { title: string; content: string } }
  })
  .plugin(uiStatePlugin)
  .build()

// 2. Using presets
const TodoSchema = presets.todo()

// 3. Advanced model schema
const UserSchema = createModelSchema({ id: '', name: '', email: '', age: 0 })
  .validate(combineValidators(
    validators.required('name'),
    validators.required('email'),
    validators.email('email'),
    validators.range('age', 0, 120)
  ))
  .computed({
    displayName: (state) => `${state.name} <${state.email}>`,
    isAdult: (state) => state.age >= 18
  })
  .effects({
    logChanges: (current, previous, ctx) => {
      console.log('User changed', { previous, current })
    }
  })
  .build()

// 4. Custom plugin
const myPlugin: SchemaPlugin = {
  name: 'customFeature',
  apply: (schema) => ({
    ...schema,
    models: {
      ...schema.models,
      myFeature: { initialState: { enabled: true } }
    }
  })
}

// 5. Schema extension
const ExtendedSchema = createSchema()
  .extend(TodoSchema)
  .plugin(authPlugin)
  .model('analytics', { events: [], sessionId: '' })
  .build()

// 6. Development utilities
const validation = validateSchema(MyAppSchema)
if (!validation.valid) {
  console.error('Schema errors:', validation.errors)
}

const analysis = introspectSchema(MyAppSchema)
console.log('Schema analysis:', analysis)
*/