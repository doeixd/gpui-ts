import { createApp } from './dist/esm/development/index.js'
import { createView, html } from './dist/esm/development/index.js'

const app = createApp({
  models: {
    test: { initialState: { value: 0 } }
  }
})

const container = document.createElement('div')
document.body.appendChild(container)

const template1 = (state) => html`<div>Template 1: ${state.value}</div>`
const template2 = (state) => html`<div>Template 2: ${state.value}</div>`

const view = createView(app.models.test, container, template1)

console.log('Initial render...')
setTimeout(() => {
  console.log('Container content:', container.textContent)
  console.log('View template:', view.template.toString().substring(0, 50) + '...')

  console.log('Updating template...')
  view.updateTemplate(template2)

  setTimeout(() => {
    console.log('After update - Container content:', container.textContent)
    console.log('View template after update:', view.template.toString().substring(0, 50) + '...')

    view.destroy()
  }, 0)
}, 0)