/**
 * GPUI-TS Signals Module (Powered by Alien Signals)
 * ================================================
 *
 * This module provides a production-ready implementation of a high-performance,
 * SolidJS-like reactive system, directly integrated with the GPUI-TS core. The
 * underlying push-pull algorithm is derived from `alien-signals` for maximum
 * performance.
 *
 * It is designed to be a powerful tool for managing complex, localized UI state
 * while allowing the main application state to live within the structured,
 * predictable GPUI-TS models.
 *
 * --- FEATURES ---
 * - `signal`, `computed`, `effect`, `effectScope`: A complete, high-performance
 *   reactive primitive set.
 * - **Deep Integration**: A `fromModel` function creates a read-only signal
 *   that is subscribed to a GPUI-TS model, bridging the two systems.
 * - **Automatic Cleanup**: The bridge automatically handles subscriptions and
 *   unsubscriptions, preventing memory leaks.
 * - **Exceptional Performance**: Leverages the optimized, non-recursive,
 *   doubly-linked-list-based algorithm from `alien-signals`.
 *
 * @credits The core algorithm and API design are derived from the `alien-signals`
 *          project by @johnsoncodehk and the open-source community.
 */

import type { ModelAPI } from './index';

// --- TYPE DEFINITIONS ---

export enum ReactiveFlags {
	None = 0,
	Mutable = 1 << 0,
	Watching = 1 << 1,
	RecursedCheck = 1 << 2,
	Recursed = 1 << 3,
	Dirty = 1 << 4,
	Pending = 1 << 5,
}

const enum EffectFlags {
	Queued = 1 << 6,
}

export interface ReactiveNode {
	deps?: Link;
	depsTail?: Link;
	subs?: Link;
	subsTail?: Link;
	flags: ReactiveFlags;
}

export interface Link {
	version: number;
	dep: ReactiveNode;
	sub: ReactiveNode;
	prevSub?: Link;
	nextSub?: Link;
	prevDep?: Link;
	nextDep?: Link;
}

interface Stack<T> {
	value: T;
	prev?: Stack<T>;
}

interface EffectScope extends ReactiveNode {}
interface Effect extends ReactiveNode { fn(): void; }
interface Computed<T = any> extends ReactiveNode { value: T | undefined; getter: (previousValue?: T) => T; }
interface Signal<T = any> extends ReactiveNode { previousValue: T; value: T; }
interface ModelSignal<T> extends Signal<T> { unsubscribe?: () => void; }

/** A reactive subject that can be used as a source for resources. */
export interface Subject<T> {
  (): T;
  set(value: T): void;
  subscribe(listener: (value: T) => void): () => void;
  on: any;
  derive: any;
  __isSubject: true;
}

// --- CORE REACTIVE SYSTEM ---

const queuedEffects: (Effect | EffectScope | undefined)[] = [];
const {
	link,
	unlink,
	propagate,
	checkDirty,
	endTracking,
	startTracking,
	shallowPropagate,
} = createReactiveSystem({
	update(signal: Signal | Computed): boolean {
		if ('getter' in signal) {
			return updateComputed(signal);
		} else {
			return updateSignal(signal, signal.value);
		}
	},
	notify: function notify(e: Effect | EffectScope) {
		const flags = e.flags;
		if (!(flags & EffectFlags.Queued)) {
			e.flags = flags | EffectFlags.Queued;
			const subs = e.subs;
			if (subs !== undefined) {
				notify(subs.sub as Effect | EffectScope);
			} else {
				queuedEffects[queuedEffectsLength++] = e;
			}
		}
	},
	unwatched(node: Signal | Computed | Effect | EffectScope) {
        if ((node as ModelSignal<any>).unsubscribe) {
            (node as ModelSignal<any>).unsubscribe!();
            (node as ModelSignal<any>).unsubscribe = undefined;
        }
		if ('getter' in node) {
			let toRemove = node.deps;
			if (toRemove !== undefined) {
				node.flags = (ReactiveFlags.Mutable | ReactiveFlags.Dirty) as ReactiveFlags;
				do {
					toRemove = unlink(toRemove, node);
				} while (toRemove !== undefined);
			}
		} else if (!('previousValue' in node)) {
			effectOper.call(node);
		}
	},
});

let batchDepth = 0;
let notifyIndex = 0;
let queuedEffectsLength = 0;
let activeSub: ReactiveNode | undefined;

function createReactiveSystem({
	update,
	notify,
	unwatched,
}: {
	update(sub: ReactiveNode): boolean;
	notify(sub: ReactiveNode): void;
	unwatched(sub: ReactiveNode): void;
}) {
	let globalVersion = 0;

	return { link, unlink, propagate, checkDirty, endTracking, startTracking, shallowPropagate };

	function link(dep: ReactiveNode, sub: ReactiveNode): void {
		const prevDep = sub.depsTail;
		if (prevDep?.dep === dep) return;
		
		const nextDep = prevDep ? prevDep.nextDep : sub.deps;
		if (nextDep?.dep === dep) {
			nextDep.version = globalVersion;
			sub.depsTail = nextDep;
			return;
		}

		const prevSub = dep.subsTail;
		if (prevSub?.version === globalVersion && prevSub.sub === sub) return;

		const newLink = { version: globalVersion, dep, sub, prevDep, nextDep, prevSub, nextSub: undefined };
		sub.depsTail = dep.subsTail = newLink;

		if (nextDep) nextDep.prevDep = newLink;
		if (prevDep) prevDep.nextDep = newLink; else sub.deps = newLink;
		if (prevSub) prevSub.nextSub = newLink; else dep.subs = newLink;
	}

	function unlink(link: Link, sub = link.sub): Link | undefined {
		const { dep, prevDep, nextDep, nextSub, prevSub } = link;
		if (nextDep) nextDep.prevDep = prevDep; else sub.depsTail = prevDep;
		if (prevDep) prevDep.nextDep = nextDep; else sub.deps = nextDep;
		if (nextSub) nextSub.prevSub = prevSub; else dep.subsTail = prevSub;
		if (prevSub) prevSub.nextSub = nextSub;
		else if (!(dep.subs = nextSub)) unwatched(dep);
		return nextDep;
	}

	function propagate(link: Link): void {
		let next = link.nextSub;
		let stack: Stack<Link | undefined> | undefined;

		top: do {
			const sub = link.sub;
			let flags = sub.flags;
			if (!(flags & (ReactiveFlags.RecursedCheck | ReactiveFlags.Recursed | ReactiveFlags.Dirty | ReactiveFlags.Pending))) {
				sub.flags |= ReactiveFlags.Pending;
			} else if (!(flags & (ReactiveFlags.RecursedCheck | ReactiveFlags.Recursed))) {
				flags = ReactiveFlags.None;
			} else if (!(flags & ReactiveFlags.RecursedCheck)) {
				sub.flags = (flags & ~ReactiveFlags.Recursed) | ReactiveFlags.Pending;
			} else if (!(flags & (ReactiveFlags.Dirty | ReactiveFlags.Pending)) && isValidLink(link, sub)) {
				sub.flags = flags | ReactiveFlags.Recursed | ReactiveFlags.Pending;
				flags &= ReactiveFlags.Mutable;
			} else {
				flags = ReactiveFlags.None;
			}

			if (flags & ReactiveFlags.Watching) notify(sub);
			if (flags & ReactiveFlags.Mutable) {
				const subSubs = sub.subs;
				if (subSubs) {
					const nextSub = (link = subSubs).nextSub;
					if (nextSub) {
						stack = { value: next, prev: stack };
						next = nextSub;
					}
					continue;
				}
			}
			if ((link = next!) !== undefined) {
				next = link.nextSub;
				continue;
			}
			while (stack) {
				link = stack.value!;
				stack = stack.prev;
				if (link) {
					next = link.nextSub;
					continue top;
				}
			}
			break;
		} while (true);
	}

	function startTracking(sub: ReactiveNode): void {
		++globalVersion;
		sub.depsTail = undefined;
		sub.flags = (sub.flags & ~(ReactiveFlags.Recursed | ReactiveFlags.Dirty | ReactiveFlags.Pending)) | ReactiveFlags.RecursedCheck;
	}

	function endTracking(sub: ReactiveNode): void {
		let toRemove = sub.depsTail ? sub.depsTail.nextDep : sub.deps;
		while (toRemove) toRemove = unlink(toRemove, sub);
		sub.flags &= ~ReactiveFlags.RecursedCheck;
	}

	function checkDirty(link: Link, sub: ReactiveNode): boolean {
		let stack: Stack<Link> | undefined;
		let checkDepth = 0;
		let dirty = false;

		top: do {
			const dep = link.dep;
			const flags = dep.flags;
			if (sub.flags & ReactiveFlags.Dirty) {
				dirty = true;
			} else if ((flags & (ReactiveFlags.Mutable | ReactiveFlags.Dirty)) === (ReactiveFlags.Mutable | ReactiveFlags.Dirty)) {
				if (update(dep)) {
					const subs = dep.subs!;
					if (subs.nextSub) shallowPropagate(subs);
					dirty = true;
				}
			} else if ((flags & (ReactiveFlags.Mutable | ReactiveFlags.Pending)) === (ReactiveFlags.Mutable | ReactiveFlags.Pending)) {
				if (link.nextSub || link.prevSub) stack = { value: link, prev: stack };
				link = dep.deps!;
				sub = dep;
				++checkDepth;
				continue;
			}

			if (!dirty && (link = link.nextDep!) !== undefined) continue;

			while (checkDepth--) {
				const firstSub = sub.subs!;
				const hasMultipleSubs = firstSub.nextSub !== undefined;
				if (hasMultipleSubs) { link = stack!.value; stack = stack!.prev; } else { link = firstSub; }
				if (dirty) {
					if (update(sub)) {
						if (hasMultipleSubs) shallowPropagate(firstSub);
						sub = link.sub;
						continue;
					}
					dirty = false;
				} else {
					sub.flags &= ~ReactiveFlags.Pending;
				}
				sub = link.sub;
				if ((link = link.nextDep!) !== undefined) continue top;
			}
			return dirty;
		} while (true);
	}

	function shallowPropagate(link: Link): void {
		do {
			const sub = link.sub;
			const flags = sub.flags;
			if ((flags & (ReactiveFlags.Pending | ReactiveFlags.Dirty)) === ReactiveFlags.Pending) {
				sub.flags |= ReactiveFlags.Dirty;
				if (flags & ReactiveFlags.Watching) notify(sub);
			}
		} while ((link = link.nextSub!) !== undefined);
	}

	function isValidLink(checkLink: Link, sub: ReactiveNode): boolean {
		let link = sub.depsTail;
		while (link) {
			if (link === checkLink) return true;
			link = link.prevDep;
		}
		return false;
	}
}

// --- INTEGRATION API ---

/**
 * Creates a read-only signal from a GPUI-TS model.
 *
 * This is the primary bridge from the centralized, explicit GPUI-TS state
 * into the fine-grained, implicit signal-based reactive world. The resulting
 * signal will automatically update whenever the source model changes.
 *
 * When the signal is no longer tracked by any effect or computed, it will
 * automatically unsubscribe from the model to prevent memory leaks.
 *
 * @param model The GPUI-TS model to subscribe to.
 * @param selector An optional function to select a slice of the model's state.
 *                 This is highly recommended for performance, as the signal will
 *                 only update when the selected value changes.
 * @returns A read-only accessor function `() => T`.
 *
 * @example
 * const app = createApp(AppSchema);
 * const nameSignal = fromModel(app.models.user, state => state.name);
 * effect(() => console.log(`User's name is: ${nameSignal()}`));
 */
export function fromModel<T extends object, R>(
    model: ModelAPI<T, any, any>,
    selector: (state: T) => R = (state) => state as unknown as R
): () => R {
    const initialState = selector(model.read() as T);
	const modelSignal: ModelSignal<R> = {
		previousValue: initialState,
		value: initialState,
		subs: undefined,
		subsTail: undefined,
		flags: ReactiveFlags.Mutable,
        unsubscribe: undefined,
	};

    return () => {
        let sub = activeSub;
		while (sub) {
			if (sub.flags & (ReactiveFlags.Mutable | ReactiveFlags.Watching)) {
				link(modelSignal, sub);
                if (!modelSignal.unsubscribe) {
                    modelSignal.unsubscribe = model.onChange((newState) => {
                        const newValue = selector(newState);
                        if (modelSignal.value !== newValue) {
                            modelSignal.value = newValue;
                            modelSignal.flags = ReactiveFlags.Mutable | ReactiveFlags.Dirty;
                            if (modelSignal.subs) {
                                propagate(modelSignal.subs);
                                if (!batchDepth) flush();
                            }
                        }
                    });
                }
				break;
			}
			sub = sub.subs?.sub;
		}
		return modelSignal.value;
    };
}

// --- PUBLIC SURFACE API ---

/**
 * Starts a batching transaction. All signal updates within the batch will
 * be collected and flushed together at the end of the outermost batch.
 * This is useful for performance when making multiple state changes at once.
 */
export function startBatch() {
	++batchDepth;
}

/**
 * Ends a batching transaction. If this is the outermost batch, it will
 * trigger a synchronous flush of all pending effects.
 */
export function endBatch() {
	if (!--batchDepth) {
		flush();
	}
}

/**
 * Creates a reactive signal, the fundamental building block for state.
 * @param initialValue The initial value of the signal.
 * @returns A function that acts as both a getter (when called with no arguments)
 *          and a setter (when called with one argument).
 * @example
 * const count = signal(0);
 * console.log(count()); // logs 0
 * count(5); // sets the value to 5
 */
export function signal<T>(initialValue: T): { (): T; (value: T): void; } {
	type SignalFunction<T> = { (): T; (value: T): void; };
	return signalOper.bind({
		previousValue: initialValue,
		value: initialValue,
		subs: undefined,
		subsTail: undefined,
		flags: ReactiveFlags.Mutable,
	}) as SignalFunction<T>;
}

/**
 * Creates a derived, read-only signal that is cached. It only re-computes
 * when its underlying dependencies change.
 * @param getter The function to compute the derived value. It receives the
 *               previous value as an optional argument.
 * @returns An accessor function for the memoized value.
 * @example
 * const doubleCount = computed(() => count() * 2);
 */
export function computed<T>(getter: (previousValue?: T) => T): () => T {
	return computedOper.bind({
		value: undefined,
		subs: undefined,
		subsTail: undefined,
		deps: undefined,
		depsTail: undefined,
		flags: ReactiveFlags.Mutable | ReactiveFlags.Dirty,
		getter,
	} as Computed) as () => T;
}

/**
 * Creates a computation that runs a side effect in response to signal changes.
 * The effect automatically tracks its dependencies and re-runs when they change.
 * @param fn The effect function to run.
 * @returns A `stop` function to manually dispose of the effect and its dependencies.
 * @example
 * const stop = effect(() => console.log(count()));
 * stop(); // The effect will no longer run
 */
export function effect(fn: () => void): () => void {
	const e: Effect = {
		fn,
		subs: undefined,
		subsTail: undefined,
		deps: undefined,
		depsTail: undefined,
		flags: ReactiveFlags.Watching,
	};
	if (activeSub) link(e, activeSub);
	
	const prev = setCurrentSub(e);
	try {
		e.fn();
	} finally {
		setCurrentSub(prev);
	}
	return effectOper.bind(e);
}

/**
 * Creates a scope that collects all nested effects. Disposing of the scope
 * will dispose of all effects created within it.
 * @param fn The function that contains the nested effects.
 * @returns A `stop` function to dispose of the scope and all its effects.
 */
export function effectScope(fn: () => void): () => void {
	const e: EffectScope = {
		deps: undefined,
		depsTail: undefined,
		subs: undefined,
		subsTail: undefined,
		flags: ReactiveFlags.None,
	};
	if (activeSub) link(e, activeSub);
	
	const prev = setCurrentSub(e);
	try {
		fn();
	} finally {
		setCurrentSub(prev);
	}
	return effectOper.bind(e);
}

/**
 * Creates a reactive subject that can be used as a source for resources.
 * @param initialValue The initial value of the subject.
 * @returns A subject function that can be called to get the current value or called with a value to set it.
 */
export function createSubject<T>(initialValue: T): Subject<T> {
  const signalInstance = signal(initialValue);
  const subject = Object.assign(
    () => signalInstance(),
    { 
      set: (value: T) => signalInstance(value),
      subscribe: (_listener: (value: T) => void) => {
        // Return unsubscribe function
        return () => {};
      },
      on: null,
      derive: null,
      __isSubject: true as const
    }
  ) as Subject<T>;
  return subject;
}

// --- INTERNAL IMPLEMENTATION FUNCTIONS ---

function setCurrentSub(sub: ReactiveNode | undefined) {
	const prevSub = activeSub;
	activeSub = sub;
	return prevSub;
}

function flush(): void {
	while (notifyIndex < queuedEffectsLength) {
		const effect = queuedEffects[notifyIndex]!;
		queuedEffects[notifyIndex++] = undefined;
		run(effect, effect.flags &= ~EffectFlags.Queued);
	}
	notifyIndex = 0;
	queuedEffectsLength = 0;
}

function run(e: Effect | EffectScope, flags: ReactiveFlags): void {
	if (flags & ReactiveFlags.Dirty || (flags & ReactiveFlags.Pending && checkDirty(e.deps!, e))) {
		const prev = setCurrentSub(e);
		startTracking(e);
		try {
			(e as Effect).fn();
		} finally {
			setCurrentSub(prev);
			endTracking(e);
		}
		return;
	} else if (flags & ReactiveFlags.Pending) {
		e.flags = flags & ~ReactiveFlags.Pending;
	}
	let link = e.deps;
	while (link) {
		const dep = link.dep;
		const depFlags = dep.flags;
		if (depFlags & EffectFlags.Queued) {
			run(dep, dep.flags = depFlags & ~EffectFlags.Queued);
		}
		link = link.nextDep;
	}
}

function updateComputed(c: Computed): boolean {
	const prevSub = setCurrentSub(c);
	startTracking(c);
	try {
		const oldValue = c.value;
		return oldValue !== (c.value = c.getter(oldValue));
	} finally {
		setCurrentSub(prevSub);
		endTracking(c);
	}
}

function updateSignal(s: Signal, value: any): boolean {
	s.flags = ReactiveFlags.Mutable;
	return s.previousValue !== (s.previousValue = value);
}

function signalOper<T>(this: Signal<T>, ...value: [T]): T | void {
	if (value.length) {
		if (this.value !== (this.value = value[0])) {
			this.flags = (ReactiveFlags.Mutable | ReactiveFlags.Dirty) as ReactiveFlags;
			const subs = this.subs;
			if (subs) {
				propagate(subs);
				if (!batchDepth) flush();
			}
		}
	} else {
		const value = this.value;
		if (this.flags & ReactiveFlags.Dirty) {
			if (updateSignal(this, value)) {
				const subs = this.subs;
				if (subs) shallowPropagate(subs);
			}
		}
		let sub = activeSub;
		while (sub) {
			if (sub.flags & (ReactiveFlags.Mutable | ReactiveFlags.Watching)) {
				link(this, sub);
				break;
			}
			sub = sub.subs?.sub;
		}
		return value;
	}
}

function computedOper<T>(this: Computed<T>): T {
	const flags = this.flags;
	if (flags & ReactiveFlags.Dirty || (flags & ReactiveFlags.Pending && checkDirty(this.deps!, this))) {
		if (updateComputed(this)) {
			const subs = this.subs;
			if (subs) shallowPropagate(subs);
		}
	} else if (flags & ReactiveFlags.Pending) {
		this.flags = flags & ~ReactiveFlags.Pending;
	}
	if (activeSub) link(this, activeSub);
	return this.value!;
}

function effectOper(this: Effect | EffectScope): void {
	let dep = this.deps;
	while (dep) dep = unlink(dep, this);
	
	const sub = this.subs;
	if (sub) unlink(sub);

	this.flags = ReactiveFlags.None;
}