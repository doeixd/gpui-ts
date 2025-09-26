import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, lens } from '../dist/esm/development/index.js'

describe('Lens System', () => {
  describe('Basic Lens Operations', () => {
    it('should create and use basic lenses', () => {
      const nameLens = lens(
        (user) => user.name,
        (user, name) => ({ ...user, name })
      )

      const user = { name: 'John', age: 30 }

      expect(nameLens.get(user)).toBe('John')

      const updated = nameLens.set(user, 'Jane')
      expect(updated.name).toBe('Jane')
      expect(updated.age).toBe(30)
      expect(user.name).toBe('John') // original unchanged
    })

    it('should support lens updates', () => {
      const countLens = lens(
        (state) => state.count,
        (state, count) => ({ ...state, count })
      )

      const state = { count: 5, name: 'test' }

      const updated = countLens.update(state, (count) => count * 2)
      expect(updated.count).toBe(10)
      expect(updated.name).toBe('test')
    })

    it('should work with nested objects', () => {
      const profileLens = lens(
        (user) => user.profile,
        (user, profile) => ({ ...user, profile })
      )

      const user = {
        id: 1,
        profile: { name: 'John', email: 'john@example.com' }
      }

      expect(profileLens.get(user)).toEqual({ name: 'John', email: 'john@example.com' })

      const updated = profileLens.set(user, { name: 'Jane', email: 'jane@example.com' })
      expect(updated.profile.name).toBe('Jane')
      expect(updated.id).toBe(1)
    })

    it('should work with arrays', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const state = { items: [1, 2, 3], total: 6 }

      expect(itemsLens.get(state)).toEqual([1, 2, 3])

      const updated = itemsLens.set(state, [4, 5, 6])
      expect(updated.items).toEqual([4, 5, 6])
      expect(updated.total).toBe(6)
    })
  })

  describe('Lens Composition', () => {
    it('should compose lenses', () => {
      const userLens = lens(
        (app) => app.user,
        (app, user) => ({ ...app, user })
      )

      const profileLens = lens(
        (user) => user.profile,
        (user, profile) => ({ ...user, profile })
      )

      const nameLens = lens(
        (profile) => profile.name,
        (profile, name) => ({ ...profile, name })
      )

      const composed = userLens.compose(profileLens).compose(nameLens)

      const app = {
        user: {
          id: 1,
          profile: { name: 'John', email: 'john@example.com' }
        },
        settings: { theme: 'dark' }
      }

      expect(composed.get(app)).toBe('John')

      const updated = composed.set(app, 'Jane')
      expect(updated.user.profile.name).toBe('Jane')
      expect(updated.settings.theme).toBe('dark')
    })

    it('should support at() method for property access', () => {
      const userLens = lens(
        (app) => app.user,
        (app, user) => ({ ...app, user })
      )

      const nameLens = userLens.at('profile').at('name')

      const app = {
        user: {
          profile: { name: 'John', age: 30 }
        }
      }

      expect(nameLens.get(app)).toBe('John')

      const updated = nameLens.set(app, 'Jane')
      expect(updated.user.profile.name).toBe('Jane')
    })

    it('should support index() method for array access', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const firstItemLens = itemsLens.index(0)

      const state = { items: ['a', 'b', 'c'] }

      expect(firstItemLens.get(state)).toBe('a')

      const updated = firstItemLens.set(state, 'x')
      expect(updated.items).toEqual(['x', 'b', 'c'])
    })

    it('should support filter() method for array filtering', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const activeItemsLens = itemsLens.filter((item) => item.active)

      const state = {
        items: [
          { id: 1, active: true, name: 'A' },
          { id: 2, active: false, name: 'B' },
          { id: 3, active: true, name: 'C' }
        ]
      }

      expect(activeItemsLens.get(state)).toEqual([
        { id: 1, active: true, name: 'A' },
        { id: 3, active: true, name: 'C' }
      ])

      const updated = activeItemsLens.set(state, [
        { id: 1, active: true, name: 'Updated A' },
        { id: 3, active: true, name: 'Updated C' }
      ])

      expect(updated.items[0].name).toBe('Updated A')
      expect(updated.items[2].name).toBe('Updated C')
    })

    it('should support find() method for finding first element', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const activeItemLens = itemsLens.find((item) => item.active)

      const state = {
        items: [
          { id: 1, active: false, name: 'A' },
          { id: 2, active: true, name: 'B' },
          { id: 3, active: true, name: 'C' }
        ]
      }

      expect(activeItemLens.get(state)).toEqual({ id: 2, active: true, name: 'B' })

      const updated = activeItemLens.set(state, { id: 2, active: true, name: 'Updated B' })
      expect(updated.items[1].name).toBe('Updated B')
    })

    it('should support map() method for transforming arrays', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const namesLens = itemsLens.map((item) => item.name)

      const state = {
        items: [
          { id: 1, name: 'A' },
          { id: 2, name: 'B' }
        ]
      }

      expect(namesLens.get(state)).toEqual(['A', 'B'])

      // Setting back is not supported, should return unchanged
      const updated = namesLens.set(state, ['X', 'Y'])
      expect(updated).toBe(state)
    })

    it('should support some() method for checking condition', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const hasActiveLens = itemsLens.some((item) => item.active)

      const state = {
        items: [
          { id: 1, active: false },
          { id: 2, active: true }
        ]
      }

      expect(hasActiveLens.get(state)).toBe(true)

      // Setting back is not supported
      const updated = hasActiveLens.set(state, false)
      expect(updated).toBe(state)
    })

    it('should support every() method for checking all conditions', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const allActiveLens = itemsLens.every((item) => item.active)

      const state = {
        items: [
          { id: 1, active: true },
          { id: 2, active: true }
        ]
      }

      expect(allActiveLens.get(state)).toBe(true)

      // Setting back is not supported
      const updated = allActiveLens.set(state, false)
      expect(updated).toBe(state)
    })

    it('should support reduce() method for reducing arrays', () => {
      const itemsLens = lens(
        (state) => state.items,
        (state, items) => ({ ...state, items })
      )

      const totalLens = itemsLens.reduce((acc, item) => acc + item.value, 0)

      const state = {
        items: [
          { value: 10 },
          { value: 20 }
        ]
      }

      expect(totalLens.get(state)).toBe(30)

      // Setting back is not supported
      const updated = totalLens.set(state, 50)
      expect(updated).toBe(state)
    })
  })

  describe('Path-based Lens Operations', () => {
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
      app = createApp({
        models: {
          user: {
            initialState: {
              id: 1,
              profile: {
                name: 'John',
                email: 'john@example.com',
                address: {
                  street: '123 Main St',
                  city: 'NYC',
                  coordinates: { lat: 40.7128, lng: -74.0060 }
                }
              },
              settings: {
                theme: 'dark',
                notifications: ['email', 'sms']
              }
            }
          }
        }
      })
    })

    it('should create lenses for specific paths', () => {
      const nameLens = app.models.user.lensAt('profile.name')
      const emailLens = app.models.user.lensAt('profile.email')

      expect(nameLens.get(app.models.user.read())).toBe('John')
      expect(emailLens.get(app.models.user.read())).toBe('john@example.com')
    })

    it('should update through path lenses', () => {
      const nameLens = app.models.user.lensAt('profile.name')

      app.models.user.update((state) => {
        const newState = nameLens.set(state, 'Jane')
        Object.assign(state, newState)
      })

      expect(app.models.user.read().profile.name).toBe('Jane')
    })

    it('should work with nested paths', () => {
      const cityLens = app.models.user.lensAt('profile.address.city')
      const latLens = app.models.user.lensAt('profile.address.coordinates.lat')

      expect(cityLens.get(app.models.user.read())).toBe('NYC')
      expect(latLens.get(app.models.user.read())).toBe(40.7128)

      app.models.user.updateAt('profile.address.city', (city) => 'LA')
      app.models.user.updateAt('profile.address.coordinates.lat', (lat) => 34.0522)

      const state = app.models.user.read()
      expect(state.profile.address.city).toBe('LA')
      expect(state.profile.address.coordinates.lat).toBe(34.0522)
    })

    it('should work with array paths', () => {
      const firstNotificationLens = app.models.user.lensAt('settings.notifications.0')

      expect(firstNotificationLens.get(app.models.user.read())).toBe('email')

      app.models.user.updateAt('settings.notifications.0', (notif) => 'push')

      expect(app.models.user.read().settings.notifications[0]).toBe('push')
    })
  })

  describe('Focused Model Operations', () => {
    let app: ReturnType<typeof createApp>

    beforeEach(() => {
      app = createApp({
        models: {
          user: {
            initialState: {
              profile: { name: 'John', age: 30 },
              settings: { theme: 'dark' }
            }
          }
        }
      })
    })

    it('should create focused models', () => {
      const profileLens = lens(
        (state) => state.profile,
        (state, profile) => ({ ...state, profile })
      )

      const focused = app.models.user.focus(profileLens)

      expect(focused.read()).toEqual({ name: 'John', age: 30 })
    })

    it('should update through focused models', () => {
      const profileLens = lens(
        (state) => state.profile,
        (state, profile) => ({ ...state, profile })
      )

      const focused = app.models.user.focus(profileLens)

      focused.update((profile) => {
        profile.name = 'Jane'
        profile.age = 31
      })

      const state = app.models.user.read()
      expect(state.profile.name).toBe('Jane')
      expect(state.profile.age).toBe(31)
      expect(state.settings.theme).toBe('dark') // unchanged
    })

    it('should support nested focusing', () => {
      const profileLens = lens(
        (state) => state.profile,
        (state, profile) => ({ ...state, profile })
      )

      const focusedProfile = app.models.user.focus(profileLens)

      const nameLens = lens(
        (profile) => profile.name,
        (profile, name) => ({ ...profile, name })
      )

      const focusedName = focusedProfile.focus(nameLens)

      expect(focusedName.read()).toBe('John')

      focusedName.update((name) => 'Jane')

      expect(app.models.user.read().profile.name).toBe('Jane')
    })

    it('should return to root model', () => {
      const profileLens = lens(
        (state) => state.profile,
        (state, profile) => ({ ...state, profile })
      )

      const focused = app.models.user.focus(profileLens)
      const root = focused.root()

      expect(root).toBe(app.models.user)
    })

    it('should support change listeners on focused models', () => {
      const profileLens = lens(
        (state) => state.profile,
        (state, profile) => ({ ...state, profile })
      )

      const focused = app.models.user.focus(profileLens)

      let changeCount = 0
      let lastCurrent: any = null
      let lastPrevious: any = null

      focused.onChange((current, previous) => {
        changeCount++
        lastCurrent = current
        lastPrevious = previous
      })

        focused.update((profile) => {
          profile.name = 'Jane'
        })

      expect(changeCount).toBe(1)
      expect(lastCurrent.name).toBe('Jane')
      expect(lastPrevious.name).toBe('John')
    })
  })

  describe('Complex Lens Scenarios', () => {
    it('should handle deeply nested structures', () => {
      const app = createApp({
        models: {
          data: {
            initialState: {
              users: [
                {
                  id: 1,
                  profile: {
                    name: 'John',
                    contacts: [
                      { type: 'email', value: 'john@example.com' },
                      { type: 'phone', value: '123-456-7890' }
                    ]
                  }
                },
                {
                  id: 2,
                  profile: {
                    name: 'Jane',
                    contacts: [
                      { type: 'email', value: 'jane@example.com' }
                    ]
                  }
                }
              ]
            }
          }
        }
      })

      // Focus on first user's email
      const firstUserLens = lens(
        (state) => state.users[0],
        (state, user) => ({ ...state, users: [user, ...state.users.slice(1)] })
      )

      const emailLens = firstUserLens
        .at('profile')
        .at('contacts')
        .index(0)
        .at('value')

      expect(emailLens.get(app.models.data.read())).toBe('john@example.com')

      app.models.data.update((state) => {
        const newState = emailLens.set(state, 'john.doe@example.com')
        Object.assign(state, newState)
      })

      expect(app.models.data.read().users[0].profile.contacts[0].value).toBe('john.doe@example.com')
    })

    it('should compose complex lens operations', () => {
      const state = {
        companies: [
          {
            id: 1,
            employees: [
              { id: 101, profile: { name: 'Alice', salary: 50000 } },
              { id: 102, profile: { name: 'Bob', salary: 60000 } }
            ]
          },
          {
            id: 2,
            employees: [
              { id: 201, profile: { name: 'Charlie', salary: 55000 } }
            ]
          }
        ]
      }

      // Lens to get all employees across all companies
      const allEmployeesLens = lens(
        (s) => s.companies.flatMap(c => c.employees),
        (s, employees) => {
          // This is a simplified implementation
          // In practice, you'd need more sophisticated logic
          return s
        }
      )

      // Filter for high earners
      const highEarnersLens = allEmployeesLens.filter((emp) => emp.profile.salary > 55000)

      const highEarners = highEarnersLens.get(state)
      expect(highEarners).toHaveLength(1)
      expect(highEarners[0].profile.name).toBe('Bob')
    })

    it('should handle lens operations with immutability', () => {
      const original = { counter: { value: 5 }, metadata: { created: 'today' } }

      const counterLens = lens(
        (state) => state.counter,
        (state, counter) => ({ ...state, counter })
      )

      const valueLens = lens(
        (counter) => counter.value,
        (counter, value) => ({ ...counter, value })
      )

      const composed = counterLens.compose(valueLens)

      const updated = composed.set(original, 10)

      expect(updated.counter.value).toBe(10)
      expect(updated.metadata.created).toBe('today')
      expect(original.counter.value).toBe(5) // original unchanged
    })
  })

  describe('Lens Error Handling', () => {
    it('should handle undefined paths gracefully', () => {
      const user = { name: 'John' }

      const missingLens = lens(
        (u) => (u as any).missing?.deep?.property,
        (u, value) => u // No-op setter
      )

      expect(missingLens.get(user)).toBeUndefined()
    })

    it('should handle array bounds safely', () => {
      const state = { items: ['a', 'b'] }

      const outOfBoundsLens = lens(
        (s) => s.items[5], // Out of bounds
        (s, value) => s // No-op
      )

      expect(outOfBoundsLens.get(state)).toBeUndefined()
    })
  })

  describe('Performance Considerations', () => {
    it('should avoid unnecessary object creation', () => {
      const state = { deeply: { nested: { value: 42 } } }

      const lens1 = lens(
        (s) => s.deeply,
        (s, d) => ({ ...s, deeply: d })
      )

      const lens2 = lens(
        (d) => d.nested,
        (d, n) => ({ ...d, nested: n })
      )

      const lens3 = lens(
        (n) => n.value,
        (n, v) => ({ ...n, value: v })
      )

      const composed = lens1.compose(lens2).compose(lens3)

      // Each get should only access the necessary path
      expect(composed.get(state)).toBe(42)
    })

    it('should support efficient updates', () => {
      const largeState = {
        metadata: { version: 1, timestamp: Date.now() },
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item${i}` }))
      }

      const firstItemLens = lens(
        (s) => s.data[0],
        (s, item) => ({ ...s, data: [item, ...s.data.slice(1)] })
      )

      const valueLens = lens(
        (item) => item.value,
        (item, value) => ({ ...item, value })
      )

      const composed = firstItemLens.compose(valueLens)

      const updated = composed.set(largeState, 'updated-item0')

      expect(updated.data[0].value).toBe('updated-item0')
      expect(updated.metadata).toBe(largeState.metadata) // Same reference
      expect(updated.data.length).toBe(1000)
    })
  })
})