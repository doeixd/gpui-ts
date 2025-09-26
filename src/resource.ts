// src/resource.ts

import { createModel, ModelAPI, Subject } from './index';
import { useApp } from './ergonomic';

// --- TYPE DEFINITIONS ---

/** The reactive state of a resource. */
export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

/**
 * The info object passed to the fetcher function, providing context about the fetch.
 * @template T The type of the resource's data.
 * @template R The type of the value passed to `refetch`.
 */
export interface ResourceFetcherInfo<T, R> {
  /** The most recent value of the resource's data. */
  value: T | undefined;
  /** The value passed to `refetch()`, or `true` if called with no arguments. */
  refetching: R | boolean;
}

/**
 * The function responsible for fetching the resource's data.
 * @template S The type of the source's value.
 * @template T The type of the resource's data.
 * @template R The type of the value passed to `refetch`.
 */
export type ResourceFetcher<S, T, R> = (
  sourceValue: S,
  info: ResourceFetcherInfo<T, R>
) => T | Promise<T>;

/** Options for configuring a resource. */
export interface ResourceOptions<T> {
  /** An initial value for the resource's data, making it available immediately. */
  initialValue?: T;
  /** A unique name for debugging purposes. */
  name?: string;
}

/** The actions object returned by `createResource`. */
export interface ResourceActions<T, R> {
  /** Manually overwrite the resource's data without calling the fetcher. */
  mutate: (value: T) => void;
  /** Re-run the fetcher to refresh the resource's data. */
  refetch: (info?: R) => Promise<T | null>;
}

/** The tuple returned by `createResource`. */
export type ResourceReturn<T, R> = [ModelAPI<ResourceState<T>>, ResourceActions<T, R>];

// --- CORE IMPLEMENTATION: createResource ---

// Overload for calling with no source
export function createResource<T, R = unknown>(
  fetcher: ResourceFetcher<true, T, R>,
  options?: ResourceOptions<T>
): ResourceReturn<T, R>;

// Overload for calling with a source
export function createResource<T, S extends object, R = unknown>(
  source: ModelAPI<S> | Subject<S>,
  fetcher: ResourceFetcher<S, T, R>,
  options?: ResourceOptions<T>
): ResourceReturn<T, R>;

export function createResource<T, R = unknown>(
  sourceOrFetcher: ModelAPI<any> | Subject<any> | ResourceFetcher<true, T, R>,
  fetcherOrOptions?: ResourceFetcher<any, T, R> | ResourceOptions<T>,
  maybeOptions?: ResourceOptions<T>
): ResourceReturn<T, R> {
  const app = useApp(); // Use context to get the app instance

  // 1. Argument Parsing
  const [source, fetcher, options] =
    typeof fetcherOrOptions === 'function'
      ? [sourceOrFetcher as ModelAPI<any> | Subject<any>, fetcherOrOptions as ResourceFetcher<any, T, R>, maybeOptions || {}]
      : [null, sourceOrFetcher as ResourceFetcher<true, T, R>, (fetcherOrOptions as ResourceOptions<T>) || {}];

  const modelName = options.name || `resource_${Math.random().toString(36).substring(2, 9)}`;

  // 2. State Initialization
  const initialData = options.initialValue ?? null;
  const resourceModel = createModel<ResourceState<T>>(app, modelName, {
    data: initialData,
    loading: initialData === null, // Don't be in loading state if initial value is provided
    error: null,
  });

  let fetchId = 0;

  // 3. The Core `load` Function
  const load = async (refetchingInfo: R | boolean = true): Promise<T | null> => {
    const currentFetchId = ++fetchId;

    // Determine the current source value
    const sourceValue = source
      ? ('read' in source ? source.read() : source()) as any
      : true;

    // Immediately exit if the source is falsy (null, undefined, false)
    if (!sourceValue && source !== null) {
      resourceModel.update(state => {
        state.loading = false;
        // Optionally, you might want to clear the data when source is falsy
        // state.data = null; 
      });
      return resourceModel.read().data as T | null;
    }
    
    // Set loading state
    resourceModel.update((state, ctx) => {
      state.loading = true;
      state.error = null;
      ctx.notify();
    });

    try {
      const value = await Promise.resolve(
        fetcher(sourceValue as any, {
          value: resourceModel.read().data as T | undefined,
          refetching: refetchingInfo,
        })
      );

      // Prevent race conditions: only update if this is the latest fetch
      if (currentFetchId === fetchId) {
        resourceModel.update((state, ctx) => {
          state.data = value;
          state.loading = false;
          ctx.notify();
        });
      }
      return value;
    } catch (e: any) {
      if (currentFetchId === fetchId) {
        resourceModel.update((state, ctx) => {
          state.error = e instanceof Error ? e : new Error(String(e));
          state.loading = false;
          ctx.notify();
        });
      }
      return null;
    }
  };

  // 4. Reactive Subscription
  if (source) {
    if ('onChange' in source) {
      // It's a ModelAPI
      (source as ModelAPI<any>).onChange(() => load(false));
    } else if ('subscribe' in source) {
      // It's a Subject
      (source as Subject<any>).subscribe(() => load(false));
    }
  }

  // 5. Initial Fetch
  load(false);

  // 6. Define Actions
  const actions: ResourceActions<T, R> = {
    mutate: (value: T) => {
      resourceModel.update((state, ctx) => {
        state.data = value;
        state.loading = false; // Mutating implies the data is now "loaded"
        state.error = null;
        ctx.notify();
      });
    },
    refetch: (info?: R) => {
      return load(info ?? true);
    },
  };

  return [resourceModel, actions];
}
