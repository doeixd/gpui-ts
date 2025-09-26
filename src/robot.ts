/**
 * GPUI-TS + Robot Integration Module
 * ==================================
 *
 * This module provides a seamless, type-safe, and ergonomic integration
 * between the `robot3` finite state machine library and GPUI-TS.
 *
 * It introduces a context-aware `useMachine` hook that creates a GPUI-TS `Model`
 * whose state is automatically managed by a Robot state machine. This is the ideal
 * solution for managing complex, multi-step component or feature state in a
 * predictable and robust way.
 *
 * --- FEATURES ---
 * - `useMachine` hook for easy, context-aware machine model creation.
 * - Full TypeScript inference for machine `context`, `states`, and `events`.
 * - Type-safe `send` function to dispatch events to the machine.
 * - Automatic state synchronization between the Robot service and the GPUI-TS model.
 *
 * @dependency robot3: This module requires `robot3`. Install it with `npm install robot3`.
 */

import {
  createMachine,
  interpret,
  Machine,
  Service,
  Action,
  Guard,
  Reducer as Producer,
  guard,
  immediate,
  invoke,
  reduce,
  state,
  transition,
} from 'robot3';
import {
  createModel,
  ModelAPI
} from './index'; // Import from core index
import {
  useApp
} from './ergonomic'; // Use ergonomic context API

// --- TYPE DEFINITIONS ---

/**
 * Represents the state of a running Robot service.
 * @template TService The interpreted machine service.
 */
export interface MachineState < TService extends Service < any >> {
  /** The current state of the machine (e.g., 'preview', 'editMode'). */
  name: TService['machine']['current'];
  /** The extended state (context) of the machine. */
  context: TService['context'];
  /** A helper function to check if the machine is in a given state. */
  matches: (...states: Array < TService['machine']['current'] > ) => boolean;
}

/**
 * An enhanced ModelAPI specifically for a state machine. It includes the machine's
 * `state`, `context`, and a type-safe `send` function to dispatch events.
 *
 * @template TService The interpreted machine service.
 */
export type MachineModelAPI < TService extends Service < any >> =
  ModelAPI < MachineState < TService >> & {
    /**
     * Sends an event to the running state machine to trigger a transition.
     * This function is fully type-safe based on the machine's transition definitions.
     */
    send: TService['send'];
  };

// --- INTEGRATION HOOK ---

/**
 * A context-aware hook that creates a GPUI-TS model driven by a Robot state machine.
 *
 * This is the primary export of the module. It handles creating the machine,
 * interpreting it into a running service, creating a corresponding GPUI-TS model,
 * and keeping them synchronized.
 *
 * @template TMachine The type of the Robot machine definition.
 *
 * @param modelName A unique name for the GPUI-TS model that will be created.
 * @param machineDef The machine definition object, created with `createMachine`.
 * @param initialContext Optional initial context to provide to the machine.
 * @returns An enhanced `MachineModelAPI` for interacting with the machine model.
 */
export function useMachine < TMachine extends Machine < any >> (
  modelName: string,
  machineDef: TMachine,
  initialContext ? : TMachine['context']
): MachineModelAPI < Service < TMachine >> {
  // Use the hook from our context module to get the global app instance.
  const app = useApp();

  // Interpret the machine definition to create a running service.
  // We provide the initial context if it exists.
  const service = interpret(machineDef, (service) => {
    // This callback is invoked whenever the machine's state changes.
    const snapshot = service.machine;
    machineModel.update(state => {
      state.name = snapshot.current;
      state.context = service.context; // Update context
    });
  }, initialContext);

  // Helper function for the model's state.
  const matches = (...states: string[]) => states.includes(service.machine.current);

  // Create the corresponding GPUI-TS model. Its state will mirror the machine's state.
  const machineModel = createModel<MachineState<Service<TMachine>>>(
    app,
    modelName, {
      name: service.machine.current,
      context: service.context,
      matches,
    }
  );

  // The `send` function from the service is what triggers machine transitions.
  const {
    send
  } = service;

  // We return a combined object: the standard GPUI-TS model API, plus the `send` function.
  // This provides a single, unified interface for interacting with the machine model.
  return Object.assign(machineModel, {
    send
  });
}

// Re-export core `robot3` functions for convenience, so users only need to import from this module.
export {
  createMachine,
  state,
  transition,
  reduce,
  invoke,
  guard,
  immediate
};
export type {
  Action,
  Guard,
  Producer
};


// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/*
// --- Uncomment this section to see a full usage example ---

// --- In your main application setup file (`main.ts`) ---
import {
  useMachine,
  createMachine,
  state,
  transition,
  reduce,
  invoke
} from './robot';
import {
  createAppWithContext
} from './context';
import {
  createView
} from './gpui-ts-core';
import {
  html
} from 'lit-html';

// --- Machine Definition ---

// A helper function to simulate a network request
async function saveTitle(ctx: { title: string }): Promise<{ updatedTitle: string }> {
  console.log(`Saving title: "${ctx.title}"...`);
  await new Promise(res => setTimeout(res, 1200));
  if (ctx.title.toLowerCase() === 'error') {
    throw new Error('Save failed! The server rejected the title.');
  }
  console.log('Save successful!');
  return { updatedTitle: ctx.title };
}

// Define the machine using the re-exported functions
const titleEditorMachine = createMachine({
  // Initial context/extended state
  initial: 'preview',
  context: () => ({
    title: 'Click to Edit Me!',
    oldTitle: '',
    error: null as string | null,
  })
}, {
  preview: state(
    transition('EDIT', 'editing',
      // When transitioning, use `reduce` to update the context
      reduce(ctx => ({ ...ctx, oldTitle: ctx.title, error: null }))
    )
  ),
  editing: state(
    transition('INPUT', 'editing',
      reduce((ctx, ev: { value: string }) => ({ ...ctx, title: ev.value }))
    ),
    transition('SAVE', 'saving'),
    transition('CANCEL', 'preview',
      reduce(ctx => ({ ...ctx, title: ctx.oldTitle }))
    )
  ),
  saving: invoke(saveTitle,
    transition('done', 'preview',
      // `ev.data` contains the resolved value from the invoked promise
      reduce((ctx, ev) => ({ ...ctx, title: ev.data.updatedTitle }))
    ),
    transition('error', 'editing',
      // `ev.error` contains the rejection reason from the promise
      reduce((ctx, ev) => ({ ...ctx, error: ev.error.message }))
    )
  )
});


// --- Application Bootstrap ---

// Create the app to establish the context for our `useMachine` hook.
createAppWithContext({ models: {} });

// Create the machine model using our new hook.
const titleEditor = useMachine('titleEditor', titleEditorMachine);


// --- UI Integration (with lit-html) ---
const container = document.getElementById('app')!;

createView(titleEditor, container, (state, ctx) => {
  const { name, context, matches } = state;

  return html`
    <style>
      .editor { border: 1px solid #ccc; padding: 1rem; border-radius: 8px; max-width: 500px; }
      .editor input { font-size: 1.2rem; width: 95%; }
      .editor .buttons { margin-top: 0.5rem; display: flex; gap: 0.5rem; }
      .editor .error { color: red; margin-top: 0.5rem; }
      .editor h2 { margin-top: 0; }
    </style>
    <div class="editor">
      ${matches('preview') ? html`
        <h2>${context.title}</h2>
        <div class="buttons">
          <button @click=${() => titleEditor.send('EDIT')}>Edit</button>
        </div>
      ` : ''}

      ${matches('editing', 'saving') ? html`
        <input
          .value=${context.title}
          @input=${(e: any) => titleEditor.send({ type: 'INPUT', value: e.target.value })}
          ?disabled=${matches('saving')}
        />
        <div class="buttons">
          <button @click=${() => titleEditor.send('SAVE')} ?disabled=${matches('saving')}>
            ${matches('saving') ? 'Saving...' : 'Save'}
          </button>
          <button @click=${() => titleEditor.send('CANCEL')} ?disabled=${matches('saving')}>Cancel</button>
        </div>
        ${context.error ? html`<p class="error">${context.error}</p>` : ''}
      ` : ''}
    </div>
  `;
});
*/