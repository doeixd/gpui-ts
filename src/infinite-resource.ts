// src/infinite-resource.ts

import { directive, Directive, PartType } from 'lit-html/directive.js';
import { createModel, ModelAPI, createSubject } from './index';
import { useApp } from './ergonomic';
import {
  createResource,
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
    (key, _info) => {
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

      infiniteModel.update((state, ctx) => {
        // Add the new page's data to our list of pages.
        state.pages.push(pageState.data!);
        // Re-create the flattened data array.
        state.data = state.pages.flat(1) as any;
        ctx.notify();
      });

      if (nextPageKey === null) {
        // The fetcher indicated this was the last page.
        infiniteModel.update((state, ctx) => { 
          state.hasReachedEnd = true; 
          ctx.notify();
        });
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
      infiniteModel.update((state, ctx) => { 
        state.hasReachedEnd = true; 
        ctx.notify();
      });
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
