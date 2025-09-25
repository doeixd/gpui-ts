Of course. Server-Side Rendering (SSR) and Hydration are critical features for modern web applications, providing benefits for both performance (Faster Time to First Contentful Paint) and SEO.

Integrating SSR with a state management library like GPUI-TS requires a clear strategy for rendering state on the server, transferring that state to the client, and having the client "take over" the server-rendered HTML without a disruptive re-render.

This process looks different depending on the rendering library used (`lit-html` vs. `dom-expressions`). Below is a comprehensive guide and a robust, type-safe module that handles both scenarios.

---

### The Core SSR & Hydration Pattern for GPUI-TS

Regardless of the rendering engine, the process follows these five fundamental steps:

**On the Server:**
1.  **Initialize the App:** For each incoming request, create a fresh instance of your GPUI-TS application.
2.  **Fetch Data & Mutate State:** Run any necessary async logic to fetch data and update your models to their initial, request-specific state.
3.  **Render to String:** Use the server-side version of your rendering library to convert your component tree into an HTML string.
4.  **Serialize State:** Capture the final state of all your application's models and serialize it into a JSON string.
5.  **Inject:** Embed both the rendered HTML string and the serialized JSON state (usually in a `<script>` tag) into the final HTML document sent to the browser.

**On the Client:**
1.  **Initialize with State:** Create a new instance of your GPUI-TS application, but this time, initialize the models using the serialized state embedded in the HTML.
2.  **Hydrate:** Instead of creating new DOM elements, instruct your rendering library to "hydrate" the existing server-rendered HTML. This involves attaching event listeners and reactive bindings to the DOM that's already present.

---

### Prerequisite: Updating the Core Library

To support hydration, our core `createApp` function needs to be able to accept an initial state payload.

**Modify `createApp` (in `gpui-ts-core.ts`):**

```typescript
// A new type for the initial state payload
type InitialState<TSchema extends AppSchema> = {
  [K in keyof TSchema['models']]?: TSchema['models'][K]['initialState'];
};

export function createApp<TSchema extends AppSchema>(
  schema: TSchema,
  initialState?: InitialState<TSchema> // Add optional parameter
): GPUIApp<TSchema> {
  const registry = new ModelRegistry();
  const models = {} as any;

  for (const [key, def] of Object.entries(schema.models)) {
    // Use the provided initial state for this model, or fall back to the schema's default.
    const stateForModel = initialState?.[key] ?? def.initialState;
    
    const modelSchema: ModelSchema<any> = {
      ...def.schema,
      initialState: stateForModel,
    };
    models[key] = createModelAPI(key, modelSchema, registry);
  }
  
  // ... rest of the function
  return { models, ... };
}
```

---

### The SSR & Hydration Module

Here is a single, robust module that provides the necessary functions for both server and client.

**Save this file as `src/ssr.ts`:**

```typescript
// src/ssr.ts

/**
 * GPUI-TS Server-Side Rendering & Hydration Module
 * ================================================
 *
 * This module provides the necessary tools to render a GPUI-TS application
 * on the server and seamlessly hydrate it on the client. It supports both
 * the `lit-html` and `dom-expressions` rendering engines.
 */

import { renderToString } from 'lit-html/server.js';
import { render as litRender, TemplateResult } from 'lit-html';
import {
  renderToString as deRenderToString,
  hydrate as deHydrate,
} from 'dom-expressions/src/server'; // Assuming dom-expressions has a server entry point
import { AppSchema, ModelAPI } from './gpui-ts-core';
import { createAppWithContext, GPUIApp } from './context';

// --- TYPE DEFINITIONS ---

const STATE_SCRIPT_ID = '__GPUI_STATE__';

/** Defines the binding between a model and its rendering template/component. */
interface SSRBinding<TModel extends ModelAPI<any>> {
  containerId: string;
  template: (model: TModel) => TemplateResult | any; // `any` for JSX result
}

/** The output of the server-side rendering process. */
interface SSROutput {
  /** The rendered HTML for all components. */
  html: string;
  /** The serialized state script to be embedded in the document. */
  stateScript: string;
}

// --- SERVER-SIDE RENDERING ---

/**
 * Renders a GPUI-TS application to an HTML string on the server.
 *
 * This function creates a fresh app instance, allows you to run setup logic
 * (like data fetching), and then renders the UI and serializes the final state.
 *
 * @param setupFn A function that receives the app instance and returns an array of SSR bindings.
 * @param renderer The rendering engine to use ('lit' or 'dom-expressions').
 * @returns A promise that resolves to the rendered HTML and the state script.
 */
export async function renderAppToString(
  schema: AppSchema,
  setupFn: (app: GPUIApp<any>) => Promise<SSRBinding<any>[]>,
  renderer: 'lit' | 'dom-expressions'
): Promise<SSROutput> {
  // 1. Create a fresh app instance for the request.
  const app = createAppWithContext(schema);

  // 2. Run user-defined setup and data fetching logic.
  const bindings = await setupFn(app);

  // 3. Render each component to an HTML string.
  let html = '';
  for (const binding of bindings) {
    const model = app.models[binding.model.name];
    let componentHtml = '';

    if (renderer === 'lit') {
      componentHtml = await renderToString(binding.template(model));
    } else {
      // dom-expressions SSR is typically synchronous after async setup
      componentHtml = deRenderToString(() => binding.template(model));
    }
    html += `<div id="${binding.containerId}">${componentHtml}</div>`;
  }

  // 4. Serialize the final state of ALL models in the app.
  const initialState: Record<string, any> = {};
  for (const key in app.models) {
    initialState[key] = (app.models[key] as ModelAPI<any>).read();
  }

  // 5. Create the state script tag.
  const stateScript = `
    <script type="application/json" id="${STATE_SCRIPT_ID}">
      ${JSON.stringify(initialState).replace(/</g, '\\u003c')}
    </script>
  `;

  return { html, stateScript };
}

// --- CLIENT-SIDE HYDRATION ---

/**
 * Hydrates a GPUI-TS application on the client.
 *
 * This function reads the server-provided state, initializes the app with it,
 * and then attaches reactive bindings and event listeners to the existing DOM.
 *
 * @param setupFn A function that receives the hydrated app instance and returns bindings.
 * @param renderer The rendering engine used on the server.
 */
export function hydrateApp(
  schema: AppSchema,
  setupFn: (app: GPUIApp<any>) => SSRBinding<any>[],
  renderer: 'lit' | 'dom-expressions'
): void {
  // 1. Find and parse the serialized state from the DOM.
  const stateScript = document.getElementById(STATE_SCRIPT_ID);
  if (!stateScript) {
    throw new Error(`[GPUI-TS] State script with ID "${STATE_SCRIPT_ID}" not found. Hydration failed.`);
  }
  const initialState = JSON.parse(stateScript.textContent || '{}');

  // 2. Create the app instance, providing the initial state from the server.
  const app = createAppWithContext(schema, initialState);
  
  // 3. Get the component bindings.
  const bindings = setupFn(app);

  // 4. Hydrate each component.
  for (const binding of bindings) {
    const container = document.getElementById(binding.containerId);
    if (!container) {
      console.warn(`[GPUI-TS] Container with ID "${binding.containerId}" not found for hydration.`);
      continue;
    }

    const model = app.models[binding.model.name];

    if (renderer === 'lit') {
      // `lit-html` does not have true hydration. It re-renders on the client.
      // However, because the client state matches the server state, there will be
      // no visible change or flash, and it efficiently attaches listeners.
      litRender(binding.template(model), container);
    } else {
      // `dom-expressions` has true hydration. It finds markers in the SSR'd HTML
      // and attaches listeners and effects without rebuilding the DOM.
      deHydrate(() => binding.template(model), container);
    }
  }
}
```

### Example Usage

Here's how you would use the `ssr.ts` module in a typical client-server setup.

#### 1. Shared Setup Code (`shared-setup.ts`)

This file defines the components and their bindings, and it's used by both the server and the client.

```typescript
// src/shared-setup.ts
import { html, TemplateResult } from 'lit-html';
import { useModel, GPUIApp } from './context';
import { ModelAPI } from './gpui-ts-core';

// Define a type for our app for better type safety
type MyApp = GPUIApp<{ models: { counter: ModelAPI<{ count: number }> } }>;

// A simple counter component template
function CounterComponent(model: ModelAPI<{ count: number }>): TemplateResult {
  const increment = () => model.update(s => s.count++);
  return html`
    <div>
      <h1>Count: ${model.read().count}</h1>
      <button @click=${increment}>Increment</button>
    </div>
  `;
}

// The setup function wires everything together
export function setupApp(app: MyApp) {
  const counterModel = useModel<MyApp, 'counter'>('counter');
  return [{
    containerId: 'counter-app',
    template: () => CounterComponent(counterModel)
  }];
}
```

#### 2. Server-Side Entrypoint (`server.ts`)

This example uses Express.js to handle requests, render the app, and send the final HTML.

```typescript
// src/server.ts
import express from 'express';
import { renderAppToString } from './ssr';
import { setupApp } from './shared-setup';

const app = express();
const port = 3000;

// Define your app schema
const AppSchema = {
  models: {
    counter: { initialState: { count: 5 } } // Initial count is 5 on the server
  }
};

app.get('/', async (req, res) => {
  // For each request, render the app to a string
  const { html, stateScript } = await renderAppToString(AppSchema, async (app) => {
    // Here you could perform async data fetching and update models
    // before returning the bindings.
    return setupApp(app as any);
  }, 'lit');

  // Inject the rendered HTML and state into a document template
  const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>GPUI-TS SSR Demo</title>
      ${stateScript}
    </head>
    <body>
      <div id="root">${html}</div>
      <script src="/client.js"></script>
    </body>
    </html>
  `;

  res.send(fullHtml);
});

// Serve the client-side bundle
app.use(express.static('dist'));

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
```

#### 3. Client-Side Entrypoint (`client.ts`)

This is the script that runs in the browser. It calls `hydrateApp` to take over the server-rendered DOM.

```typescript
// src/client.ts
import { hydrateApp } from './ssr';
import { setupApp } from './shared-setup';

// Define the schema again on the client
const AppSchema = {
  models: {
    counter: { initialState: { count: 0 } } // This default is overridden by server state
  }
};

// When the DOM is ready, hydrate the application
document.addEventListener('DOMContentLoaded', () => {
  hydrateApp(AppSchema, setupApp, 'lit');
});
```

This complete setup demonstrates a full server-side rendering and hydration cycle, showcasing how GPUI-TS can be used to build high-performance, SEO-friendly web applications with either `lit-html` or the more advanced `dom-expressions` engine.