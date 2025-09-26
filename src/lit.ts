/**
 * GPUI-TS Lit-HTML Integration Module
 * ==================================
 * 
 * Seamless integration between GPUI-TS reactive models and lit-html templating.
 * Provides declarative rendering, automatic re-rendering on state changes,
 * type-safe event handlers, and advanced view composition patterns.
 * 
 * Features:
 * - Reactive view binding to models
 * - Type-safe template functions
 * - Automatic cleanup and lifecycle management  
 * - Component-like view composition
 * - Directive system for advanced DOM manipulation
 * - Performance optimized rendering
 * - Development mode debugging
 */

import { html, render, svg, TemplateResult, SVGTemplateResult } from 'lit-html'
import { until } from 'lit-html/directives/until.js'
import { repeat } from 'lit-html/directives/repeat.js'
import { guard } from 'lit-html/directives/guard.js'
import { cache } from 'lit-html/directives/cache.js'
import { classMap } from 'lit-html/directives/class-map.js'
import { styleMap } from 'lit-html/directives/style-map.js'
import { ifDefined } from 'lit-html/directives/if-defined.js'
import { live } from 'lit-html/directives/live.js'

import type {
  ModelAPI,
  Subject,
  EventHandler,
  EventDefinition,
  Path,
  PathValue,
  ComputedProperty,
  DeepReadonly
} from './index'
import { lens, createEvent, getNestedProperty, setNestedProperty } from './index'

// =============================================================================
// CORE VIEW TYPES
// =============================================================================

/**
 * Template function that receives model state and returns lit-html template
 */
type TemplateFunction<TModel extends object> = (
  state: DeepReadonly<TModel>,
  context: ViewContext<TModel>
) => TemplateResult | SVGTemplateResult

/**
 * View context passed to template functions
 */
interface ViewContext<TModel extends object> {
  readonly model: ModelAPI<TModel>
  
  // Event helpers
  emit<TEvent>(event: TEvent): void
  on<TPayload>(event: EventDefinition<any, TPayload> | EventHandler<any, TPayload>): (payload: TPayload) => void
  
  // Update helpers
  update(updater: (state: TModel) => void): void
  updateAt<P extends Path<TModel>>(path: P, updater: (value: PathValue<TModel, P>) => PathValue<TModel, P>): void
  
  // Utilities
   bind<K extends keyof DeepReadonly<TModel>>(key: K): {
     value: DeepReadonly<TModel>[K]
     onChange: (e: Event) => void
   }
  
  // Nested views
  view<TOther extends object>(otherModel: ModelAPI<TOther>, template: TemplateFunction<TOther>): TemplateResult
  
  // Performance
  memo<T>(compute: () => T, deps?: any[]): T
  
  // Lifecycle
  onMount(callback: () => void | (() => void)): void
  onUnmount(callback: () => void): void
}

/**
 * View instance with lifecycle management
 */
interface View<TModel extends object> {
  readonly model: ModelAPI<TModel>
  readonly container: Element
  template: TemplateFunction<TModel>

  // Lifecycle
  onMount(callback: () => void | (() => void)): void
  onUnmount(callback: () => void): void
  render(): void
  destroy(): void
  onUnmount(callback: () => void): void

  // State
  readonly mounted: boolean

  // Update the template
  updateTemplate(newTemplate: TemplateFunction<TModel>): void
}

/**
 * Component-like view with props and state
 */
interface ViewComponent<TProps = {}, TState extends object = {}> {
  (props: TProps): {
    state: Subject<TState>
    template: TemplateFunction<TState>
    effects?: Array<(state: TState) => void | (() => void)>
    onMount?: () => void | (() => void)
    onUnmount?: () => void
  }
}

// =============================================================================
// REACTIVE VIEW BINDING
// =============================================================================

/**
 * Create a reactive view that automatically re-renders when model changes
 */
function createView<TModel extends object>(
  model: ModelAPI<TModel>,
  container: Element,
  template: TemplateFunction<TModel>
): View<TModel> {
  let isMounted = false
  let isDestroyed = false
  const cleanupCallbacks = new Set<() => void>()
  const mountCallbacks = new Set<() => void | (() => void)>()
  const memoCache = new Map<string, { value: any; deps: any[] }>()
  
  // Create view context
  const createContext = (): ViewContext<TModel> => ({
    model,
    
    emit: <TEvent>(event: TEvent) => {
      model.emit(event)
    },
    
    on: <TPayload>(event: EventDefinition<any, TPayload> | EventHandler<any, TPayload>) => {
      return (payload: TPayload) => {
        if ('emit' in event) {
          event.emit(payload)
        } else {
          event.subscribe(() => {}) // This is a simplification
        }
      }
    },
    
    update: (updater: (state: TModel) => void) => {
      model.update((state, ctx) => {
        updater(state)
        ctx.notify()
      })
    },
    
    updateAt: <P extends Path<TModel>>(
      path: P, 
      updater: (value: PathValue<TModel, P>) => PathValue<TModel, P>
    ) => {
      model.updateAt(path, updater)
    },
    
    bind: <K extends keyof DeepReadonly<TModel>>(key: K) => {
      const currentState = model.read()
      return {
        value: currentState[key],
        onChange: (e: Event) => {
          const target = e.target as HTMLInputElement
          const value = target.type === 'checkbox' ? target.checked : target.value
          model.updateAt(key as any as Path<TModel>, () => value as any)
        }
      }
    },
    
    view: <TOther extends object>(otherModel: ModelAPI<TOther>, otherTemplate: TemplateFunction<TOther>) => {
      // Create nested view that shares lifecycle
      const nestedContext = createNestedContext(otherModel)
      return otherTemplate(otherModel.read(), nestedContext)
    },
    
    memo: <T>(compute: () => T, deps: any[] = []) => {
      const key = compute.toString()
      const cached = memoCache.get(key)
      
      if (cached && depsEqual(cached.deps, deps)) {
        return cached.value
      }
      
      const value = compute()
      memoCache.set(key, { value, deps })
      return value
    },
    
    onMount: (callback: () => void | (() => void)) => {
      mountCallbacks.add(callback)
    },
    
    onUnmount: (callback: () => void) => {
      cleanupCallbacks.add(callback)
    }
  })
  
  // Create nested context for child views
  const createNestedContext = <TOther extends object>(otherModel: ModelAPI<TOther>): ViewContext<TOther> => ({
    model: otherModel,
    emit: (event) => otherModel.emit(event),
    on: createContext().on,
    update: (updater) => otherModel.update((state, ctx) => { updater(state); ctx.notify() }),
    updateAt: (path, updater) => otherModel.updateAt(path, updater),
      bind: <K extends keyof DeepReadonly<TOther>>(key: K) => {
        const currentState = otherModel.read()
        return {
          value: currentState[key],
          onChange: (e: Event) => {
            const target = e.target as HTMLInputElement
            const value = target.type === 'checkbox' ? target.checked : target.value
            otherModel.updateAt(key as any as Path<TOther>, () => value as any)
          }
        }
      },
    view: createContext().view,
    memo: createContext().memo,
    onMount: createContext().onMount,
    onUnmount: createContext().onUnmount
  })
  
  // Render function
  const renderView = () => {
    if (isDestroyed) return

    try {
      const state = model.read()
      const context = createContext()
      const result = view.template(state, context)
      render(result, container as HTMLElement)
      
      // Run mount effects if first render
      if (!isMounted) {
        isMounted = true
        mountCallbacks.forEach(callback => {
          const cleanup = callback()
          if (cleanup) cleanupCallbacks.add(cleanup)
        })
      }
    } catch (error) {
      console.error('Error rendering view:', error)
      render(html`<div style="color: red;">Render Error: ${error}</div>`, container as HTMLElement)
    }
  }
  
  // Subscribe to model changes
  const unsubscribe = model.onChange(() => {
    if (!isDestroyed) {
      renderView()
    }
  })
  
  cleanupCallbacks.add(unsubscribe)
  
  // View API
  const view: View<TModel> = {
    model,
    container,
    template,
    
    get mounted() {
      return isMounted
    },
    
    render: renderView,

    onMount: (callback: () => void | (() => void)) => {
      mountCallbacks.add(callback)
    },

    onUnmount: (callback: () => void) => {
      cleanupCallbacks.add(callback)
    },

    destroy: () => {
      if (isDestroyed) return

      isDestroyed = true
      isMounted = false

      // Run cleanup callbacks
      cleanupCallbacks.forEach(cleanup => cleanup())
      cleanupCallbacks.clear()
      mountCallbacks.clear()
      memoCache.clear()

      // Clear container
      render(html``, container as HTMLElement)
    },

    updateTemplate: (newTemplate: TemplateFunction<TModel>) => {
      if (isDestroyed) return
      view.template = newTemplate
      renderView()
    }
  }
  
  // Initial render
  renderView()
  
  return view
}

/**
 * Shorthand for creating and immediately rendering a view
 */
function renderView<TModel extends object>(
  model: ModelAPI<TModel>,
  container: Element,
  template: TemplateFunction<TModel>
): View<TModel> {
  return createView(model, container, template)
}

// =============================================================================
// VIEW COMPOSITION AND COMPONENTS
// =============================================================================

/**
 * Create a reusable view component
 */
function createComponent<TProps = {}, TState extends object = {}>(
  component: ViewComponent<TProps, TState>
): (props: TProps, container: Element) => View<TState> {
  return (props: TProps, container: Element) => {
    const { state, template, effects, onMount, onUnmount } = component(props)
    
    // Create a temporary model API for the component state
    const componentModel = createComponentModel(state)
    
    const view = createView(componentModel, container, template)
    
    // Run effects
    if (effects) {
      effects.forEach(effect => {
        const cleanup = effect(state())
        if (cleanup) {
          view.onUnmount(cleanup)
        }
      })
    }
    
    // Run lifecycle hooks
    if (onMount) {
      view.onMount(onMount)
    }
    
    if (onUnmount) {
      view.onUnmount(onUnmount)
    }
    
    return view
  }
}

/**
 * Create a minimal model API for component state
 */
function createComponentModel<T extends object>(subject: Subject<T>): ModelAPI<T> {
  const api: ModelAPI<T> = {} as any
  Object.assign(api, {
    id: 'component' as any,
    name: 'component' as any,
    schema: { initialState: subject() },
    __state: undefined as any,
    
    read: () => subject(),
    readAt: (path: any) => getPathValue(subject(), path),
    
      update: function(updater: any) {
        const currentState = subject()
        const mockCtx = { notify: () => {} } as any
        updater(currentState, mockCtx)
        subject.set(currentState)
        return this
      },
    
    updateAt: function(path: any, updater: any) {
      const currentState = subject()
      const currentValue = getPathValue(currentState, path as string)
      const newValue = updater(currentValue)
      setPathValue(currentState, path as string, newValue)
      subject.set(currentState)
      return this
    },
    
    updateWith: (updater: any) => {
      return updater(subject() as DeepReadonly<T>, {} as any)
    },
    
    updateIf: function(guard: any, updater: any) {
      const currentState = subject()
      if (guard(currentState)) {
        updater(currentState, {} as any)
        subject.set(currentState)
      }
      return this
    },
    
    updateWhen: function(condition: any, updater: any) {
      const currentState = subject()
      if (condition(currentState)) {
        updater(currentState, {} as any)
        subject.set(currentState)
      }
      return this
    },
    
      onChange: (listener: any) => {
        let previous = subject()
        return subject.subscribe(() => {
          const current = subject()
          listener(current, previous)
          previous = structuredClone(current)
        })
      },
    
    lens: <TFocus>(getter: (state: T) => TFocus) => lens<T, TFocus>(getter, (_root, _value) => {
      const current = subject()
      const newState = structuredClone(current)
      // This is a simplified merge - assumes getter returns a direct property
      return newState
    }),

    lensAt: <P extends Path<T>>(path: P) => lens<T, any>(
      (root) => getNestedProperty(root, path as string) as PathValue<T, P>,
      (root, value) => {
        const newRoot = structuredClone(root)
        setNestedProperty(newRoot, path as string, value)
        return newRoot
      }
    ),

    focus: <TFocus>(targetLens: any) => {
      // Simplified focus implementation
      return {
        read: () => targetLens.get(subject()),
        update: (updater: (focus: TFocus) => TFocus | void) => {
          const current = subject()
          const currentFocus = targetLens.get(current)
          const updatedFocus = updater(currentFocus)
          const newFocus = updatedFocus !== undefined ? updatedFocus : currentFocus
          const newRoot = targetLens.set(current, newFocus)
          subject.set(newRoot)
        },
        onChange: (listener: (current: TFocus, previous: TFocus) => void) => {
          let previous = targetLens.get(subject())
          return subject.subscribe(() => {
            const current = targetLens.get(subject())
            if (current !== previous) {
              listener(current, previous)
              previous = current
            }
          })
        },
        focus: (nextLens: any) => api.focus(targetLens.compose(nextLens)),
        root: () => api
      } as any
    },

    onChangeAt: <P extends Path<T>>(path: P, listener: (current: PathValue<T, P>, previous: PathValue<T, P>) => void) => {
      let previous = getNestedProperty(subject(), path as string)
      return subject.subscribe(() => {
        const current = getNestedProperty(subject(), path as string)
        if (current !== previous) {
          listener(current, previous)
          previous = current
        }
      })
    },

    createEvent: <TEventName extends string, TPayload>(eventName: TEventName, defaultPayload: TPayload) => {
      const event = createEvent<TPayload>()
      return {
        eventId: Symbol(`event:${eventName}`) as any,
        name: eventName,
        defaultPayload,
        subscribe: event[1],
        emit: event[1],
        filter: (predicate: any) => event[0].filter(predicate),
        map: (transform: any) => event[0].map(transform),
        debounce: (ms: any) => event[0].debounce(ms),
        throttle: (ms: any) => event[0].throttle(ms)
      } as any
    },

    emit: function<TEvent>(event: TEvent) {
      // Simplified - just log
      console.log('Component event emitted:', event)
      return this as any
    },

    onEvent: <TEvent>(handler: (event: TEvent) => void) => {
      // Simplified - no implementation
      console.log('onEvent handler:', handler)
      return () => {}
    },

    subscribeTo: () => ({
      id: 'component-sub',
      unsubscribe: () => {},
      pause: () => {},
      resume: () => {},
      transform: () => api,
      when: () => api,
      throttle: () => api,
      debounce: () => api
    } as any),

    compute: <TResult>(name: string, computation: (state: T) => TResult) => {
      const prop = (() => computation(subject())) as ComputedProperty<TResult>
      Object.assign(prop, {
        isComputed: true as const,
        invalidate: () => {},
        dependencies: [name]
      })
      return prop
    },

    validate: () => ({ valid: true, errors: [] }),

    transaction: <TResult>(work: (ctx: any) => TResult) => {
      const mockCtx = {
        read: () => subject(),
        notify: () => {},
        emit: () => {},
        updateWith: (updater: any) => updater(subject(), mockCtx)
      }
      return work(mockCtx)
    },

    snapshot: () => ({
      timestamp: new Date(),
      state: structuredClone(subject()),
      metadata: { version: 1, checksum: 'component' }
    }),

    restore: function(snapshot: any) {
      subject.set(snapshot.state)
      return this
    },

    debug: () => ({
      state: subject(),
      computedValues: {},
      subscriptions: [],
      performance: { updateCount: 0, lastUpdateDuration: 0, averageUpdateDuration: 0 }
    })
  })
  return api
}

// =============================================================================
// CUSTOM DIRECTIVES
// =============================================================================

/**
 * Directive for binding form inputs to model properties
 */
function bind<TModel extends object, K extends keyof TModel>(
  model: ModelAPI<TModel>,
  key: K
) {
  return (element: Element) => {
    const input = element as HTMLInputElement
    const currentState = model.read()
    
    // Set initial value
    if (input.type === 'checkbox') {
      input.checked = Boolean((currentState as any)[key])
    } else {
      input.value = String((currentState as any)[key] || '')
    }
    
    // Listen for changes
    const handleChange = () => {
      const value = input.type === 'checkbox' ? input.checked : input.value
      model.updateAt(key as Path<TModel>, () => value as any)
    }
    
    input.addEventListener('input', handleChange)
    input.addEventListener('change', handleChange)
    
    // Cleanup
    return () => {
      input.removeEventListener('input', handleChange)
      input.removeEventListener('change', handleChange)
    }
  }
}

/**
 * Directive for conditional rendering based on model state
 */
function when<TModel extends object>(
  model: ModelAPI<TModel>,
  condition: (state: DeepReadonly<TModel>) => boolean,
  template: TemplateResult
) {
  const state = model.read()
  return condition(state) ? template : html``
}

/**
 * Directive for rendering lists with automatic key management
 */
function forEach<TItem, TModel extends object>(
  model: ModelAPI<TModel>,
  getItems: (state: DeepReadonly<TModel>) => TItem[],
  keyFn: (item: TItem, index: number) => string | number,
  template: (item: TItem, index: number) => TemplateResult
) {
  const state = model.read()
  const items = getItems(state)
  
  return repeat(items, keyFn, template)
}

// =============================================================================
// ASYNC RENDERING UTILITIES
// =============================================================================

/**
 * Render async operations with loading states
 */
function asyncTemplate<T>(
  promise: Promise<T>,
  templates: {
    pending?: TemplateResult
    fulfilled: (value: T) => TemplateResult
    rejected?: (error: any) => TemplateResult
  }
) {
  const { pending = html`<div>Loading...</div>`, fulfilled, rejected } = templates
  
  const asyncResult = promise
    .then(fulfilled)
    .catch(error => rejected ? rejected(error) : html`<div>Error: ${error.message}</div>`)
  
  return until(asyncResult, pending)
}

/**
 * Create suspense-like boundary for async operations
 */
function suspense<T>(
  resource: { loading: boolean; data: T | null; error: any },
  templates: {
    loading: TemplateResult
    error: (error: any) => TemplateResult
    success: (data: T) => TemplateResult
  }
) {
  if (resource.loading) {
    return templates.loading
  }
  
  if (resource.error) {
    return templates.error(resource.error)
  }
  
  if (resource.data !== null) {
    return templates.success(resource.data)
  }
  
  return html`<div>No data</div>`
}

// =============================================================================
// DEVELOPMENT AND DEBUGGING
// =============================================================================

/**
 * Development mode view wrapper with debugging
 */
function devView<TModel extends object>(
  _model: ModelAPI<TModel>,
  template: TemplateFunction<TModel>,
  options: {
    name?: string
    logRenders?: boolean
    highlightUpdates?: boolean
  } = {}
): TemplateFunction<TModel> {
  const { name = 'unnamed', logRenders = false, highlightUpdates = false } = options
  
  if (process.env.NODE_ENV !== 'development') {
    return template
  }
  
   let renderCount = 0

   return (state: DeepReadonly<TModel>, context: ViewContext<TModel>) => {
    renderCount++
    
    if (logRenders) {
      console.log(`[${name}] Render #${renderCount}`, state)
    }
    
    const result = template(state, context)
    
    if (highlightUpdates) {
      return html`
        <div style="outline: 2px solid orange; outline-offset: 2px; animation: fade-out 1s;">
          ${result}
        </div>
      `
    }
    
    return result
  }
}

/**
 * Performance monitoring for views
 */
function performanceView<TModel extends object>(
  model: ModelAPI<TModel>,
  template: TemplateFunction<TModel>
): TemplateFunction<TModel> {
  const renderTimes: number[] = []
  
   return (state: DeepReadonly<TModel>, context: ViewContext<TModel>) => {
    const startTime = performance.now()
    
    const result = template(state, context)
    
    const endTime = performance.now()
    const renderTime = endTime - startTime
    
    renderTimes.push(renderTime)
    
    // Keep only last 100 measurements
    if (renderTimes.length > 100) {
      renderTimes.shift()
    }
    
    // Log slow renders
    if (renderTime > 16) { // Slower than 60fps
      console.warn(`Slow render detected: ${renderTime.toFixed(2)}ms`)
    }
    
    // Add performance info to global debug object
    if (typeof window !== 'undefined') {
      (window as any).__GPUI_PERF__ = {
        ...(window as any).__GPUI_PERF__,
        [model.name]: {
          averageRenderTime: renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length,
          lastRenderTime: renderTime,
          renderCount: renderTimes.length
        }
      }
    }
    
    return result
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if two dependency arrays are equal
 */
function depsEqual(deps1: any[], deps2: any[]): boolean {
  if (deps1.length !== deps2.length) return false
  return deps1.every((dep, i) => dep === deps2[i])
}

/**
 * Get nested property value
 */
function getPathValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

/**
 * Set nested property value
 */
function setPathValue(obj: any, path: string, value: any): void {
  const keys = path.split('.')
  const lastKey = keys.pop()!
  const target = keys.reduce((current, key) => {
    if (!(key in current)) current[key] = {}
    return current[key]
  }, obj)
  target[lastKey] = value
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Core functions
  createView,
  renderView,
  createComponent,
  
  // Directives
  bind,
  when,
  forEach,
  
  // Async utilities
  asyncTemplate,
  suspense,
  
  // Development utilities
  devView,
  performanceView,
  
  // Re-export lit-html essentials
  html,
  svg,
  render,
  until,
  repeat,
  guard,
  cache,
  classMap,
  styleMap,
  ifDefined,
  live,
  
  // Types
  type TemplateFunction,
  type ViewContext,
  type View,
  type ViewComponent
}

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/*
// 1. Basic reactive view
const todoView = createView(todoModel, container, (state, ctx) => html`
  <div>
    <h1>Todos (${state.items.length})</h1>
    
    <input
      .value=${ctx.bind('newTodoText').value}
      @input=${ctx.bind('newTodoText').onChange}
      @keydown=${(e) => {
        if (e.key === 'Enter') {
          ctx.emit(todoAdded({ text: state.newTodoText }))
        }
      }}
    />
    
    <ul>
      ${repeat(
        state.items,
        (item) => item.id,
        (item) => html`
          <li>
            <input
              type="checkbox"
              .checked=${item.completed}
              @change=${() => ctx.emit(todoToggled({ id: item.id }))}
            />
            ${item.text}
            <button @click=${() => ctx.emit(todoDeleted({ id: item.id }))}>
              Delete
            </button>
          </li>
        `
      )}
    </ul>
  </div>
`)

// 2. Component-style view
const TodoItem = createComponent<
  { todo: Todo; onToggle: (id: number) => void; onDelete: (id: number) => void },
  { editing: boolean }
>((props) => ({
  state: createSubject({ editing: false }),
  
  template: (state, ctx) => html`
    <li class=${classMap({ completed: props.todo.completed, editing: state.editing })}>
      ${state.editing ? html`
        <input
          .value=${props.todo.text}
          @blur=${() => ctx.update(s => s.editing = false)}
          @keydown=${(e) => e.key === 'Enter' && ctx.update(s => s.editing = false)}
        />
      ` : html`
        <span @dblclick=${() => ctx.update(s => s.editing = true)}>
          ${props.todo.text}
        </span>
      `}
      
      <input
        type="checkbox"
        .checked=${props.todo.completed}
        @change=${() => props.onToggle(props.todo.id)}
      />
      
      <button @click=${() => props.onDelete(props.todo.id)}>×</button>
    </li>
  `,
  
  effects: [
    (state) => {
      console.log('TodoItem state changed:', state)
    }
  ]
}))

// 3. Async data with suspense
const UserProfile = createView(userModel, container, (state, ctx) => html`
  <div>
    ${suspense(state.profileData, {
      loading: html`<div class="spinner">Loading profile...</div>`,
      error: (error) => html`<div class="error">Failed to load: ${error.message}</div>`,
      success: (profile) => html`
        <div class="profile">
          <img src=${profile.avatar} alt=${profile.name} />
          <h2>${profile.name}</h2>
          <p>${profile.bio}</p>
        </div>
      `
    })}
  </div>
`)

// 4. Development mode with debugging
const DebugTodoView = devView(
  todoModel,
  (state, ctx) => html`
    <div>
      <h1>Todos (${state.items.length})</h1>
      <!-- template content -->
    </div>
  `,
  {
    name: 'TodoView',
    logRenders: true,
    highlightUpdates: true
  }
)

// 5. Performance monitoring
const MonitoredView = performanceView(todoModel, (state, ctx) => {
  // Expensive template rendering
  return html`<div><!-- complex template --></div>`
})
*/