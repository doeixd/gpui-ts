// @ts-nocheck

function createAppContext() {
  const models = {};
  const subscriptions = {};
  const eventHandlers = {};
  const effectQueue = [];

  function newModel(name, initialState) {
    models[name] = { ...initialState };
    subscriptions[name] = [];
    eventHandlers[name] = [];
    return name;
  }

  function read(name) {
    return models[name];
  }

  function update(name, updater) {
    if (!models[name]) return;
    updater(models[name], createModelContext(name));
    flushEffects();
  }

  function notify(name) {
    effectQueue.push(() => {
      subscriptions[name]?.forEach(cb => cb(models[name]));
    });
  }

  function emit(name, event) {
    effectQueue.push(() => {
      eventHandlers[name]?.forEach(cb => cb(event));
    });
  }

  function flushEffects() {
    while (effectQueue.length > 0) {
      const effect = effectQueue.shift();
      effect();
    }
  }

  function subscribe(sourceName, targetName, reaction) {
    const callback = () => {
      const source = models[sourceName];
      const target = models[targetName];
      reaction(source, target, createModelContext(targetName));
    };
    subscriptions[sourceName].push(callback);
  }

  function onEvent(sourceName, handler) {
    eventHandlers[sourceName].push(handler);
  }

  function createModelContext(name) {
    return {
      notify: () => notify(name),
      emit: event => emit(name, event),
      read: () => read(name),
    };
  }

  return {
    newModel,
    update,
    read,
    subscribe,
    onEvent,
  };
}


/**
 * gpui-lit.ts
 *
 * A closure-based GPUI-inspired framework integrated with lit-html.
 * Centralized ownership, controlled updates, queued effects, and
 * declarative rendering—all in one production-ready TypeScript file.
 */

import { html, render, TemplateResult } from 'lit-html'

/**
 * ModelContext<T>
 * Provided to updater, observer, and emitter callbacks.
 */
interface ModelContext<T> {
  read(): T
  notify(): void
  emit(event: any): void
}

/**
 * AppContext
 * Manages models, subscriptions, events, and effect flushing.
 */
interface AppContext {
  newModel<T>(name: string, initialState: T): void
  read<T>(name: string): T
  update<T>(name: string, updater: (model: T, ctx: ModelContext<T>) => void): void
  subscribe<S, T>(
    sourceName: string,
    targetName: string,
    reaction: (source: S, target: T, ctx: ModelContext<T>) => void
  ): void
  onEvent(name: string, handler: (event: any) => void): void
}

/**
 * createAppContext
 * Factory for AppContext instances.
 */
function createAppContext(): AppContext {
  const models: Record<string, any> = {}
  const subscriptions: Record<string, Array<(state: any) => void>> = {}
  const eventHandlers: Record<string, Array<(event: any) => void>> = {}
  const effectQueue: Array<() => void> = []
  let pendingUpdates = 0
  let flushingEffects = false

  function newModel<T>(name: string, initialState: T): void {
    models[name] = structuredClone(initialState)
    subscriptions[name] = []
    eventHandlers[name] = []
  }

  function read<T>(name: string): T {
    return structuredClone(models[name])
  }

  function notify(name: string): void {
    effectQueue.push(() => {
      subscriptions[name]?.forEach(cb => cb(models[name]))
    })
  }

  function emit(name: string, event: any): void {
    effectQueue.push(() => {
      eventHandlers[name]?.forEach(cb => cb(event))
    })
  }

  function flushEffects(): void {
    while (effectQueue.length > 0) {
      const effect = effectQueue.shift()!
      effect()
    }
  }

  function update<T>(
    name: string,
    updater: (model: T, ctx: ModelContext<T>) => void
  ): void {
    if (!(name in models)) return
    pendingUpdates++
    updater(models[name], createModelContext(name))
    pendingUpdates--
    if (!flushingEffects && pendingUpdates === 0) {
      flushingEffects = true
      flushEffects()
      flushingEffects = false
    }
  }

  function subscribe<S, T>(
    sourceName: string,
    targetName: string,
    reaction: (source: S, target: T, ctx: ModelContext<T>) => void
  ): void {
    const cb = () => {
      const source = models[sourceName] as S
      const target = models[targetName] as T
      reaction(source, target, createModelContext(targetName))
    }
    subscriptions[sourceName].push(cb)
  }

  function onEvent(name: string, handler: (event: any) => void): void {
    eventHandlers[name].push(handler)
  }

  function createModelContext<T>(name: string): ModelContext<T> {
    return {
      read: () => read<T>(name),
      notify: () => notify(name),
      emit: (event: any) => emit(name, event),
    }
  }

  return { newModel, read, update, subscribe, onEvent }
}

/**
 * renderTo
 * Declaratively render a model into a container and re-render on notify.
 */
function renderTo<T>(
  app: AppContext,
  modelName: string,
  container: Element,
  templateFn: (model: T) => TemplateResult
): void {
  // Initial render
  render(templateFn(app.read<T>(modelName)), container)

  // Subscribe to notify for re-render
  app.subscribe<T, T>(
    modelName,
    modelName,
    (source, _target, _ctx) => {
      render(templateFn(source), container)
    }
  )
}

// -----------------------------------------------------------------------------
// Example Application: Counter + Observer + Subscriber
// -----------------------------------------------------------------------------

// State shapes
interface CounterState { count: number }
interface ObserverState { count: number }
interface SubscriberState { count: number }

// Bootstrap on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const app = createAppContext()

  // Create models
  app.newModel<CounterState>('counter', { count: 0 })
  app.newModel<ObserverState>('observer', { count: 0 })
  app.newModel<SubscriberState>('subscriber', { count: 0 })

  // Observer: double the counter on notify
  app.subscribe<CounterState, ObserverState>(
    'counter',
    'observer',
    (source, target) => {
      target.count = source.count * 2
    }
  )

  // Subscriber: respond to emitted events
  app.onEvent('counter', event => {
    app.update<SubscriberState>('subscriber', (model) => {
      model.count += (event.increment as number) * 2
    })
  })

  // Grab containers from HTML
  const counterDiv = document.getElementById('counter')!
  const observerDiv = document.getElementById('observer')!
  const subscriberDiv = document.getElementById('subscriber')!

  // Render counter UI
  renderTo<CounterState>(app, 'counter', counterDiv, model => html`
    <div>
      <p>Count: ${model.count}</p>
      <button @click=${() => {
        app.update<CounterState>('counter', (m, ctx) => {
          m.count += 1
          ctx.notify()
          ctx.emit({ increment: 1 })
        })
      }}>Increment</button>
    </div>
  `)

  // Render observer UI
  renderTo<ObserverState>(app, 'observer', observerDiv, model => html`
    <div>
      <p>Observer sees: ${model.count}</p>
    </div>
  `)

  // Render subscriber UI
  renderTo<SubscriberState>(app, 'subscriber', subscriberDiv, model => html`
    <div>
      <p>Subscriber accumulates: ${model.count}</p>
    </div>
  `)
})

// helpers.ts

import { html, render, TemplateResult } from 'lit-html'
import {
  createAppContext,
  AppContext,
  ModelContext,
} from './gpui-lit'         // import your core framework

//
// ModelAPI<M>
// A handy wrapper around a single model instance.
//
export interface ModelAPI<M> {
  readonly name: string

  // Read a snapshot of the current state
  read(): M

  // Mutate state in a queued, safe way
  update(updater: (model: M, ctx: ModelContext<M>) => void): void

  // Re-render or react on notify()
  onChange(listener: (model: M) => void): void

  // Emit and listen to typed events
  emit<E = unknown>(event: E): void
  onEvent<E = unknown>(handler: (event: E) => void): void

  // Manually trigger notify effects
  notify(): void
}

//
// createModel
// Creates a new model in the AppContext and returns a ModelAPI<M>.
//
export function createModel<M>(
  app: AppContext,
  name: string,
  initialState: M
): ModelAPI<M> {
  app.newModel<M>(name, initialState)

  return {
    name,
    read: () => app.read<M>(name),
    update: updater => app.update<M>(name, updater),
    onChange: listener =>
      app.subscribe<M, M>(
        name,
        name,
        (source, _target) => listener(source)
      ),
    emit: event =>
      app.update<M>(name, (_, ctx) => ctx.emit(event)),
    onEvent: handler => app.onEvent(name, handler),
    notify: () =>
      app.update<M>(name, (_, ctx) => ctx.notify()),
  }
}

//
// bindModels
// Whenever source.notify() fires, run reaction(source, target).
//
export function bindModels<S, T>(
  source: ModelAPI<S>,
  target: ModelAPI<T>,
  reaction: (source: S, target: T, ctx: ModelContext<T>) => void
): void {
  source.onChange(sourceState =>
    target.update((targetState, ctx) =>
      reaction(sourceState, targetState, ctx)
    )
  )
}

//
// view
// Declaratively render a model into a container and auto-re-render on notify.
//
export function view<M>(
  api: ModelAPI<M>,
  container: Element,
  templateFn: (model: M, api: ModelAPI<M>) => TemplateResult
): void {
  // initial render
  render(templateFn(api.read(), api), container)

  // re-render on notify
  api.onChange(model => {
    render(templateFn(model, api), container)
  })
}

//
// onEvent
// Shorthand for typing event callbacks from a model.
//
export function onEvent<M, E>(
  api: ModelAPI<M>,
  handler: (event: E) => void
): void {
  api.onEvent<E>(handler)
}

//
// bootstrapApp
// Create AppContext and return it for wiring up your models.
//
export function bootstrapApp(): AppContext {
  return createAppContext()
}

// helpers.ts
// Ergonomic GPUI + lit-html helpers with type‐safe events, async models, concurrency & suspense.

import { html, render, TemplateResult } from 'lit-html'
import { until } from 'lit-html/directives/until.js'
import {
  createAppContext,
  AppContext,
  ModelContext,
} from './gpui-lit' // your core framework

// -----------------------------------------------------------------------------
// Core Types
// -----------------------------------------------------------------------------

/**
 * A snapshot of asynchronous state: loading, error, or data.
 */
export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: unknown
}

/**
 * ModelAPI<M>
 * A thin, ergonomic wrapper around a single named model.
 */
export interface ModelAPI<M> {
  readonly name: string

  // read a deep‐cloned snapshot of state
  read(): M

  // queued, run‐to‐completion state mutation
  update(updater: (model: M, ctx: ModelContext<M>) => void): void

  // subscribe to notify() and get typed state
  onChange(listener: (model: M) => void): () => void

  // emit a typed event
  emit<E = unknown>(event: E): void

  // subscribe to typed events
  onEvent<E = unknown>(handler: (event: E) => void): () => void

  // manually trigger notify()
  notify(): void
}

// -----------------------------------------------------------------------------
// Bootstrapping
// -----------------------------------------------------------------------------

/**
 * Create and return a fresh AppContext.
 */
export function bootstrapApp(): AppContext {
  return createAppContext()
}

/**
 * Create a new model in the AppContext and return its ergonomic API.
 */
export function createModel<M>(
  app: AppContext,
  name: string,
  initialState: M
): ModelAPI<M> {
  app.newModel<M>(name, initialState)

  return {
    name,
    read: () => app.read<M>(name),
    update: updater => app.update<M>(name, updater),
    onChange: listener => {
      const unsub = app.subscribe<M, M>(
        name,
        name,
        (source, _target) => listener(source)
      )
      return () => unsub() // detach subscription
    },
    emit: event => {
      app.update<M>(name, (_, ctx) => ctx.emit(event))
    },
    onEvent: handler => {
      const unsub = app.onEvent(name, handler)
      return () => unsub()
    },
    notify: () => {
      app.update<M>(name, (_, ctx) => ctx.notify())
    },
  }
}

/**
 * Bind source → target: whenever source.notify() fires, reaction runs.
 */
export function bindModels<S, T>(
  source: ModelAPI<S>,
  target: ModelAPI<T>,
  reaction: (source: S, target: T, ctx: ModelContext<T>) => void
): () => void {
  const unsub = source.onChange(sourceState => {
    target.update((targetState, ctx) => {
      reaction(sourceState, targetState, ctx)
    })
  })
  return unsub
}

/**
 * Declaratively render a model into a container and auto re‐render on notify.
 */
export function view<M>(
  api: ModelAPI<M>,
  container: Element,
  templateFn: (model: M, api: ModelAPI<M>) => TemplateResult
): () => void {
  // initial render
  render(templateFn(api.read(), api), container)

  // re‐render on notify
  const unsub = api.onChange(model => {
    render(templateFn(model, api), container)
  })
  return unsub
}

// -----------------------------------------------------------------------------
// Typed Events: emit, on, once, wait
// -----------------------------------------------------------------------------

/**
 * createEvent(api)
 * Returns a typed emitter/listener with helpers:
 *  - emit(payload)
 *  - on(handler) ⇒ unsubscribe
 *  - once() ⇒ Promise<Payload>
 *  - wait() ⇒ Promise<Payload>
 */
export function createEvent<M, E>(
  api: ModelAPI<M>
): {
  emit: (payload: E) => void
  on: (handler: (payload: E) => void) => () => void
  once: () => Promise<E>
  wait: () => Promise<E>
} {
  function emit(payload: E) {
    api.emit<E>(payload)
  }

  function on(handler: (payload: E) => void) {
    return api.onEvent<E>(handler)
  }

  function once(): Promise<E> {
    return new Promise(resolve => {
      const unsub = on(payload => {
        resolve(payload)
        unsub()
      })
    })
  }

  function wait(): Promise<E> {
    return once()
  }

  return { emit, on, once, wait }
}

// -----------------------------------------------------------------------------
// Async Models & Suspense
// -----------------------------------------------------------------------------

/**
 * createAsyncModel
 * Wraps a Promise<T> loader into an AsyncState<T> model.
 * Notifies on pending → success or error.
 */
export function createAsyncModel<T>(
  app: AppContext,
  name: string,
  loader: () => Promise<T>
): ModelAPI<AsyncState<T>> {
  const initial: AsyncState<T> = { data: null, loading: true, error: null }
  const api = createModel<AsyncState<T>>(app, name, initial)

  // kick off async load
  ;(async () => {
    try {
      const data = await loader()
      api.update(state => {
        state.data = data
        state.loading = false
      })
      api.notify()
    } catch (err) {
      api.update(state => {
        state.error = err
        state.loading = false
      })
      api.notify()
    }
  })()

  return api
}

/**
 * suspenseView
 * Renders pending/error/success UI based on AsyncState<T>.
 */
export function suspenseView<T>(
  api: ModelAPI<AsyncState<T>>,
  container: Element,
  templates: {
    pending: TemplateResult
    error: (error: unknown) => TemplateResult
    success: (data: T) => TemplateResult
  }
): () => void {
  return view(api, container, state =>
    state.loading
      ? templates.pending
      : state.error
      ? templates.error(state.error)
      : templates.success(state.data as T)
  )
}

// -----------------------------------------------------------------------------
// Concurrent Tasks Helper
// -----------------------------------------------------------------------------

/**
 * runConcurrentTasks
 * Given a map of task name → loader, runs them in parallel,
 * returns a promise of results keyed the same map.
 */
export async function runConcurrentTasks<
  T extends Record<string, any>
>(
  tasks: { [K in keyof T]: () => Promise<T[K]> }
): Promise<T> {
  const entries = Object.entries(tasks) as [keyof T, () => Promise<any>][]
  const promises = entries.map(([key, fn]) => fn().then(res => [key, res] as const))
  const results = await Promise.all(promises)
  return results.reduce((acc, [key, res]) => {
    acc[key] = res
    return acc
  }, {} as T)
}

// ssr.ts
// GPUI + lit-html SSR & Hydration Module
// ---------------------------------------
//
// Provides:
//  - ssr(): server‐side rendering of models → HTML + initial state scripts
//  - hydrate(): client‐side re‐hydration + view binding
//
// Usage:
//   import { ssr } from './ssr'
//   const html = ssr(app => [
//     { api: createModel(app,'counter',{ count:0 }), containerId:'counter', template: CounterTpl },
//     …
//   ])
//
//   import { hydrate } from './ssr'
//   hydrate(app => [
//     { api: createModel(app,'counter',{ count:0 }), containerId:'counter', template: CounterTpl },
//     …
//   ])
//
// Note: CounterTpl is (model, api) => TemplateResult from lit-html.

import { renderToString } from 'lit-html/server.js'
import { render } from 'lit-html'
import type { TemplateResult } from 'lit-html'
import { bootstrapApp, createModel } from './helpers'
import type { AppContext, ModelAPI } from './helpers'

/**
 * A single model’s SSR binding configuration.
 */
interface SSRModel<M> {
  api: ModelAPI<M>
  containerId: string
  template: (model: M, api: ModelAPI<M>) => TemplateResult
}

/**
 * ssr()
 * Given a setup callback that registers models + templates,
 * returns a concatenated HTML string containing:
 *   - <div id="{containerId}">…rendered template…</div>
 *   - <script type="application/json" id="__state-{modelName}">…initialState…</script>
 */
export function ssr(
  setup: (app: AppContext) => SSRModel<any>[]
): string {
  const app = bootstrapApp()
  const models = setup(app)

  return models
    .map(({ api, containerId, template }) => {
      // 1. Read current model state
      const state = api.read()
      const stateJson = JSON.stringify(state)

      // 2. Render template to HTML string
      const content = renderToString(template(state, api))

      // 3. Embed container + state script
      return `
<div id="${containerId}">${content}</div>
<script
  type="application/json"
  id="__state-${api.name}"
  data-container="${containerId}"
>${stateJson}</script>`
    })
    .join('\n')
}

/**
 * Hydration binding config, same shape as SSRModel<M>.
 */
interface HydrateModel<M> {
  api: ModelAPI<M>
  containerId: string
  template: (model: M, api: ModelAPI<M>) => TemplateResult
}

/**
 * hydrate()
 * On client load, re‐create AppContext and models in same order,
 * replay initial state from embedded JSON, then attach live views.
 */
export function hydrate(
  setup: (app: AppContext) => HydrateModel<any>[]
): void {
  const app = bootstrapApp()
  const models = setup(app)

  models.forEach(({ api, containerId, template }) => {
    // 1. Rehydrate state
    const script = document.getElementById(`__state-${api.name}`)
    if (script && script.textContent) {
      const initialState = JSON.parse(script.textContent)
      api.update(model => {
        Object.assign(model, initialState)
      })
    }

    // 2. Bind live view
    const container = document.getElementById(containerId)
    if (container) {
      // Initial client render (hydrates markup)
      render(template(api.read(), api), container)

      // Subscribe to future updates
      api.onChange(model => {
        render(template(model, api), container)
      })
    }
  })
}

// debug.ts
import type { AppContext } from './gpui-lit'

export function enableDebug(app: AppContext) {
  let depth = 0
  // wrap core methods
  const origUpdate = app.update
  app.update = (name, fn) => {
    console.group(`› update(${name}) depth=${depth}`)
    depth++
    const result = origUpdate.call(app, name, fn)
    depth--
    console.log(`✔ flushed effects (depth now ${depth})`)
    console.groupEnd()
    return result
  }
  // similarly wrap notify/emit in gpui-lit before enqueueing…
}

// validation.ts
import { z } from 'zod'
export function validateModel<M>(schema: z.ZodType<M>) {
  return (model: M) => {
    const parsed = schema.safeParse(model)
    if (!parsed.success) {
      console.error('Model validation failed', parsed.error.format())
    }
  }
}

// usage in createModel:
api.onChange(validateModel(userSchema))

// test-utils.ts
import { createAppContext } from './gpui-lit'

export function createTestApp() {
  const app = createAppContext()
  let manualFlush = false
  app['flushEffects'] = () => {
    if (!manualFlush) throw new Error('Effects flushed unexpectedly')
    // original logic…
  }
  return {
    app,
    enableManualFlush() { manualFlush = true },
    disableManualFlush() { manualFlush = false },
  }
}

// in helpers.ts → view()
export function view<M>(...) {
  // …
  const unsub = api.onChange(...)
  return () => {
    unsub()
    render('', container) // clear DOM
  }
}

// then in your component:
const destroy = view(...)
onElementRemoved(destroy) // call destroy when 
element is removed

// plugin.ts
export interface GPUIPlugin {
  onAppCreate?(app: AppContext): void
  onModelCreate?<M>(api: ModelAPI<M>): void
}

// in bootstrapApp():
export function bootstrapApp(plugins: GPUIPlugin[] = []) {
  const app = createAppContext()
  plugins.forEach(p => p.onAppCreate?.(app))
  // wrap newModel to notify plugins…
  return app
}

// react-adapter.tsx
import React, { useSyncExternalStore } from 'react'
export function useModel<M>(api: ModelAPI<M>) {
  return useSyncExternalStore(
    (cb) => api.onChange(cb),
    () => api.read()
  )
}

// in a component:
function Counter({ api }: { api: ModelAPI<CounterState> }) {
  const { count } = useModel(api)
  return <button onClick={() => api.update(m=>m.count++,…)}>+{count}</button>
}// crdt.ts
import { Automerge } from '@automerge/automerge'
export function createCRDTModel<T>(app: AppContext, name: string) {
  const doc = Automerge.init<T>()
  const api = createModel(app, name, doc)
  // on local update: ctx.emit({ changes: Automerge.getChanges… })
  // on remote event: Automerge.applyChanges
  return api
}// debug.ts
import type { AppContext } from './gpui-lit'

export function enableDebug(app: AppContext) {
  let depth = 0

  // Helper to indent logs
  const indent = () => ' '.repeat(depth * 2)

  // Wrap update
  const origUpdate = app.update
  app.update = <T>(name: string, fn: any) => {
    console.group(`${indent()}▶ update(${name})`)
    depth++
    const result = origUpdate.call(app, name, fn)
    depth--
    console.log(`${indent()}✔ update(${name}) complete`)
    console.groupEnd()
    return result
  }

  // Wrap notify
  const origNotify = (app as any).notify
  ;(app as any).notify = (name: string) => {
    console.log(`${indent()}→ notify(${name})`)
    origNotify.call(app, name)
  }

  // Wrap emit
  const origEmit = (app as any).emit
  ;(app as any).emit = (name: string, event: any) => {
    console.log(`${indent()}→ emit(${name},`, event, `)`)
    origEmit.call(app, name, event)
  }

  // Wrap flushEffects (private)
  const priv = app as any
  const origFlush = priv.flushEffects
  priv.flushEffects = () => {
    console.log(`${indent()}⧗ flushEffects start`)
    origFlush.call(app)
    console.log(`${indent()}⧗ flushEffects end`)
  }
}// spy.ts
import type { ModelAPI } from './helpers'
import type { ModelContext } from './gpui-lit'

export interface Operation {
  timestamp: number
  model: string
  type: 'update' | 'notify' | 'emit'
  payload?: any
}

export function attachSpy<M>(api: ModelAPI<M>, history: Operation[]) {
  // Wrap update
  const origUpdate = api.update
  api.update = (fn) => {
    history.push({
      timestamp: Date.now(),
      model: api.name,
      type: 'update'
    })
    return origUpdate(fn)
  }

  // Wrap notify
  const origNotify = api.notify
  api.notify = () => {
    history.push({
      timestamp: Date.now(),
      model: api.name,
      type: 'notify'
    })
    return origNotify()
  }

  // Wrap emit
  const origEmit = api.emit
  api.emit = (evt) => {
    history.push({
      timestamp: Date.now(),
      model: api.name,
      type: 'emit',
      payload: evt
    })
    return origEmit(evt)
  }
}// immutability.ts

// Recursively freeze an object
function deepFreeze<T>(obj: T): T {
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as any)[prop]
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value)
    }
  })
  return Object.freeze(obj)
}

import type { ModelAPI } from './helpers'

export function enforceImmutability<M>(api: ModelAPI<M>) {
  const origUpdate = api.update
  api.update = (updater) => {
    origUpdate((model, ctx) => {
      updater(model, ctx)
      deepFreeze(model)
    })
  }
}// events.ts
import type { ModelAPI } from './helpers'

export function makeEvent<E>(api: ModelAPI<any>) {
  return {
    emit(payload: E) {
      api.emit<E>(payload)
    },
    on(handler: (payload: E) => void) {
      return api.onEvent<E>(handler)
    },
    once(): Promise<E> {
      return new Promise(resolve => {
        const off = api.onEvent<E>(p => {
          off()
          resolve(p)
        })
      })
    },
    filter(predicate: (p: E) => boolean) {
      return {
        on(next: (p: E) => void) {
          return api.onEvent<E>(p => {
            if (predicate(p)) next(p)
          })
        }
      }
    },
    debounce(ms: number) {
      let timeout: any
      return {
        on(next: (p: E) => void) {
          return api.onEvent<E>(p => {
            clearTimeout(timeout)
            timeout = setTimeout(() => next(p), ms)
          })
        }
      }
    },
    map<R>(fn: (p: E) => R) {
      return {
        on(next: (r: R) => void) {
          return api.onEvent<E>(p => next(fn(p)))
        }
      }
    }
  }
}// concurrency.ts

/** Throttle calls to `fn` at most once per `ms`. */
export function throttle<T extends any[]>(
  fn: (...args: T) => void,
  ms: number
) {
  let last = 0
  return (...args: T) => {
    const now = Date.now()
    if (now - last >= ms) {
      last = now
      fn(...args)
    }
  }
}

/** Debounce calls to `fn` until `ms` of inactivity. */
export function debounce<T extends any[]>(
  fn: (...args: T) => void,
  ms: number
) {
  let timeout: any
  return (...args: T) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), ms)
  }
}

/**
 * Batch multiple updates into one flush cycle.
 * Usage: batch(() => { api.update(...); api.update(...); })
 */
import { bootstrapApp } from './helpers'
export function batch(app = bootstrapApp(), work: () => void) {
  app['pendingBatch'] = (app['pendingBatch'] || 0) + 1
  work()
  app['pendingBatch']--
  if (app['pendingBatch'] === 0) {
    ;(app as any).flushEffects()
  }
}// crdt.ts
import * as Automerge from '@automerge/automerge'
import type { AppContext, ModelContext } from './gpui-lit'
import { createModel, ModelAPI } from './helpers'

export function createCRDTModel<T extends object>(
  app: AppContext,
  name: string,
  initialDoc?: T
): ModelAPI<Automerge.FreezeObject<T>> {
  const doc = Automerge.init<T>()
  const api = createModel(app, name, doc as any)

  // Local updates ⇒ emit Automerge changes
  api.update((model, ctx: ModelContext<any>) => {
    const next = Automerge.change(model, d => {
      Object.assign(d, initialDoc || {})
    })
    Object.assign(model, next)
    const changes = Automerge.getLastLocalChange(next)!
    ctx.emit(changes)
  })

  // Listen for remote changes
  api.onEvent<Uint8Array>(change => {
    api.update((model: any) => {
      const [next] = Automerge.applyChanges(model, [change])
      Object.assign(model, next)
    })
  })

  return api
}// listHelpers.ts

// Unique key extractor
export type KeyFn<T, K> = (item: T) => K

// Delta represents one list operation
export type Delta<T, K> =
  | { type: 'insert'; key: K; item: T; to: number }
  | { type: 'delete'; key: K; from: number }
  | { type: 'move'; key: K; from: number; to: number }
  | { type: 'update'; key: K; item: T; at: number }

// Compute minimal deltas from oldArr → newArr
export function diffList<T, K>(
  oldArr: T[],
  newArr: T[],
  getKey: KeyFn<T, K>
): Delta<T, K>[] {
  const oldKeyIndex = new Map<K, number>()
  oldArr.forEach((it, i) => oldKeyIndex.set(getKey(it), i))

  const newKeyIndex = new Map<K, number>()
  newArr.forEach((it, i) => newKeyIndex.set(getKey(it), i))

  const deltas: Delta<T, K>[] = []

  // Deletes
  oldArr.forEach((it, i) => {
    const key = getKey(it)
    if (!newKeyIndex.has(key)) {
      deltas.push({ type: 'delete', key, from: i })
    }
  })

  // Inserts & moves & updates
  newArr.forEach((it, newIndex) => {
    const key = getKey(it)
    const oldIndex = oldKeyIndex.get(key)
    if (oldIndex == null) {
      deltas.push({ type: 'insert', key, item: it, to: newIndex })
    } else {
      if (oldIndex !== newIndex) {
        deltas.push({ type: 'move', key, from: oldIndex, to: newIndex })
      }
      // Always issue update so consumers can patch dynamic parts
      deltas.push({ type: 'update', key, item: it, at: newIndex })
    }
  })

  return deltas
}// Apply deltas to a container of direct children
export function patchList<T, K>(
  container: HTMLElement,
  oldItems: T[],
  newItems: T[],
  getKey: KeyFn<T, K>,
  createEl: (item: T) => HTMLElement,
  updateEl: (el: HTMLElement, item: T) => void
): T[] {
  const deltas = diffList(oldItems, newItems, getKey)
  const keyToEl = new Map<K, HTMLElement>()

  // Build initial map if first run
  if (container.children.length === oldItems.length) {
    Array.from(container.children).forEach(el => {
      const k = (el as any).__key as K
      if (k != null) keyToEl.set(k, el as HTMLElement)
    })
  }

  let currItems = oldItems.slice()

  deltas.forEach(delta => {
    switch (delta.type) {
      case 'delete': {
        const el = keyToEl.get(delta.key)!
        container.removeChild(el)
        keyToEl.delete(delta.key)
        currItems.splice(delta.from, 1)
        break
      }
      case 'insert': {
        const el = createEl(delta.item)
        ;(el as any).__key = delta.key
        container.insertBefore(
          el,
          container.children[delta.to] || null
        )
        keyToEl.set(delta.key, el)
        currItems.splice(delta.to, 0, delta.item)
        break
      }
      case 'move': {
        const el = keyToEl.get(delta.key)!
        container.insertBefore(
          el,
          container.children[delta.to] || null
        )
        currItems.splice(delta.from, 1)
        currItems.splice(delta.to, 0, delta.item)
        break
      }
      case 'update': {
        const el = keyToEl.get(delta.key)!
        updateEl(el, delta.item)
        currItems[delta.at] = delta.item
        break
      }
    }
  })

  return currItems
}

/**
 * Factory: maintains oldItems internally and returns an `update(newItems)` method.
 */
export function createListRenderer<T, K>(
  container: HTMLElement,
  getKey: KeyFn<T, K>,
  createEl: (item: T) => HTMLElement,
  updateEl: (el: HTMLElement, item: T) => void
) {
  let items: T[] = []

  return {
    update(newItems: T[]) {
      items = patchList(container, items, newItems, getKey, createEl, updateEl)
    }
  }
}import { directive, NodePart, TemplateResult } from 'lit-html'
import { diffList } from './listHelpers'

// mapArray(items, keyFn, template) → lit-html directive
export const mapArray = directive(
  <T, K>(
    items: T[],
    getKey: KeyFn<T, K>,
    templateFn: (item: T, index: number) => TemplateResult
  ) => (part: NodePart) => {
    const container = part.startNode.parentNode as HTMLElement
    // store old items on the part instance
    ;(part as any).__listState ??= { items: [] }
    const state = (part as any).__listState as {
      items: T[]
    }

    const deltas = diffList(state.items, items, getKey)
    deltas.forEach(delta => {
      if (delta.type === 'insert') {
        part.appendInto(templateFn(delta.item, delta.to))
      } else if (delta.type === 'delete') {
        part.remove(delta.from, 1)
      } else if (delta.type === 'move') {
        part.insert(delta.to, part.value[delta.from])
        part.remove(delta.from + 1, 1)
      } else if (delta.type === 'update') {
        part.setValueAt(delta.at, templateFn(delta.item, delta.at))
      }
    })

    state.items = items.slice()
  }
)// resource.ts

import type { AppContext, ModelContext } from './gpui-lit'
import { createModel, ModelAPI } from './helpers'
import type { AsyncState } from './helpers'

/** API surface for a GPUI resource */
export interface Resource<S, T> {
  /** The AsyncState<T> model */
  resource: ModelAPI<AsyncState<T>>
  /** Manually re-invoke the fetcher */
  refetch: () => Promise<T>
  /** Override stored data (e.g. optimistic updates) */
  mutate: (data: T) => void
  /** Read loading flag */
  loading: () => boolean
  /** Read error */
  error: () => unknown
}

/**
 * createResource
 *
 * @param app      GPUI AppContext
 * @param source   The ModelAPI that drives the fetch (e.g. an ID or query state)
 * @param name     Unique name for the resource model
 * @param fetcher  Async function: (sourceState, ctx) => Promise<T>
 */
export function createResource<S, T>(
  app: AppContext,
  source: ModelAPI<S>,
  name: string,
  fetcher: (src: S, ctx: ModelContext<AsyncState<T>>) => Promise<T>
): Resource<S, T> {
  // Create the AsyncState<T> model
  const resource = createModel<AsyncState<T>>(app, name, {
    data: null,
    loading: false,
    error: null
  })

  let currentFetchId = 0

  // Core loader logic
  async function load(): Promise<T> {
    const fetchId = ++currentFetchId

    // mark loading
    resource.update((st, ctx) => {
      st.loading = true
      st.error = null
      ctx.notify()
    })

    try {
      const result = await fetcher(source.read(), resource['ctx'] as any)
      // only apply if this is latest fetch
      if (fetchId === currentFetchId) {
        resource.update((st, _ctx) => {
          st.data = result
          st.loading = false
        })
      }
      return result
    } catch (err) {
      if (fetchId === currentFetchId) {
        resource.update((st, _ctx) => {
          st.error = err
          st.loading = false
        })
      }
      throw err
    }
  }

  // Re-fetch whenever source changes
  source.onChange(() => {
    load().catch(() => { /* swallow, error stored in model */ })
  })

  // Kick off initial load
  load().catch(() => {})

  return {
    resource,
    refetch: load,
    mutate: data =>
      resource.update(st => {
        st.data = data
        st.loading = false
        st.error = null
      }),
    loading: () => resource.read().loading,
    error: () => resource.read().error
  }
}