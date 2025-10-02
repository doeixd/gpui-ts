import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createApp, addModel, removeModel, addEvent } from '../src/index'
import { createSchema } from '../src/helpers'

describe('Dynamic Schema Management - Runtime', () => {
  let app: any

  beforeEach(() => {
    const schema = createSchema()
      .model('user', { name: '', loggedIn: false })
      .build()

    app = createApp(schema)
  })

  describe('addModel', () => {
    it('should add a new model to the app', () => {
      const postsModel = {
        initialState: {
          items: [] as Array<{ id: number; title: string }>,
          loading: false
        }
      }

      const extendedApp = addModel(app, 'posts', postsModel)

      expect(extendedApp.models.posts).toBeDefined()
      expect(extendedApp.models.posts.read()).toEqual({
        items: [],
        loading: false
      })
      expect(extendedApp.models.user).toBeDefined() // Original model still exists
    })

    it('should throw error when adding existing model', () => {
      const userModel = {
        initialState: { name: 'test', loggedIn: true }
      }

      expect(() => addModel(app, 'user', userModel)).toThrow(
        '[GPUI-TS] Model with name "user" already exists.'
      )
    })

    it('should maintain type safety', () => {
      const extendedApp = addModel(app, 'posts', {
        initialState: { items: [], loading: false }
      })

      // TypeScript should know about the new model
      extendedApp.models.posts.update(state => {
        state.loading = true
      })

      expect(extendedApp.models.posts.read().loading).toBe(true)
    })

    it('should share the same registry', () => {
      const extendedApp = addModel(app, 'posts', {
        initialState: { items: [] }
      })

      // Both should use the same registry
      expect(extendedApp._registry).toBe(app._registry)
    })
  })

  describe('removeModel', () => {
    it('should remove a model from the app', () => {
      const extendedApp = addModel(app, 'posts', {
        initialState: { items: [] }
      })

      const narrowedApp = removeModel(extendedApp, 'posts')

      expect(narrowedApp.models.posts).toBeUndefined()
      expect(narrowedApp.models.user).toBeDefined()
    })

    it('should clean up resources when removing model', () => {
      const extendedApp = addModel(app, 'posts', {
        initialState: { items: [] }
      })

      // Add some effects to test cleanup
      let effectCalled = false
      extendedApp.models.posts.update((state, ctx) => {
        ctx.effect(() => {
          effectCalled = true
          return () => { effectCalled = false }
        })
      })

      const narrowedApp = removeModel(extendedApp, 'posts')

      // Effect should be cleaned up
      expect(effectCalled).toBe(false)
    })

    it('should warn when removing non-existent model', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = removeModel(app, 'nonexistent' as any)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[GPUI-TS] Model with name "nonexistent" does not exist and cannot be removed.'
      )
      expect(result).toBe(app)

      consoleWarnSpy.mockRestore()
    })

    it('should maintain type safety after removal', () => {
      const extendedApp = addModel(app, 'posts', {
        initialState: { items: [] }
      })

      const narrowedApp = removeModel(extendedApp, 'posts')

      // TypeScript should not know about posts anymore
      expect(narrowedApp.models.posts).toBeUndefined()
    })
  })

  describe('addEvent', () => {
    it('should add a new event to the schema', () => {
      const extendedApp = addEvent(app, 'userLoggedIn', {
        payload: { userId: '' }
      })

      expect(extendedApp._schema.events?.userLoggedIn).toEqual({
        payload: { userId: '' }
      })
    })

    it('should throw error when adding existing event', () => {
      const appWithEvents = createApp(createSchema()
        .events({ login: { payload: { email: '' } } })
        .model('user', { name: '' })
        .build()
      )

      expect(() => addEvent(appWithEvents, 'login', {
        payload: { token: '' }
      })).toThrow('[GPUI-TS] Event with name "login" already exists.')
    })

    it('should maintain existing events', () => {
      const appWithEvents = createApp(createSchema()
        .events({ logout: { payload: {} } })
        .model('user', { name: '' })
        .build()
      )

      const extendedApp = addEvent(appWithEvents, 'login', {
        payload: { email: '' }
      })

      expect(extendedApp._schema.events?.logout).toBeDefined()
      expect(extendedApp._schema.events?.login).toBeDefined()
    })
  })

  describe('Integration', () => {
    it('should allow chaining addModel and removeModel', () => {
      let currentApp = app

      currentApp = addModel(currentApp, 'posts', {
        initialState: { items: [] }
      })

      expect(currentApp.models.posts).toBeDefined()

      currentApp = addModel(currentApp, 'comments', {
        initialState: { items: [] }
      })

      expect(currentApp.models.comments).toBeDefined()

      currentApp = removeModel(currentApp, 'posts')

      expect(currentApp.models.posts).toBeUndefined()
      expect(currentApp.models.comments).toBeDefined()
      expect(currentApp.models.user).toBeDefined()
    })

    it('should work with addEvent and addModel together', () => {
      let currentApp = app

      currentApp = addModel(currentApp, 'posts', {
        initialState: { items: [] }
      })

      currentApp = addEvent(currentApp, 'postCreated', {
        payload: { title: '' }
      })

      expect(currentApp.models.posts).toBeDefined()
      expect(currentApp._schema.events?.postCreated).toBeDefined()
    })
  })
})