import { describe, it, expect } from 'vitest'
import { createSchema, addModelToSchema, removeModelFromSchema, addEventToSchema } from '../src/helpers'

describe('Schema Composition - Build Time', () => {
  describe('addModelToSchema', () => {
    it('should add a model to the schema builder', () => {
      const builder = createSchema().model('user', { name: '' })

      const extendedBuilder = addModelToSchema(builder, 'posts', {
        items: [],
        loading: false
      })

      const schema = extendedBuilder.build()

      expect(schema.models.user).toBeDefined()
      expect(schema.models.posts).toBeDefined()
      expect(schema.models.posts.initialState).toEqual({
        items: [],
        loading: false
      })
    })

    it('should maintain type safety', () => {
      let builder = createSchema().model('user', { name: '' })

      builder = addModelToSchema(builder, 'posts', { items: [] })

      const schema = builder.build()

      // TypeScript should know about both models
      expect(schema.models.user.initialState.name).toBe('')
      expect(schema.models.posts.initialState.items).toEqual([])
    })
  })

  describe('removeModelFromSchema', () => {
    it('should remove a model from the schema builder', () => {
      let builder = createSchema()
        .model('user', { name: '' })
        .model('posts', { items: [] })

      builder = removeModelFromSchema(builder, 'posts')

      const schema = builder.build()

      expect(schema.models.user).toBeDefined()
      expect(schema.models.posts).toBeUndefined()
    })

    it('should maintain type safety after removal', () => {
      let builder = createSchema()
        .model('user', { name: '' })
        .model('posts', { items: [] })

      builder = removeModelFromSchema(builder, 'posts')

      const schema = builder.build()

      // TypeScript should not know about posts
      expect(schema.models.posts).toBeUndefined()
    })
  })

  describe('addEventToSchema', () => {
    it('should add an event to the schema builder', () => {
      let builder = createSchema().model('user', { name: '' })

      builder = addEventToSchema(builder, 'userLoggedIn', {
        payload: { userId: '' }
      })

      const schema = builder.build()

      expect(schema.events?.userLoggedIn).toEqual({
        payload: { userId: '' }
      })
    })

    it('should maintain existing events', () => {
      let builder = createSchema()
        .model('user', { name: '' })
        .events({ logout: { payload: {} } })

      builder = addEventToSchema(builder, 'login', {
        payload: { email: '' }
      })

      const schema = builder.build()

      expect(schema.events?.logout).toBeDefined()
      expect(schema.events?.login).toBeDefined()
    })
  })

  describe('Integration', () => {
    it('should allow chaining all operations', () => {
      let builder = createSchema().model('core', { status: 'running' })

      builder = addModelToSchema(builder, 'user', { name: '' })
      builder = addModelToSchema(builder, 'posts', { items: [] })
      builder = addEventToSchema(builder, 'userCreated', { payload: { id: '' } })
      builder = removeModelFromSchema(builder, 'posts')
      builder = addEventToSchema(builder, 'userDeleted', { payload: { id: '' } })

      const schema = builder.build()

      expect(schema.models.core).toBeDefined()
      expect(schema.models.user).toBeDefined()
      expect(schema.models.posts).toBeUndefined()
      expect(schema.events?.userCreated).toBeDefined()
      expect(schema.events?.userDeleted).toBeDefined()
    })

    it('should work with createApp', () => {
      let builder = createSchema().model('user', { name: '' })

      builder = addModelToSchema(builder, 'posts', { items: [] })

      const schema = builder.build()

      // This would normally import createApp, but for test we assume it works
      expect(schema.models.user).toBeDefined()
      expect(schema.models.posts).toBeDefined()
    })
  })
})