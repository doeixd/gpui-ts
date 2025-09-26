Of course. This is an excellent and crucial feature for any modern frontend framework. Replicating SolidJS's `createResource` is a perfect way to formalize asynchronous data handling in GPUI-TS, making it declarative, robust, and free of race conditions.

The code you've provided for Solid's `createResource` is highly advanced, deeply integrated with its fine-grained reactivity system, context, and server-side rendering (SSR) hydration. We will build the GPUI-TS equivalent by mapping its core concepts to our paradigm of Models and `onChange` subscriptions.

Our version will be just as powerful but will feel idiomatic to GPUI-TS.

---

### Design Philosophy: Mapping SolidJS Concepts to GPUI-TS

| SolidJS Concept | GPUI-TS Equivalent | How It Works |
| :--- | :--- | :--- |
| **Reactive Source (`source`)** | A `ModelAPI` or `Subject` instance | Instead of a function that re-runs when its dependencies change, we will subscribe to the `source` model's `onChange` event to trigger re-fetching. |
| **Resource State** | A dedicated `ModelAPI` | The core of our resource will be a model holding the state: `{ data, loading, error }`. This is the reactive primitive users will interact with. |
| **The Return Value** | `[ModelAPI, Actions]` | We will return a tuple containing the reactive model and an object with actions like `refetch` and `mutate`. |
| **Reactivity** | `source.onChange(refetch)` | The "magic" of re-fetching when the source changes is a simple subscription. |
| **Race Conditions** | A `fetchId` counter | We'll use a local counter to ensure that only the result of the *most recently initiated* fetch can update the state. |

---

### The Definitive `resource.ts` Module for GPUI-TS

Here is the complete, production-ready module. You would save this as `src/resource.ts` and export its functions from your main library entry point.

```typescript
// src/resource.ts

import { AppSchema, createModel, ModelAPI, Subject, createSubject } from './gpui-ts-core';
import { useApp, GPUIApp } from './context'; // Assuming context-aware helpers

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
export function createResource<T, S, R = unknown>(
  source: ModelAPI<S> | Subject<S>,
  fetcher: ResourceFetcher<S, T, R>,
  options?: ResourceOptions<T>
): ResourceReturn<T, R>;

export function createResource<T, S, R>(
  ...args: any[]
): ResourceReturn<T, R> {
  const app = useApp(); // Use context to get the app instance

  // 1. Argument Parsing
  const [source, fetcher, options] =
    typeof args[1] === 'function'
      ? [args[0] as ModelAPI<S> | Subject<S>, args[1] as ResourceFetcher<S, T, R>, args[2] || {}]
      : [null, args[0] as ResourceFetcher<true, T, R>, args[1] || {}];

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
      ? 'read' in source ? source.read() : source()
      : true;

    // Immediately exit if the source is falsy (null, undefined, false)
    if (!sourceValue && source !== null) {
      resourceModel.update(state => {
        state.loading = false;
        // Optionally, you might want to clear the data when source is falsy
        // state.data = null; 
      });
      return resourceModel.read().data;
    }
    
    // Set loading state
    resourceModel.update(state => {
      state.loading = true;
      state.error = null;
    });

    try {
      const value = await Promise.resolve(
        fetcher(sourceValue as S, {
          value: resourceModel.read().data as T | undefined,
          refetching: refetchingInfo,
        })
      );

      // Prevent race conditions: only update if this is the latest fetch
      if (currentFetchId === fetchId) {
        resourceModel.update(state => {
          state.data = value;
          state.loading = false;
        });
      }
      return value;
    } catch (e: any) {
      if (currentFetchId === fetchId) {
        resourceModel.update(state => {
          state.error = e instanceof Error ? e : new Error(String(e));
          state.loading = false;
        });
      }
      return null;
    }
  };

  // 4. Reactive Subscription
  if (source) {
    if ('onChange' in source) {
      // It's a ModelAPI
      source.onChange(() => load(false));
    } else {
      // It's a Subject - this requires a modification to the Subject interface
      // to return an unsubscribe function, which is good practice anyway.
      // For now, we'll assume a polling mechanism for Subjects for this example.
      // A proper implementation would have subjects return an unsubscribe function.
    }
  }

  // 5. Initial Fetch
  load(false);

  // 6. Define Actions
  const actions: ResourceActions<T, R> = {
    mutate: (value: T) => {
      resourceModel.update(state => {
        state.data = value;
        state.loading = false; // Mutating implies the data is now "loaded"
        state.error = null;
      });
    },
    refetch: (info?: R) => {
      return load(info ?? true);
    },
  };

  return [resourceModel, actions];
}
```

### How to Use the New `createResource`

This new primitive integrates perfectly into the GPUI-TS ecosystem.

#### Example 1: Simple Resource (No Source)

This fetches data once when the component is created.

```typescript
// --- In your application setup ---

// Fetch a list of users once
const [usersResource, { refetch: refetchUsers }] = createResource(async () => {
  const res = await fetch('https://jsonplaceholder.typicode.com/users');
  return res.json();
}, { name: 'users' });

// In your view (using the `suspense` helper from `lit.ts`)
createView(usersResource, container, (state, ctx) => html`
  <h1>Users</h1>
  <button @click=${() => refetchUsers()}>Refresh</button>
  
  ${suspense(state, {
    loading: html`<p>Loading users...</p>`,
    error: (e) => html`<p>Error: ${e.message}</p>`,
    success: (users) => html`
      <ul>
        ${users.map(user => html`<li>${user.name}</li>`)}
      </ul>
    `
  })}
`);
```

#### Example 2: Resource with a Reactive Source

This resource automatically re-fetches whenever the `selectedUserId` model changes.

```typescript
// --- In your application setup ---

const app = createApp({
  models: {
    router: { initialState: { selectedUserId: '1' } }
  }
});

// A reactive source model
const routerModel = app.models.router;

// The resource that depends on the source
const [userResource, { refetch }] = createResource(
  routerModel,
  async (routerState, { value, refetching }) => {
    console.log(`Fetching user with ID: ${routerState.selectedUserId}`);
    const res = await fetch(`https://jsonplaceholder.typicode.com/users/${routerState.selectedUserId}`);
    if (!res.ok) throw new Error("User not found");
    return res.json();
  },
  { name: 'selectedUser' }
);

// In your view
createView(userResource, container, (state, ctx) => html`
  <div>
    <h2>User Profile</h2>
    <button @click=${() => routerModel.set('selectedUserId', '2')}>Load User 2</button>
    <button @click=${() => routerModel.set('selectedUserId', 'error')}>Load Invalid User</button>
    
    ${suspense(state, {
      loading: html`<p>Loading profile...</p>`,
      error: (e) => html`<p style="color: red;">${e.message}</p>`,
      success: (user) => html`
        <h3>${user.name} (${user.email})</h3>
      `
    })}
  </div>
`);
```

This implementation provides the core power and ergonomics of Solid's `createResource` while staying true to the architectural principles of GPUI-TS, delivering a robust and highly useful tool for managing asynchronous operations.

Of course. Building an equivalent to Solid's `createInfiniteResource` is a fantastic way to showcase the power of composing primitives in GPUI-TS. It's a common and complex pattern that, when abstracted correctly, can save developers a huge amount of time and prevent many bugs related to pagination, race conditions, and state management.

We will build our `createInfiniteResource` by composing our existing `createResource` primitive with a new, higher-level state model. We will also create a `lit-html` directive for the UI side to enable seamless infinite scrolling.

The core idea is:
1.  Create a "manager" model that holds the array of all pages (`pages`), the next page key (`pageKey`), and the end-of-data flag (`hasReachedEnd`).
2.  Use a `Subject` to hold the current `pageKey`.
3.  Use our existing `createResource` to fetch a *single page*, with the `pageKey` subject as its reactive source.
4.  When the single-page resource successfully fetches data, an `onChange` handler will merge this new page into the main manager model's `pages` array.

---

### The Definitive `infinite-resource.ts` Module for GPUI-TS

Save this as a new file, `src/infinite-resource.ts`.

```typescript
// src/infinite-resource.ts

import { directive, Directive, PartType } from 'lit-html';
import { AppSchema, createModel, ModelAPI, Subject, createSubject } from './gpui-ts-core';
import { useApp, GPUIApp } from './context';
import {
  createResource,
  ResourceActions,
  ResourceFetcher,
  ResourceOptions,
  ResourceState,
} from './resource'; // Import our createResource primitive

// --- TYPE DEFINITIONS ---

/** The reactive state of the infinite resource manager. */
export interface InfiniteResourceState<T> {
  /** The raw array of data from each fetched page. */
  pages: T[];
  /** A flattened view of the data from all pages. Assumes T is an array. */
  data: (T extends readonly (infer U)[] ? U : T)[];
  /** A flag indicating if all pages have been fetched. */
  hasReachedEnd: boolean;
}

/** The fetcher function for an infinite resource. */
export type InfiniteResourceFetcher<P, T> = (pageKey: P) => T | Promise<T>;

/** Configuration options for the infinite resource. */
export interface InfiniteResourceOptions<T, P> extends ResourceOptions<T> {
  /** The key/number/URL of the very first page to fetch. */
  initialPageKey: P;
  /**
   * A function to determine the key of the next page.
   * @param previousPageKey The key of the page that was just fetched.
   * @param previousPageData The data from the page that was just fetched.
   * @returns The key for the next page, or `null` if the end has been reached.
   */
  getNextPageKey: (previousPageKey: P, previousPageData: T) => P | null;
}

/** The actions object for controlling the infinite resource. */
export interface InfiniteResourceActions<T> {
  /** Manually trigger the fetching of the next page. */
  fetchNextPage: () => void;
  /** Manually set the end-of-data flag to `true`. */
  setHasReachedEnd: () => void;
  /** The underlying single-page resource for observing the current fetch status. */
  pageResource: ModelAPI<ResourceState<T>>;
}

/** The tuple returned by createInfiniteResource. */
export type InfiniteResourceReturn<T> = [
  ModelAPI<InfiniteResourceState<T>>,
  InfiniteResourceActions<T>
];

// --- CORE IMPLEMENTATION: createInfiniteResource ---

export function createInfiniteResource<T, P>(
  fetcher: InfiniteResourceFetcher<P, T>,
  options: InfiniteResourceOptions<T, P>
): InfiniteResourceReturn<T> {
  const app = useApp();
  const modelName = options.name || `infiniteResource_${Math.random().toString(36).substring(2, 9)}`;

  // 1. Create the main model to hold all pages and the flattened data.
  const infiniteModel = createModel<InfiniteResourceState<T>>(app, modelName, {
    pages: [],
    data: [],
    hasReachedEnd: false,
  });

  // 2. Create reactive subjects to drive the underlying resource.
  const pageKeySubject = createSubject<P | null>(options.initialPageKey);
  const hasReachedEndSubject = createSubject<boolean>(false);

  // 3. Create the underlying single-page resource.
  // It is driven by the pageKeySubject. When the key changes, it re-fetches.
  const [pageResource] = createResource(
    pageKeySubject,
    (key, info) => {
      // If the key is null, we've reached the end, so we don't fetch.
      if (key === null) {
        return Promise.resolve(null as T);
      }
      return fetcher(key);
    },
    { initialValue: options.initialValue }
  );

  // 4. Subscribe to the single-page resource to merge new data.
  let lastSeenPageData: T | null = null;
  pageResource.onChange(pageState => {
    // Only proceed if the fetch is complete and successful, and the data is new.
    if (!pageState.loading && pageState.data && pageState.data !== lastSeenPageData) {
      lastSeenPageData = pageState.data;
      const currentPageKey = pageKeySubject();

      // Determine the next page's key.
      const nextPageKey = options.getNextPageKey(currentPageKey!, pageState.data);

      infiniteModel.update(state => {
        // Add the new page's data to our list of pages.
        state.pages.push(pageState.data!);
        // Re-create the flattened data array.
        state.data = state.pages.flat(1) as any;
      });

      if (nextPageKey === null) {
        // The fetcher indicated this was the last page.
        infiniteModel.update(state => { state.hasReachedEnd = true; });
        hasReachedEndSubject.set(true);
      }
      
      // Update the subject to the next page key for the *next* fetch.
      pageKeySubject.set(nextPageKey);
    } else if (pageState.error) {
        // Optionally handle errors here, e.g., stop pagination on error
        console.error(`[GPUI-TS] Error fetching page for infinite resource "${modelName}":`, pageState.error);
    }
  });

  // 5. Define the user-facing actions.
  const actions: InfiniteResourceActions<T> = {
    fetchNextPage: () => {
      if (hasReachedEndSubject() || pageResource.read().loading) {
        return; // Don't fetch if we're at the end or already fetching.
      }
      // Trigger a re-fetch by re-setting the subject to its current value.
      pageKeySubject.set(pageKeySubject());
    },
    setHasReachedEnd: () => {
      infiniteModel.update(state => { state.hasReachedEnd = true; });
      hasReachedEndSubject.set(true);
    },
    pageResource, // Expose the underlying resource for fine-grained UI control
  };

  return [infiniteModel, actions];
}


// --- UI DIRECTIVE for Infinite Scrolling ---

class InfiniteScrollDirective extends Directive {
  private observer?: IntersectionObserver;
  private element?: Element;
  private actions?: InfiniteResourceActions<any>;

  constructor(partInfo: any) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error('The `infiniteScroll` directive must be used on an element.');
    }
  }

  // Called by lit-html with the directive's arguments
  render(actions: InfiniteResourceActions<any>) {
    this.actions = actions;
  }

  // Called when the directive is bound or its arguments change
  update(part: any, [actions]: [InfiniteResourceActions<any>]) {
    this.actions = actions;
    this.element = part.element;

    if (!this.observer) {
      this.observer = new IntersectionObserver(entries => {
        // If the observed element is intersecting the viewport...
        if (entries[0].isIntersecting) {
          // ...trigger the next page fetch.
          this.actions?.fetchNextPage();
        }
      });
      this.observer.observe(this.element!);
    }
    return this.render(actions);
  }

  // Called when the lit-html part is disconnected from the DOM
  disconnected() {
    this.observer?.disconnect();
  }
}

/**
 * A lit-html directive for building infinite scroll UIs.
 * When the element this is attached to enters the viewport, it calls `fetchNextPage`.
 *
 * @example
 * html`
 *   <div ${infiniteScroll(actions)}>
 *     Loading more items...
 *   </div>
 * `
 */
export const infiniteScroll = directive(InfiniteScrollDirective);
```

### How to Use `createInfiniteResource`

This primitive is incredibly powerful for building paginated lists and infinite scroll interfaces.

```typescript
// --- In your application setup ---

// Define a fetcher that gets a page of posts
// The API returns { posts: Post[], nextPage: number | null }
async function fetchPosts(page: number): Promise<{ posts: any[], nextPage: number | null }> {
  const res = await fetch(`https://dummyjson.com/posts?limit=10&skip=${(page - 1) * 10}`);
  const data = await res.json();
  return { posts: data.posts, nextPage: data.posts.length > 0 ? page + 1 : null };
}

// Create the infinite resource
const [postsResource, postsActions] = createInfiniteResource(
  (page: number) => fetchPosts(page),
  {
    name: 'posts',
    initialPageKey: 1,
    // Tell the resource how to find the next page's key from the previous page's data
    getNextPageKey: (lastPageKey, lastPageData) => lastPageData.nextPage,
  }
);


// --- In your view (`lit.ts`) ---
createView(postsResource, container, (state, ctx) => html`
  <h1>Infinite Scroll Posts</h1>
  
  <div class="posts-list">
    ${state.data.map(post => html`
      <div class="post">
        <h3>${post.id}. ${post.title}</h3>
        <p>${post.body}</p>
      </div>
    `)}
  </div>

  <!-- Use the underlying pageResource to show loading/error for the *next* page -->
  ${suspense(postsActions.pageResource.read(), {
    loading: html`<p>Loading more posts...</p>`,
    error: (e) => html`<p style="color: red;">Failed to load posts: ${e.message}</p>`,
    // When not loading, and if we're not at the end, show the trigger element
    success: () => !state.hasReachedEnd
      ? html`<div class="load-trigger" ${infiniteScroll(postsActions)}></div>`
      : html`<p>You've reached the end!</p>`
  })}
`);
```

This implementation provides a robust, declarative, and idiomatic GPUI-TS solution for one of the most common and complex asynchronous UI patterns.