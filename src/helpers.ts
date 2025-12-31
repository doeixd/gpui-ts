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

import type {
  AppSchema,
  ModelSchema,
  ValidationResult,
  Path,
  ModelAPI,
  FocusedModel,
  ModelContext,
  EventHandler,
  Subject
} from './index'
import { createEvent, createSubject } from './index'

// =============================================================================
// SCHEMA BUILDER TYPES
// =============================================================================

/**
 * Intermediate builder for models that allows defining events
 */
interface ModelBuilder<TSchema extends Partial<AppSchema>, TModelName extends string> {
  /**
   * Defines events that are scoped to the current model.
   * @param events An object where keys are event names and values are functions
   *               that define the payload shape. e.g., `{ myEvent: (id: string) => ({ id }) }`
   */
  events(
    events: Record<string, (...args: any[]) => any>
  ): SchemaBuilder<TSchema & {
    models: TSchema['models'] extends Record<string, any>
      ? TSchema['models'] & { [K in TModelName]: { initialState: any; events: any } }
      : { [K in TModelName]: { initialState: any; events: any } }
  }>

  /**
   * Defines global events for the application.
   * @param events An object where keys are event names and values are payload definitions.
   *               e.g., `{ myEvent: { payload: { id: string } } }`
   */
  events<TEvents extends Record<string, { payload: any; for?: string }>>(
    events: TEvents
  ): SchemaBuilder<TSchema & { events: TEvents }>

  // Also expose the regular SchemaBuilder methods to allow continuing the chain
  // without defining events.
  model<TNextName extends string, TNextState extends object>(
    name: TNextName,
    initialState: TNextState
  ): ModelBuilder<TSchema & { models: { [K in TNextName]: { initialState: TNextState } } }, TNextName>

  modelWithSchema<TNextName extends string, TNextState extends object>(
    name: TNextName,
    schema: ModelSchema<TNextState>
  ): SchemaBuilder<TSchema & {
    models: TSchema['models'] extends Record<string, any>
      ? TSchema['models'] & { [K in TNextName]: { initialState: TNextState; schema: ModelSchema<TNextState> } }
      : { [K in TNextName]: { initialState: TNextState; schema: ModelSchema<TNextState> } }
  }>

  removeModel<TName extends keyof TSchema['models'] & string>(
    name: TName
  ): SchemaBuilder<Partial<AppSchema>>

  extend<TExtension extends Partial<AppSchema>>(
    extension: TExtension
  ): SchemaBuilder<MergeSchemas<TSchema, TExtension>>

  plugin<TPlugin extends SchemaPlugin>(
    plugin: TPlugin
  ): SchemaBuilder<ApplyPlugin<TSchema, TPlugin>>

  build(): TSchema extends AppSchema ? TSchema : never
}

/**
 * Fluent schema builder interface
 */
interface SchemaBuilder<TSchema extends Partial<AppSchema> = {}> {
  // Add models
  model<TName extends string, TState extends object>(
    name: TName,
    initialState: TState
  ): ModelBuilder<TSchema & {
    models: TSchema['models'] extends Record<string, any>
      ? TSchema['models'] & { [K in TName]: { initialState: TState } }
      : { [K in TName]: { initialState: TState } }
  }, TName>

  // Add model with full schema
  modelWithSchema<TName extends string, TState extends object>(
    name: TName,
    schema: ModelSchema<TState>
  ): SchemaBuilder<TSchema & {
    models: TSchema['models'] extends Record<string, any>
      ? TSchema['models'] & { [K in TName]: { initialState: TState; schema: ModelSchema<TState> } }
      : { [K in TName]: { initialState: TState; schema: ModelSchema<TState> } }
  }>

  // Remove models
  removeModel<TName extends keyof TSchema['models'] & string>(
    name: TName
   ): SchemaBuilder<Partial<AppSchema>>

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
 * Creates a new fluent schema builder for constructing GPUI-TS applications.
 *
 * This is the primary entry point for defining application schemas with full
 * type safety and developer experience. The builder provides a chainable API
 * for adding models, events, plugins, and extensions.
 *
 * @returns A new schema builder instance ready to configure models and events
 *
 * @example
 * ```ts
 * const schema = createSchema()
 *   .model('user', { name: '', email: '' })
 *   .model('todos', { items: [] })
 *   .events({ todoAdded: { payload: { text: string } } })
 *   .build()
 * ```
 */
function createSchema(): SchemaBuilder<{}> {
  const currentSchema: Partial<AppSchema> = {
    models: {},
    events: {}
  }
  
  const builder: SchemaBuilder<any> = {
    model: <TName extends string, TState extends object>(name: TName, initialState: TState) => {
       const newSchema = {
         ...currentSchema,
         models: {
           ...currentSchema.models,
           [name]: { initialState }
         },
         events: currentSchema.events || {}
       }

       // Return the intermediate ModelBuilder
       const modelBuilder: ModelBuilder<any, any> = {
         events: (events: Record<string, any>) => {
           // Check if it's functions (model events) or payload objects (global events)
           const firstValue = Object.values(events)[0]
           if (typeof firstValue === 'function') {
             // Model events
             const schemaWithEvents = {
               ...newSchema,
               models: {
                 ...newSchema.models,
                 [name]: {
                   ...newSchema.models[name],
                   events
                 }
               }
             }
             return createBuilderWithSchema(schemaWithEvents)
           } else if (firstValue && typeof firstValue === 'object' && 'payload' in firstValue) {
             // Global events
             const schemaWithEvents = {
               ...newSchema,
               events: { ...(newSchema.events || {}), ...events }
             }
             return createBuilderWithSchema(schemaWithEvents)
           } else {
             throw new Error('Invalid events format')
           }
         },
         // Re-implement other builder methods to pass through
         model: (nextName, nextState) => createBuilderWithSchema(newSchema).model(nextName, nextState),
        modelWithSchema: (nextName, nextSchema) => createBuilderWithSchema(newSchema).modelWithSchema(nextName, nextSchema),
        removeModel: (nextName) => createBuilderWithSchema(newSchema).removeModel(nextName),
        extend: (extension) => createBuilderWithSchema(newSchema).extend(extension),
        plugin: (plugin) => createBuilderWithSchema(newSchema).plugin(plugin),
        build: () => createBuilderWithSchema(newSchema).build()
      }

      return modelBuilder as any
    },

    modelWithSchema: <TName extends string, TState extends object>(
      name: TName,
      schema: ModelSchema<TState>
    ) => {
      const newSchema = {
        ...currentSchema,
        models: {
          ...currentSchema.models,
          [name]: schema
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
    
    removeModel: <TName extends string>(name: TName) => {
      const { [name]: _, ...newModels } = currentSchema.models || {}
      const newSchema = { ...currentSchema, models: newModels }
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
    model: <TName extends string, TState extends object>(name: TName, initialState: TState) => {
      const newSchema = {
        ...schema,
        models: {
          ...schema.models,
          [name]: { initialState }
        },
        events: schema.events || {}
      }

      // Return the intermediate ModelBuilder
      const modelBuilder: ModelBuilder<any, any> = {
        events: (events: Record<string, any>) => {
          // Check if it's functions (model events) or payload objects (global events)
          const firstValue = Object.values(events)[0]
          if (typeof firstValue === 'function') {
            // Model events
            const schemaWithEvents = {
              ...newSchema,
              models: {
                ...newSchema.models,
                [name]: {
                  ...newSchema.models[name],
                  events
                }
              }
            }
            return createBuilderWithSchema(schemaWithEvents)
          } else if (firstValue && typeof firstValue === 'object' && 'payload' in firstValue) {
            // Global events
            const schemaWithEvents = {
              ...newSchema,
              events: { ...(newSchema.events || {}), ...events }
            }
            return createBuilderWithSchema(schemaWithEvents)
          } else {
            throw new Error('Invalid events format')
          }
        },
        // Re-implement other builder methods to pass through
        model: (nextName, nextState) => createBuilderWithSchema(newSchema).model(nextName, nextState),
        modelWithSchema: (nextName, nextSchema) => createBuilderWithSchema(newSchema).modelWithSchema(nextName, nextSchema),
        removeModel: (nextName) => createBuilderWithSchema(newSchema).removeModel(nextName),
        extend: (extension) => createBuilderWithSchema(newSchema).extend(extension),
        plugin: (plugin) => createBuilderWithSchema(newSchema).plugin(plugin),
        build: () => createBuilderWithSchema(newSchema).build()
      }

      return modelBuilder as any
    },

    modelWithSchema: <TName extends string, TState extends object>(
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
    
    removeModel: <TName extends string>(name: TName) => {
      const { [name]: _, ...newModels } = schema.models || {}
      const newSchema = { ...schema, models: newModels }
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
 * Merges two partial application schemas into a single schema.
 *
 * This utility combines models and events from two schemas, with the second
 * schema taking precedence for conflicting keys. Useful for schema composition
 * and extension patterns.
 *
 * @param schema1 The first schema to merge
 * @param schema2 The second schema to merge (takes precedence)
 * @returns A new merged schema
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
 * Creates a model schema with a fluent API for advanced configuration.
 *
 * This function provides a builder pattern for defining model schemas with
 * validation, computed properties, effects, and middleware. It's useful for
 * complex models that need more than just initial state.
 *
 * @template T The model state type
 * @param initialState The initial state object for the model
 * @returns A fluent builder for configuring the model schema
 *
 * @example
 * ```ts
 * const userSchema = createModelSchema({ name: '', age: 0 })
 *   .validate(state => state.age >= 0 ? null : ['Age must be positive'])
 *   .computed({
 *     isAdult: state => state.age >= 18,
 *     displayName: state => state.name || 'Anonymous'
 *   })
 *   .build()
 * ```
 */
function createModelSchema<T extends object>(initialState: T) {
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
 * Built-in validation rules for common data validation patterns.
 *
 * A collection of reusable validator functions that can be used with model
 * schemas to enforce data integrity. Each validator returns null for valid
 * data or an array of error messages for invalid data.
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
 * Combines multiple validators into a single validation function.
 *
 * Takes multiple validator functions and returns a new validator that runs
 * all of them and aggregates their error messages. Useful for applying
 * multiple validation rules to a single field or model.
 *
 * @template T The state type being validated
 * @param validators The validator functions to combine
 * @returns A combined validator function
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
 * Built-in schema plugin that adds common UI state patterns.
 *
 * Adds a 'ui' model with standard UI state properties like loading states,
 * error handling, selection, search, and sorting. Useful for applications
 * that need consistent UI state management.
 */
// const uiStatePlugin: SchemaPlugin = {
//   name: 'uiState',
//   apply: (schema) => ({
//     ...schema,
//     models: {
//       ...schema.models,
//       ui: {
//         initialState: {
//           loading: false,
//           error: null as string | null,
//           selectedId: null as string | number | null,
//           searchText: '',
//           sortBy: 'name' as string,
//           sortDirection: 'asc' as 'asc' | 'desc'
//         }
//       }
//     }
//   })
// }

/**
 * Built-in schema plugin that adds authentication state patterns.
 *
 * Adds an 'auth' model with user authentication state, including user data,
 * authentication status, tokens, and permissions. Also adds common auth events
 * like login and logout.
 */
// const authPlugin: SchemaPlugin = {
//   name: 'auth',
//   apply: (schema) => ({
//     ...schema,
//     models: {
//       ...schema.models,
//       auth: {
//         initialState: {
//           user: null as { id: string; name: string; email: string } | null,
//           isAuthenticated: false,
//           token: null as string | null,
//           permissions: [] as string[]
//         }
//       }
//     },
//     events: {
//       ...schema.events,
//       login: { payload: { email: string; password: string } },
//       logout: { payload: {} },
//       tokenRefresh: { payload: { token: string } }
//     }
//   })
// }

/**
 * Built-in schema plugin that adds router state patterns.
 *
 * Adds a 'router' model for managing application navigation state, including
 * current route, URL parameters, query strings, and navigation history.
 * Also provides navigation events.
 */
// const routerPlugin: SchemaPlugin = {
//   name: 'router',
//   apply: (schema) => ({
//     ...schema,
//     models: {
//       ...schema.models,
//       router: {
//         initialState: {
//           currentRoute: '/' as string,
//           params: {} as Record<string, string>,
//           query: {} as Record<string, string>,
//           history: [] as string[]
//         }
//       }
//     },
//     events: {
//       ...schema.events,
//       navigate: { payload: { path: string; replace?: boolean } },
//       goBack: { payload: {} },
//       goForward: { payload: {} }
//     }
//   })
// }

/**
 * Built-in schema plugin that adds notification system patterns.
 *
 * Adds a 'notifications' model for managing application notifications with
 * support for different notification types (info, success, warning, error)
 * and lifecycle management.
 */
// const notificationPlugin: SchemaPlugin = {
//   name: 'notifications',
//   apply: (schema) => ({
//     ...schema,
//     models: {
//       ...schema.models,
//       notifications: {
//         initialState: {
//           items: [] as Array<{
//             id: string
//             type: 'info' | 'success' | 'warning' | 'error'
//             title: string
//             message: string
//             timestamp: Date
//             dismissed: boolean
//           }>
//         }
//       }
//     },
//     events: {
//       ...schema.events,
//       showNotification: { 
//         payload: { 
//           type: 'info' | 'success' | 'warning' | 'error'
//           title: string
//           message: string 
//         } 
//       },
//       dismissNotification: { payload: { id: string } },
//       clearAllNotifications: { payload: {} }
//     }
//   })
// }

// =============================================================================
// DEVELOPMENT UTILITIES
// =============================================================================

/**
 * Validates a complete application schema for correctness.
 *
 * Performs static analysis on the schema to ensure it meets GPUI-TS requirements,
 * including model name validation, structure checks, and consistency rules.
 *
 * @template TSchema The schema type being validated
 * @param schema The schema to validate
 * @returns Validation result with any errors found
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
 * Generates TypeScript type definitions from an application schema.
 *
 * Creates interface and type definitions that correspond to the models and
 * events in the schema. Useful for generating type definitions for external
 * consumption or documentation.
 *
 * @template TSchema The schema type to generate types for
 * @param schema The schema to generate types from
 * @returns TypeScript code as a string containing interfaces and types
 */
function generateTypes<TSchema extends AppSchema>(schema: TSchema): string {
  const modelTypes = Object.entries(schema.models).map(([name, model]) => {
    const stateName = `${capitalize(name)}State`
    // Generate a simple interface representation
    // Note: This is a simplified implementation for demonstration
    // A full implementation would need proper TypeScript AST generation
    return `interface ${stateName} {\n${Object.keys(model.initialState).map(key => `  ${key}: any`).join('\n')}\n}`
  }).join('\n\n')

  const eventTypes = schema.events ? Object.entries(schema.events).map(([name, event]) => {
    // Generate a simple type representation
    // Note: This is a simplified implementation
    return `type ${capitalize(name)}Event = {\n${Object.keys(event.payload).map(key => `  ${key}: any`).join('\n')}\n}`
  }).join('\n\n') : ''

  return `${modelTypes}\n\n${eventTypes}`
}

/**
 * Provides introspection capabilities for application schemas.
 *
 * Analyzes a schema to extract metadata about its structure, complexity,
 * and common patterns. Useful for development tools, documentation generation,
 * and schema analysis.
 *
 * @template TSchema The schema type to introspect
 * @param schema The schema to analyze
 * @returns Introspection results with model counts, complexity analysis, and pattern detection
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
 * Pre-configured schema presets for common application patterns.
 *
 * A collection of ready-to-use schemas for typical application structures
 * like CRUD applications, todo apps, authentication-enabled apps, and
 * full-featured SPAs. These can be used as starting points or extended
 * with additional models and features.
 */
// const presets = {
//   /**
//    * Basic CRUD application with UI state
//    */
//   crud: <TEntity extends object>(entityName: string) =>
//     createSchema()
//       .model(entityName, { items: [] as TEntity[], loading: false })
//       .plugin(uiStatePlugin)
//       .build(),
  
//   /**
//    * Todo application preset
//    */
//   todo: () =>
//     createSchema()
//       .model('todos', {
//         items: [] as Array<{ id: number; text: string; completed: boolean }>,
//         filter: 'all' as 'all' | 'active' | 'completed',
//         nextId: 1
//       })
//       .model('ui', {
//         newTodoText: '',
//         editingId: null as number | null,
//         editingText: ''
//       })
//       .events({
//         todoAdded: { payload: { text: string } },
//         todoToggled: { payload: { id: number } },
//         todoDeleted: { payload: { id: number } }
//       })
//       .build(),
  
//   /**
//    * Authentication-enabled application
//    */
//   authApp: () =>
//     createSchema()
//       .plugin(authPlugin)
//       .plugin(uiStatePlugin)
//       .plugin(notificationPlugin)
//       .build(),
  
//   /**
//    * Full-featured SPA
//    */
//   spa: () =>
//     createSchema()
//       .plugin(authPlugin)
//       .plugin(routerPlugin)
//       .plugin(uiStatePlugin)
//       .plugin(notificationPlugin)
//       .build()
// }

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
// STANDALONE SCHEMA COMPOSITION HELPERS
// =============================================================================

/**
 * Adds a model to a SchemaBuilder instance in a typesafe way.
 * This is a standalone equivalent of the builder's `.model()` method.
 *
 * @param builder The SchemaBuilder instance.
 * @param modelName The unique name for the new model.
 * @param initialState The initial state of the model.
 * @returns A new SchemaBuilder instance with the added model.
 */
export function addModelToSchema<
  TBuilder extends SchemaBuilder<any>,
  TModelName extends string,
  TState extends object
>(
  builder: TBuilder,
  modelName: TModelName,
  initialState: TState
): TBuilder extends SchemaBuilder<infer TSchema>
  ? SchemaBuilder<TSchema & { models: { [K in TModelName]: { initialState: TState } } }>
  : never {
  return builder.model(modelName, initialState) as any
}

/**
 * Removes a model from a SchemaBuilder instance in a typesafe way.
 * This is a standalone equivalent of the builder's `.removeModel()` method.
 *
 * @param builder The SchemaBuilder instance.
 * @param modelName The name of the model to remove.
 * @returns A new SchemaBuilder instance without the removed model.
 */
export function removeModelFromSchema<
  TBuilder extends SchemaBuilder<any>,
  TModelName extends TBuilder extends SchemaBuilder<infer S> ? keyof S['models'] & string : never
>(
  builder: TBuilder,
  modelName: TModelName
  ): TBuilder extends SchemaBuilder<infer TSchema>
    ? SchemaBuilder<Partial<TSchema>>
    : never {
   return builder.removeModel(modelName) as any
 }

/**
 * Adds an event definition to a SchemaBuilder instance in a typesafe way.
 * This is a standalone equivalent of the builder's `.events()` method for a single event.
 *
 * @param builder The SchemaBuilder instance.
 * @param eventName The unique name for the new event.
 * @param payloadDef The payload definition for the event.
 * @returns A new SchemaBuilder instance with the added event.
 */
export function addEventToSchema<
  TBuilder extends SchemaBuilder<any>,
  TEventName extends string,
  TPayload
>(
  builder: TBuilder,
  eventName: TEventName,
  payloadDef: { payload: TPayload }
): TBuilder extends SchemaBuilder<infer TSchema>
  ? SchemaBuilder<TSchema & { events: { [K in TEventName]: { payload: TPayload } } }>
  : never {
  return builder.events({ [eventName]: payloadDef } as any) as any
}

// =============================================================================
// FUNCTIONAL CONTROLLER UTILITIES
// =============================================================================

/**
 * Creates an event that automatically updates a model when emitted.
 *
 * This utility bridges the event system with model updates, creating a "Functional Controller"
 * pattern that decouples business logic (actions) from state definitions (schemas).
 * When the returned emit function is called, it automatically runs the handler against
 * the target model, ensuring reactive subscriptions are triggered.
 *
 * @template TState The model state type (inferred from target)
 * @template TPayload The event payload type (default: void)
 *
 * @param target The model or focused model to update when event is emitted
 * @param handler Function that receives payload, draft state, and optional context.
 *                For ModelAPI targets, full ModelContext is provided.
 *                For FocusedModel targets, context is undefined.
 *
 * @returns A tuple of [EventHandler, emit function] where:
 *          - EventHandler: Can be subscribed to, chained with .map()/.filter(), etc.
 *          - emit function: Triggers the handler with the given payload
 *
 * @example
 * ```ts
 * // Basic usage with ModelAPI
 * const userModel = app.models.user
 *
 * const [onLogin, emitLogin] = createModelEvent(
 *   userModel,
 *   (credentials, draft, ctx) => {
 *     draft.isAuthenticated = true
 *     draft.user = credentials.user
 *     ctx?.emit({ type: 'auth:success' })
 *   }
 * )
 *
 * // Emit the event to update the model
 * emitLogin({ user: { id: '123', name: 'Alice' } })
 *
 * // Subscribe to the event for side effects
 * onLogin.subscribe(credentials => {
 *   console.log('Login event fired:', credentials)
 * })
 * ```
 *
 * @example
 * ```ts
 * // Usage with FocusedModel (context will be undefined)
 * const profileLens = app.models.user.focus(state => state.profile)
 *
 * const [onUpdateBio, updateBio] = createModelEvent(
 *   profileLens,
 *   (bio: string, draft) => {
 *     draft.bio = bio
 *     draft.lastUpdated = Date.now()
 *   }
 * )
 *
 * updateBio('I love functional programming!')
 * ```
 *
 * @example
 * ```ts
 * // Event transformation chains
 * const [onTodoAdd, addTodo] = createModelEvent(
 *   app.models.todos,
 *   (text: string, draft) => {
 *     draft.items.push({ id: Date.now(), text, completed: false })
 *   }
 * )
 *
 * // Transform events before they reach subscribers
 * const longTodosOnly = onTodoAdd
 *   .filter(text => text.length > 10)
 *   .map(text => ({ text, priority: 'high' }))
 *
 * longTodosOnly.subscribe(data => {
 *   console.log('Long todo added:', data)
 * })
 * ```
 *
 * @remarks
 * - For ModelAPI targets, the handler receives full ModelContext with access to
 *   ctx.notify(), ctx.emit(), ctx.batch(), etc.
 * - For FocusedModel targets, context is undefined since FocusedModel.update()
 *   doesn't provide context to user updaters (notifications are handled automatically)
 * - Errors in the handler trigger automatic state rollback via the transactional
 *   update system
 * - The returned EventHandler supports all standard event transformations:
 *   .map(), .filter(), .debounce(), .throttle(), .toSubject()
 */
export function createModelEvent<TState extends object, TPayload = void>(
  target: ModelAPI<TState, any, any> | FocusedModel<TState, any>,
  handler: (payload: TPayload, draft: TState, ctx?: ModelContext<TState>) => void
): [EventHandler<TPayload, TPayload>, (payload: TPayload) => void] {
  // Create the base event handler and emit function
  const [eventHandler, emit] = createEvent<TPayload>()

  // Detect target type by checking for the 'root' method (FocusedModel-specific)
  const isFocusedModel = 'root' in target && typeof (target as any).root === 'function'

  // Subscribe to events and wire them to model updates
  eventHandler.subscribe((payload: TPayload) => {
    if (isFocusedModel) {
      // FocusedModel path: No context available to user
      // FocusedModel.update signature: (updater: (focus: TFocus | undefined) => TFocus | void) => void
      // Note: FocusedModel automatically calls ctx.notify() internally
      const focusedTarget = target as FocusedModel<TState, any>
      focusedTarget.update((draft) => {
        // Call handler with undefined context
        handler(payload, draft as TState, undefined)
        // Return the draft (optional - can also mutate and return void)
        return draft as TState
      })
    } else {
      // ModelAPI path: Full context available
      // ModelAPI.update signature: (updater: (state: T, ctx: ModelContext<T>) => void) => void
      const modelTarget = target as ModelAPI<TState, any, any>
      modelTarget.update((draft, ctx) => {
        // Call handler with full context
        handler(payload, draft, ctx)
        // Manually trigger notifications for reactive subscriptions
        ctx.notify()
      })
    }
  })

  // Return the event handler and emit function
  return [eventHandler, emit]
}

/**
 * Creates a reactive Subject that automatically syncs with model state changes.
 *
 * This utility creates a "live view" of model state via a selector function.
 * The subject subscribes to the model's onChange event and updates its value
 * whenever the selector result changes (using deep equality comparison).
 * This enables the "Functional Controller" pattern for reactive reads.
 *
 * @template TState The model state type (inferred from target)
 * @template TResult The selected value type (inferred from selector return type)
 *
 * @param target The model or focused model to observe
 * @param selector Function that extracts a value from the state
 *
 * @returns A Subject that tracks the selected value and updates automatically.
 *          The subject can be:
 *          - Called as a function to read current value: `subject()`
 *          - Subscribed to for change notifications: `subject.subscribe(callback)`
 *          - Derived from: `subject.derive(transform)`
 *
 * @example
 * ```ts
 * // Create a reactive count of active todos
 * const todoModel = app.models.todos
 *
 * const activeCount = createModelSubject(
 *   todoModel,
 *   (state) => state.items.filter(t => !t.completed).length
 * )
 *
 * // Read current value
 * console.log(activeCount()) // 5
 *
 * // Subscribe to changes
 * activeCount.subscribe(() => {
 *   console.log('Active count changed:', activeCount())
 * })
 *
 * // Update the model - subject updates automatically
 * todoModel.updateAndNotify(state => {
 *   state.items[0].completed = true
 * })
 * // Console: "Active count changed: 4"
 * ```
 *
 * @example
 * ```ts
 * // Derive new subjects from existing ones
 * const userModel = app.models.user
 *
 * const userName = createModelSubject(userModel, s => s.name)
 * const userGreeting = userName.derive(name => `Hello, ${name}!`)
 *
 * console.log(userGreeting()) // "Hello, Alice!"
 *
 * userModel.set('name', 'Bob')
 * console.log(userGreeting()) // "Hello, Bob!"
 * ```
 *
 * @example
 * ```ts
 * // Use with FocusedModel for scoped selections
 * const profileLens = app.models.user.focus(state => state.profile)
 *
 * const bio = createModelSubject(profileLens, profile => profile.bio)
 *
 * console.log(bio()) // "Software engineer"
 *
 * profileLens.update(p => { p.bio = "Full-stack developer" })
 * console.log(bio()) // "Full-stack developer"
 * ```
 *
 * @example
 * ```ts
 * // Complex selectors with transformations
 * const stats = createModelSubject(
 *   app.models.todos,
 *   state => ({
 *     total: state.items.length,
 *     completed: state.items.filter(t => t.completed).length,
 *     percentage: state.items.length > 0
 *       ? (state.items.filter(t => t.completed).length / state.items.length) * 100
 *       : 0
 *   })
 * )
 *
 * console.log(stats()) // { total: 10, completed: 7, percentage: 70 }
 * ```
 *
 * @remarks
 * - Uses JSON.stringify() for deep equality comparison to prevent unnecessary updates
 * - For large objects, prefer narrow selectors to optimize performance
 * - The subject only updates when the selector result changes (memoization)
 * - Works with both ModelAPI and FocusedModel targets
 * - Subscriptions live as long as the subject exists (no explicit cleanup needed
 *   unless you need to manually unsubscribe from individual listeners)
 * - Handles undefined focus gracefully for FocusedModel targets
 */
export function createModelSubject<TState extends object, TResult>(
  target: ModelAPI<TState, any, any> | FocusedModel<TState, any>,
  selector: (state: TState) => TResult
): Subject<TResult> {
  // Get initial value from current state
  const currentState = target.read() as TState
  const initialValue = selector(currentState)

  // Create the subject with initial value
  const subject = createSubject<TResult>(initialValue)

  // Track previous result for memoization
  let previousResult = initialValue

  // Subscribe to model changes and update subject when selector result changes
  target.onChange((current) => {
    try {
      // Run selector on new state
      const newResult = selector(current as TState)

      // Deep equality check using JSON.stringify
      // Only update if the selector result has changed
      const hasChanged = JSON.stringify(previousResult) !== JSON.stringify(newResult)

      if (hasChanged) {
        previousResult = newResult
        subject.set(newResult)
      }
    } catch (error) {
      // If selector throws, log error but keep previous value
      console.error('[createModelSubject] Selector error:', error)
      // Don't update subject - keep previous value
    }
  })

  // Return the subject
  return subject
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
  // uiStatePlugin,
  // authPlugin,
  // routerPlugin,
  // notificationPlugin,

  // // Presets
  // presets,

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