import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp, createSubject } from '../src/index'
import { createAppWithContext } from '../src/ergonomic'
import { createResource } from '../src/resource'
import { createInfiniteResource } from '../src/infinite-resource'

describe('Resource System', () => {
  describe('createResource', () => {
    beforeEach(() => {
      // Clean up any existing app context before each test
      vi.clearAllMocks()
    })

    it('should create a resource with simple fetcher', async () => {
      const app = createAppWithContext({
        models: {
          test: { initialState: { value: 'test' } }
        }
      })

      const mockFetcher = vi.fn().mockResolvedValue('fetched data')
      
      const [resource, actions] = createResource(mockFetcher, { 
        name: 'testResource' 
      })

      // Should start in loading state (since no initial value provided)
      expect(resource.read().loading).toBe(true)
      expect(resource.read().data).toBe(null)
      expect(resource.read().error).toBe(null)

      // Wait a bit for async operation to complete
      await new Promise(resolve => setTimeout(resolve, 10))

      // After fetch completes, should have data
      expect(resource.read().loading).toBe(false)
      expect(resource.read().data).toBe('fetched data')
      expect(resource.read().error).toBe(null)
      expect(mockFetcher).toHaveBeenCalled()
    })

    it('should create a resource with reactive source', async () => {
      const app = createAppWithContext({
        models: {
          counter: { initialState: { count: 1 } }
        }
      })

      const mockFetcher = vi.fn().mockImplementation((sourceValue) => {
        return Promise.resolve(`data for count ${sourceValue.count}`)
      })

      const [resource, actions] = createResource(
        app.models.counter,
        mockFetcher,
        { name: 'counterResource' }
      )

      // Wait for initial fetch
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(resource.read().data).toBe('data for count 1')
      
      // Update the source model
      app.models.counter.update((state, ctx) => {
        state.count = 2
        ctx.notify()
      })

      // Wait for refetch
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(resource.read().data).toBe('data for count 2')
      expect(mockFetcher).toHaveBeenCalledTimes(2)
    })

    it('should support manual refetch', async () => {
      const app = createAppWithContext({
        models: {
          test: { initialState: { value: 'test' } }
        }
      })

      let callCount = 0
      const mockFetcher = vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve(`data ${callCount}`)
      })
      
      const [resource, actions] = createResource(mockFetcher, { 
        name: 'testResource' 
      })

      // Wait for initial fetch
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(resource.read().data).toBe('data 1')

      // Manual refetch
      await actions.refetch()
      expect(resource.read().data).toBe('data 2')
      expect(mockFetcher).toHaveBeenCalledTimes(2)
    })

    it('should support mutate action', () => {
      const app = createAppWithContext({
        models: {
          test: { initialState: { value: 'test' } }
        }
      })

      const mockFetcher = vi.fn().mockResolvedValue('fetched data')
      
      const [resource, actions] = createResource(mockFetcher, { 
        name: 'testResource' 
      })

      // Mutate the data directly
      actions.mutate('manually set data')

      expect(resource.read().data).toBe('manually set data')
      expect(resource.read().loading).toBe(false)
      expect(resource.read().error).toBe(null)
    })

    it('should handle fetch errors', async () => {
      const app = createAppWithContext({
        models: {
          test: { initialState: { value: 'test' } }
        }
      })

      const mockError = new Error('Fetch failed')
      const mockFetcher = vi.fn().mockRejectedValue(mockError)
      
      const [resource, actions] = createResource(mockFetcher, { 
        name: 'testResource' 
      })

      // Wait for fetch to complete with error
      await new Promise(resolve => setTimeout(resolve, 10))

      expect(resource.read().loading).toBe(false)
      expect(resource.read().data).toBe(null)
      expect(resource.read().error).toEqual(mockError)
    })
  })

  describe('createInfiniteResource', () => {
     it('should create an infinite resource', async () => {
       const app = createAppWithContext({
         models: {
           test: { initialState: { value: 'test' } }
         }
       })

       const mockFetcher = vi.fn().mockImplementation((pageKey) => {
         return Promise.resolve([`item ${pageKey}1`, `item ${pageKey}2`])
       })

       const [infiniteResource, actions] = createInfiniteResource(mockFetcher, {
         name: 'testInfiniteResource',
         initialPageKey: 1,
         getNextPageKey: (prevKey, _data) => prevKey < 3 ? prevKey + 1 : null
       })

        // Wait for initial page to load
        await new Promise(resolve => setTimeout(resolve, 10))

        const state = infiniteResource.read()
        expect(state.pages).toHaveLength(1)
        expect(state.data).toEqual(['item 11', 'item 12'])
        expect(state.hasReachedEnd).toBe(false)
     })

    it('should fetch next page', async () => {
      const app = createAppWithContext({
        models: {
          test: { initialState: { value: 'test' } }
        }
      })

      const mockFetcher = vi.fn().mockImplementation((pageKey) => {
        return Promise.resolve([`item ${pageKey}1`, `item ${pageKey}2`])
      })

      const [infiniteResource, actions] = createInfiniteResource(mockFetcher, {
        name: 'testInfiniteResource',
        initialPageKey: 1,
        getNextPageKey: (prevKey, _data) => prevKey < 2 ? prevKey + 1 : null
      })

      // Wait for initial page
      await new Promise(resolve => setTimeout(resolve, 10))

      // Fetch next page
      actions.fetchNextPage()
      await new Promise(resolve => setTimeout(resolve, 10))

      const state = infiniteResource.read()
      expect(state.pages).toHaveLength(2)
      expect(state.data).toEqual(['item 11', 'item 12', 'item 21', 'item 22'])
      expect(state.hasReachedEnd).toBe(true) // Should reach end after page 2
    })
  })
})
