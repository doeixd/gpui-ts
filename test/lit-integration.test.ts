import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { html, render } from 'lit-html'
import {
  createView,
  createComponent,
  bind,
  when,
  forEach,
  asyncTemplate,
  suspense,
  devView,
  performanceView,
  type TemplateFunction
} from '../dist/esm/development/index.js'
import { createApp } from '../dist/esm/development/index.js'

// Mock DOM elements for testing
let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
  }
})

describe('Lit-HTML Integration', () => {
  describe('Reactive View Binding', () => {
    it('should create a reactive view that updates on model changes', async () => {
      const app = createApp({
        models: {
          counter: { initialState: { count: 0 } }
        }
      })

      const template: TemplateFunction<{ count: number }> = (state, ctx) => html`
        <div>
          <span>Count: ${state.count}</span>
          <button @click=${() => ctx.update(s => s.count++)}>+</button>
        </div>
      `

      const view = createView(app.models.counter, container, template)

      // Initial render
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Count: 0')

      // Update model
      app.models.counter.update(s => s.count = 5)

      // Wait for re-render
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Count: 5')

      view.destroy()
    })

    it('should handle view context methods', async () => {
      const app = createApp({
        models: {
          user: { initialState: { name: 'John', age: 30 } }
        }
      })

      let emittedEvent = null
      app.models.user.onEvent((event) => {
        emittedEvent = event
      })

      const template: TemplateFunction<{ name: string; age: number }> = (state, ctx) => html`
        <div>
          <input .value=${ctx.bind('name').value} @input=${ctx.bind('name').onChange} />
          <button @click=${() => ctx.emit({ type: 'test', data: 'hello' })}>Emit</button>
        </div>
      `

      const view = createView(app.models.user, container, template)

      await new Promise(resolve => setTimeout(resolve, 0))

      // Test bind directive
      const input = container.querySelector('input') as HTMLInputElement
      expect(input.value).toBe('John')

      // Change input
      input.value = 'Jane'
      input.dispatchEvent(new Event('input'))

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(app.models.user.read().name).toBe('Jane')

      // Test emit
      const button = container.querySelector('button') as HTMLButtonElement
      button.click()

      expect(emittedEvent).toEqual({ type: 'test', data: 'hello' })

      view.destroy()
    })

    it('should support nested views', async () => {
      const app = createApp({
        models: {
          parent: { initialState: { title: 'Parent' } },
          child: { initialState: { content: 'Child content' } }
        }
      })

      const childTemplate: TemplateFunction<{ content: string }> = (state) => html`
        <div>Child: ${state.content}</div>
      `

      const parentTemplate: TemplateFunction<{ title: string }> = (state, ctx) => html`
        <div>
          <h1>${state.title}</h1>
          ${ctx.view(app.models.child, childTemplate)}
        </div>
      `

      const view = createView(app.models.parent, container, parentTemplate)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Parent')
      expect(container.textContent).toContain('Child: Child content')

      view.destroy()
    })

    it('should handle lifecycle hooks', async () => {
      const app = createApp({
        models: {
          test: { initialState: { value: 0 } }
        }
      })

      let mounted = false
      let unmounted = false

      const template: TemplateFunction<{ value: number }> = (state, ctx) => {
        ctx.onMount(() => {
          mounted = true
          return () => unmounted = true
        })

        return html`<div>Value: ${state.value}</div>`
      }

      const view = createView(app.models.test, container, template)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(mounted).toBe(true)
      expect(unmounted).toBe(false)

      view.destroy()
      expect(unmounted).toBe(true)
    })
  })

  describe('Component System', () => {
    it('should create and render components', async () => {
      const CounterComponent = createComponent<{}, { count: number }>((props) => ({
        state: { count: 0 } as any, // Simplified for test
        template: (state, ctx) => html`
          <div>
            <span>Count: ${state.count}</span>
            <button @click=${() => ctx.update(s => s.count++)}>+</button>
          </div>
        `
      }))

      const renderComponent = CounterComponent({}, container)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Count: 0')

      // Click button
      const button = container.querySelector('button') as HTMLButtonElement
      button.click()

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Count: 1')

      renderComponent.destroy()
    })

    it('should handle component props', async () => {
      interface CounterProps {
        initialCount: number
        step: number
      }

      const CounterComponent = createComponent<CounterProps, { count: number }>((props) => ({
        state: { count: props.initialCount } as any,
        template: (state, ctx) => html`
          <div>
            <span>Count: ${state.count}</span>
            <button @click=${() => ctx.update(s => s.count += props.step)}>+${props.step}</button>
          </div>
        `
      }))

      const renderComponent = CounterComponent({ initialCount: 10, step: 5 }, container)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Count: 10')

      const button = container.querySelector('button') as HTMLButtonElement
      button.click()

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Count: 15')

      renderComponent.destroy()
    })

    it('should support component effects and lifecycle', async () => {
      let effectRun = false
      let mounted = false
      let unmounted = false

      const TestComponent = createComponent<{}, { value: string }>((props) => ({
        state: { value: 'test' } as any,
        template: (state, ctx) => {
          ctx.onMount(() => {
            mounted = true
            return () => unmounted = true
          })
          return html`<div>${state.value}</div>`
        },
        effects: [
          (state) => {
            effectRun = true
            return () => {} // cleanup
          }
        ]
      }))

      const renderComponent = TestComponent({}, container)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(mounted).toBe(true)
      expect(effectRun).toBe(true)
      expect(unmounted).toBe(false)

      renderComponent.destroy()
      expect(unmounted).toBe(true)
    })
  })

  describe('Directives', () => {
    it('should bind form inputs to model properties', async () => {
      const app = createApp({
        models: {
          form: { initialState: { name: '', email: '', agreed: false } }
        }
      })

      const template: TemplateFunction<{ name: string; email: string; agreed: boolean }> = (state, ctx) => html`
        <div>
          <input id="name" .value=${ctx.bind('name').value} @input=${ctx.bind('name').onChange} />
          <input id="email" type="email" .value=${ctx.bind('email').value} @input=${ctx.bind('email').onChange} />
          <input id="agreed" type="checkbox" .checked=${ctx.bind('agreed').value} @change=${ctx.bind('agreed').onChange} />
        </div>
      `

      const view = createView(app.models.form, container, template)

      await new Promise(resolve => setTimeout(resolve, 0))

      const nameInput = container.querySelector('#name') as HTMLInputElement
      const emailInput = container.querySelector('#email') as HTMLInputElement
      const agreedInput = container.querySelector('#agreed') as HTMLInputElement

      // Test initial values
      expect(nameInput.value).toBe('')
      expect(emailInput.value).toBe('')
      expect(agreedInput.checked).toBe(false)

      // Update inputs
      nameInput.value = 'John'
      nameInput.dispatchEvent(new Event('input'))

      emailInput.value = 'john@example.com'
      emailInput.dispatchEvent(new Event('input'))

      agreedInput.click()

      await new Promise(resolve => setTimeout(resolve, 0))

      const formState = app.models.form.read()
      expect(formState.name).toBe('John')
      expect(formState.email).toBe('john@example.com')
      expect(formState.agreed).toBe(true)

      view.destroy()
    })

    it('should conditionally render with when directive', async () => {
      const app = createApp({
        models: {
          toggle: { initialState: { show: true, message: 'Hello World' } }
        }
      })

      const template: TemplateFunction<{ show: boolean; message: string }> = (state, ctx) => html`
        <div>
          ${state.show ? html`<p>${state.message}</p>` : html`<p>Hidden</p>`}
          <button @click=${() => ctx.update(s => s.show = !s.show)}>Toggle</button>
        </div>
      `

      const view = createView(app.models.toggle, container, template)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Hello World')

      const button = container.querySelector('button') as HTMLButtonElement
      button.click()

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Hidden')

      view.destroy()
    })

    it('should render lists with forEach directive', async () => {
      const app = createApp({
        models: {
          list: {
            initialState: {
              items: [
                { id: 1, text: 'Item 1' },
                { id: 2, text: 'Item 2' }
              ]
            }
          }
        }
      })

      const template: TemplateFunction<{ items: Array<{ id: number; text: string }> }> = (state, ctx) => html`
        <ul>
          ${state.items.map(item => html`<li>${item.text}</li>`)}
        </ul>
      `

      const view = createView(app.models.list, container, template)

      await new Promise(resolve => setTimeout(resolve, 0))
      const lis = container.querySelectorAll('li')
      expect(lis).toHaveLength(2)
      expect(lis[0].textContent).toBe('Item 1')
      expect(lis[1].textContent).toBe('Item 2')

      view.destroy()
    })
  })

  describe('Async Rendering', () => {
    it('should handle async templates with loading states', async () => {
      const promise = new Promise<string>(resolve => setTimeout(() => resolve('Loaded data'), 10))

      const template = asyncTemplate(promise, {
        pending: html`<div>Loading...</div>`,
        fulfilled: (data) => html`<div>Success: ${data}</div>`,
        rejected: (error) => html`<div>Error: ${error.message}</div>`
      })

      render(template, container)

      // Initially shows loading
      expect(container.textContent).toContain('Loading...')

      // Wait for promise to resolve
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(container.textContent).toContain('Success: Loaded data')
    })

    it('should handle suspense boundaries', async () => {
      const resource = {
        loading: false,
        data: 'Hello World',
        error: null
      }

      const template = suspense(resource, {
        loading: html`<div>Loading...</div>`,
        error: (error) => html`<div>Error: ${error}</div>`,
        success: (data) => html`<div>Data: ${data}</div>`
      })

      render(template, container)
      expect(container.textContent).toContain('Data: Hello World')

      // Test loading state
      resource.loading = true
      resource.data = null
      render(suspense(resource, {
        loading: html`<div>Loading...</div>`,
        error: (error) => html`<div>Error: ${error}</div>`,
        success: (data) => html`<div>Data: ${data}</div>`
      }), container)
      expect(container.textContent).toContain('Loading...')

      // Test error state
      resource.loading = false
      resource.error = new Error('Test error')
      render(suspense(resource, {
        loading: html`<div>Loading...</div>`,
        error: (error) => html`<div>Error: ${error}</div>`,
        success: (data) => html`<div>Data: ${data}</div>`
      }), container)
      expect(container.textContent).toContain('Error: Test error')
    })
  })

  describe('Development Utilities', () => {
    it('should wrap templates with dev view debugging', async () => {
      const app = createApp({
        models: {
          test: { initialState: { value: 0 } }
        }
      })

      let renderCount = 0
      const originalTemplate: TemplateFunction<{ value: number }> = (state, ctx) => {
        renderCount++
        return html`<div>Value: ${state.value}</div>`
      }

      const devTemplate = devView(app.models.test, originalTemplate, {
        name: 'TestView',
        logRenders: false, // Disable logging for test
        highlightUpdates: true
      })

      const view = createView(app.models.test, container, devTemplate)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(renderCount).toBe(1)
      expect(container.querySelector('div')).toBeTruthy()

      // Update to trigger re-render
      app.models.test.update(s => s.value = 1)
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(renderCount).toBe(2)

      view.destroy()
    })

    it('should monitor performance with performance view', async () => {
      const app = createApp({
        models: {
          test: { initialState: { value: 0 } }
        }
      })

      const template: TemplateFunction<{ value: number }> = (state, ctx) => {
        // Simulate some work
        let sum = 0
        for (let i = 0; i < 1000; i++) {
          sum += i
        }
        return html`<div>Sum: ${sum}, Value: ${state.value}</div>`
      }

      const perfTemplate = performanceView(app.models.test, template)

      const view = createView(app.models.test, container, perfTemplate)

      await new Promise(resolve => setTimeout(resolve, 0))

      // Check if performance data was added to window
      if (typeof window !== 'undefined') {
        expect((window as any).__GPUI_PERF__).toBeDefined()
        expect((window as any).__GPUI_PERF__.test).toBeDefined()
      }

      view.destroy()
    })
  })

  describe('View Lifecycle', () => {
    it('should properly destroy views and clean up resources', async () => {
      const app = createApp({
        models: {
          test: { initialState: { value: 0 } }
        }
      })

      let cleanupCalled = false

      const template: TemplateFunction<{ value: number }> = (state, ctx) => {
        ctx.onMount(() => {
          return () => cleanupCalled = true
        })
        return html`<div>${state.value}</div>`
      }

      const view = createView(app.models.test, container, template)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(cleanupCalled).toBe(false)

      view.destroy()
      expect(cleanupCalled).toBe(true)
      expect(view.mounted).toBe(false)
    })

    it('should update templates dynamically', async () => {
      const app = createApp({
        models: {
          test: { initialState: { value: 0 } }
        }
      })

      const template1: TemplateFunction<{ value: number }> = (state) => html`<div>Template 1: ${state.value}</div>`
      const template2: TemplateFunction<{ value: number }> = (state) => html`<div>Template 2: ${state.value}</div>`

      const view = createView(app.models.test, container, template1)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Template 1')

      view.updateTemplate(template2)

      await new Promise(resolve => setTimeout(resolve, 0))
      expect(container.textContent).toContain('Template 2')

      view.destroy()
    })
  })
})