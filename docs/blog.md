# The Perils of Reactivity: Notes from an Experiment in Explicit Control with GPUI-TS


Matthew Phillips' ["The Perils of Reactivity"](https://outbox.matthewphillips.info/archive/perils-of-reactivity) lands like a well-timed reality check amid the signal hype. Those of us knee-deep in JS state wrangling know the drill: what starts as a clean reactive graph ends in stale deps, untraceable cascades, and the nagging sense that your app is now a reluctant distributed system. Phillips articulates the why behind the frustration—wrappers obscuring data, debugging black holes, control slipping away, over-renders multiplying—without pulling punches.

GPUI-TS sits at the intersection of these concerns and a different lineage: Zed's GPUI, a Rust UI framework born from editor-scale demands. GPUI-TS ports its core mental model to TypeScript as a lightweight state management library—not a full framework, but a way to handle shared, reactive state across views or components. The philosophy is straightforward: centralize ownership to enforce predictability, lease mutability for safety, and queue effects for linear execution. State lives in plain objects owned by a single `App`; models are typed handles to slices of it. Updates happen via `.update()`, a method that temporarily leases mutable access to the state in a callback—allowing direct mutations while keeping the broader app immutable. There, you can call `.notify()` to opt into reactivity, queuing observers and subscribers to run post-update. Reactivity emerges from composed events (filter/map chains) and subjects (auto-deriving values), but it's always on your terms—no proxies tracking every access, no implicit graphs. Lenses add a functional layer: composable getters/setters for nested paths, enabling immutable updates and focused sub-models without full leases. The result? A system that's reactive where it counts (derivations, async flows) but feels imperative and inspectable elsewhere, bridging Rust's borrow discipline with TS's flexibility. It's early days (v0.0.3), tested in prototypes rather than production, but the explicitness has already surfaced bugs that reactivity might have buried.

With that sketch in mind, let's revisit Phillips' perils one by one. For each, I'll trace how GPUI-TS intervenes—often through layered mechanisms: model-level isolation for broad safety, paths/lenses for precision, and transactions/queues for atomicity. Code examples illustrate, but the intent is transparency: see the seams, spot the trade-offs.

## Wrapper Types and Obscured Data: Plain Objects, with Opt-In Layers

Reactivity's wrappers—signals, observables, proxies—turn data into artifacts of the system, Phillips notes. Logging yields metadata, not substance; serialization stumbles; external tools (charts, validators) demand unwrapping rituals. The cost: your domain objects lose their plainness.

GPUI-TS starts from plain TS objects, centrally owned in the `App`. Schemas scaffold types without encasing state:

```typescript
const Schema = createSchema()
  .model('user', { name: '', email: '', profile: { age: 0 } })
  .build();

const app = createApp(Schema);
```

`app.models.user.read()` hands back `{ name: '', email: '', profile: { age: 0 } }`—unadorned, ready for `console.log` or `JSON.stringify`. No shell to crack:

```typescript
console.log(app.models.user.read().profile);  // { age: 0 }—direct
JSON.stringify(app.models.user.read());  // Serializes cleanly
```

Mutations via `.update()` lease the object temporarily, preserving its vanilla nature—mutate freely in the callback, then seal it back:

```typescript
app.models.user.update((state, ctx) => {
  state.name = 'Alice';  // Plain assignment
  state.profile.age = 30;
  ctx.notify();  // Opt-in: queues observers without wrapping state
});
```

The `.notify()` call is key here: it doesn't embed reactivity in the data (no wrappers), but explicitly signals derived views or subjects to refresh post-lease. Reactivity opts in selectively: Events and subjects work on extracted values, not the model itself:

```typescript
const [onAgeChange, emitAgeChange] = createEvent<number>();
const ageGroup = createSubject('young', onAgeChange(age => () => age >= 65 ? 'senior' : 'adult'));
```

`ageGroup.read()` is a string—no wrapper. For nested access, lenses provide a composable alternative, still yielding primitives: a lens is a pair of functions (getter/setter) for immutable paths, typed via schema inference.

```typescript
const ageLens = app.models.user.lensAt('profile.age');
const currentAge = ageLens.get(app.models.user.read());  // 30—plain number
app.models.user.update((state) => {
  const newState = ageLens.set(state, 31);  // Immutable set, then mutate leased state
  Object.assign(state, newState);
  ctx.notify();  // Only if you want reactivity
});
```

This multi-pronged setup—raw reads for inspection/integration, value-based subjects for derivations, lenses for immutable nesting without full leases—keeps data accessible without forcing reactivity everywhere. `.update()` + `.notify()` ensure mutations stay direct, while lenses offer a wrapper-free functional escape for complex paths.

## Debugging: Explicit Chains and Queued Traces

Phillips evokes the debugging fog: traces jammed with framework plumbing, dependency graphs as hidden mazes, the eternal "why this update, why not that one?" hunt.

GPUI-TS builds visibility from the ground up: explicit subscriptions mean no inferred deps, and queued effects (enqueued on `.notify()` or emits, flushed post-`.update()`) ensure linear, traceable flow. Handlers fire in your code's context:

```typescript
const [onClick, emitClick] = createEvent<void>();
const count = createSubject(0, onClick(() => c => c + 1));
const doubled = createSubject(0, count.map(c => c * 2));

doubled.subscribe(value => {
  console.trace('Doubled updated:', value);  // Trace anchors here—your sub
});
```

Emit queues the chain (click → count → doubled); the `.update()` flush executes sequentially, traces threading through *your* callbacks, not internals—`.notify()` marks the enqueue point precisely. For deeper probes, dev mode layers on queue logging:

```typescript
window.__GPUI_DEBUG__.traceEffects();  // Logs: 'Update on user -> Notify (age=31) -> Subject ageGroup -> Flush'
```

Stale deps? Chaining makes them overt—no arrays to botch:

```typescript
const validEmail = onEmailInput
  .filter(email => email.includes('@'))
  .map(email => email.toLowerCase());

validEmail.subscribe(email => { /* If skipped by filter, no trace here */ });
```

A third safeguard: Snapshots capture state mid-flow (`model.snapshot()`), diffable against `restore()` for time-travel debugging. Transactions contain traces further, bundling multiple `.update()` + `.notify()` calls:

```typescript
app.transaction(() => {
  // Nested updates; single trace block
  app.models.user.update((s, ctx) => { s.email = 'new@example.com'; ctx.notify(); });
});
```

The queue's predictability—triggered by explicit `.notify()`—turns debugging into following a script, not divining a graph, while lenses let you isolate traces to sub-paths without full-model noise.

## Inversion of Control: Leased Mutability and Guaranteed Flushes

The philosophical core of Phillips' inversion: dispatch an update, but surrender to the system's timing—races emerge, consistency "eventual," escape hatches proliferate.

GPUI-TS counters by leasing mutability from the central `App`: `.update()` is synchronous within the callback, effects queue for immediate post-flush settlement. No deferred magic—you know the DOM (or views) syncs before yield, as `.notify()` defers just enough for batching:

```typescript
app.models.ui.update((state, ctx) => {
  state.theme = 'dark';
  ctx.notify();  // Queues subs—flushes before next tick
});
// Views reflect here—guaranteed by post-update flush
```

For concurrency risks, transactions provide atomicity (one mechanism); narrow paths limit scope (another), with lenses focusing leases:

```typescript
const themeLens = app.models.ui.lensAt('theme');
app.transaction(() => {
  app.models.ui.focus(themeLens).update((theme, ctx) => { theme = 'light'; ctx.notify(); });
  // Atomic: theme swap + any derived notify
});
```

Or, gate via explicit view subs:

```typescript
createView(app.models.ui, el, (state, ctx) => {
  // Only this slice reacts—no global inversion
  html`<div class=${state.theme}>...</div>`;
});
```

Effects add controlled async (third): Run post-flush (after `.notify()`), with explicit cleanup, sequencing back into leases. Races recede because you orchestrate the cycle—`.update()` owns the mutation window, lenses narrow it.

## Over-Rendering: Paths, Lenses, and Batched Queues

Over-renders, Phillips warns, cascade from reactivity's eagerness, turning perf into perpetual tuning.

Precision is GPUI-TS's first line: Path updates notify only dependents (`updateAt('todos.0.done', true)`—no full-model refresh). Lenses compose for finer grains (second), allowing focused `.update()` without broad leases:

```typescript
const doneLens = lens(t => t.done, (t, d) => ({ ...t, done: d }));
const firstTodoLens = app.models.todos.lensAt('items.0').compose(doneLens);
app.models.todos.focus(firstTodoLens).update((d, ctx) => { d = true; ctx.notify(); });  // Scoped notify
```

Queues batch duplicates (third), transactions group (fourth):

```typescript
app.batch(() => {  // Alias for transaction in simple cases
  app.models.todos.updateAt('filter', 'active');
  app.models.stats.update((s, ctx) => { /* Derive */; ctx.notify(); });  // One flush
});
```

Lit-integrated views (`createView`) leverage declarative diffs, keeping actual DOM touches minimal. In a todo prototype, this halved re-render counts versus hook-based setups—explicit `.notify()` + lens isolation make it tunable without exhaustion.

## Stateful Interactions: Transactions and Contextual Effects

Phillips closes with reactivity's imperial blind spot: preserving focus, cursors, selections amid updates. "Tricky" understates the drift.

GPUI-TS elevates these to first-class: Transactions sync them atomically (core approach), wrapping `.update()` + `.notify()`:

```typescript
app.transaction(() => {
  app.models.editor.update((s, ctx) => { 
    s.text = `${s.text.slice(0, s.cursor.pos)}${char}${s.text.slice(s.cursor.pos)}`; 
    ctx.notify();
  });
  app.models.ui.update((s, ctx) => { s.focused = 'editor'; ctx.notify(); });
  // Cursor, selection, focus all post-flush coherent
});
```

Lenses target imperatively (supplemental), focusing the lease:

```typescript
const cursorLens = app.models.editor.lensAt('cursor.pos');
app.models.editor.focus(cursorLens).update((p, ctx) => { p += char.length; ctx.notify(); });
```

Effects wire DOM syncs (layered), post-`.notify()`:

```typescript
app.models.editor.update((s, ctx) => {
  // Update state
  ctx.notify();
  ctx.effect(() => {
    editorEl.focus();
    editorEl.setSelectionRange(s.cursor.pos, s.cursor.pos);
    return () => editorEl.blur();  // Guard against leaks
  });
});
```

Compose them—transaction wrapping lens+effect—and stateful puzzles stabilize. In an editor mockup, cursor jumps ceased; the explicitness surfaced why.

## Closing Thoughts

Phillips' perils expose reactivity's runtime bargains: power for predictability lost. GPUI-TS, in its small way, experiments with a counter-offer: explicit ownership and queuing to reclaim the latter, without ditching derivations. `.update()` leases control, `.notify()` opts into flow, lenses functionalize paths—it's not Rust's borrow checker (TS gaps remain), but the mental model has clarified more than it obscured in our tests.

If this echoes your struggles, poke the [repo](https://github.com/doeixd/gpui-ts)—examples await. Which peril bites hardest in your world? Comments open.

*Grateful for the mirror, Matthew—your lens sharpens ours.*
