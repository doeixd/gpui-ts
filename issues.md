# GPUI-TS Issues & Fixes Guide

## Overview

The comprehensive test suite has revealed several critical issues in the GPUI-TS library implementation. This document catalogs all identified problems, provides root cause analysis, and offers detailed fix recommendations.

**Test Results Summary:**
- Total Tests: 129
- Passing: 71 (55%)
- Failing: 58 (45%)

## Issue Categories

### 🔴 Critical Issues (Must Fix)

#### 1. Subscription System Broken
**Affected Tests:** 12+ tests across multiple files
**Root Cause:** The `onChange` subscription mechanism is not working properly.

**Failing Tests:**
- `test/index.test.ts` - "should support subscriptions"
- `test/index.test.ts` - "should support cross-model subscriptions"
- `test/edge-cases.test.ts` - "should handle memory leaks from unsubscribed listeners"
- `test/lens-system.test.ts` - "should support change listeners on focused models"

**Symptoms:**
```typescript
app.models.counter.onChange((current) => {
  notifiedValue = current.count  // This never gets called
})
app.models.counter.update((state) => {
  state.count = 10  // No notification sent
})
```

**Fix Location:** `src/index.ts` - `ModelRegistry` class and `createModelAPI` function

**Root Cause Analysis:**
The `update` method in `ModelRegistry` calls `updater(model, ctx)` but doesn't trigger the notification queue. The `ctx.notify()` method queues effects but they're not being flushed.

**Fix Steps:**
1. Ensure `ctx.notify()` properly queues notifications in `ModelRegistry.effectQueue`
2. Make sure `flushEffects()` is called after updates
3. Verify subscription callbacks are properly registered and called

#### 2. Event System Not Emitting
**Affected Tests:** 11+ tests
**Root Cause:** Event emission and propagation is broken.

**Failing Tests:**
- `test/index.test.ts` - "should emit and handle events"
- `test/event-system.test.ts` - Multiple event-related tests
- `test/edge-cases.test.ts` - "should prevent memory leaks from event listeners"

**Symptoms:**
```typescript
app.models.counter.emit({ type: 'test' })  // Event never reaches subscribers
app.models.counter.onEvent((event) => {
  // This callback is never called
})
```

**Fix Location:** `src/index.ts` - `ModelRegistry.emit()` and event handling in `createModelAPI`

**Root Cause Analysis:**
The `emit` method adds events to `effectQueue` but the queue processing doesn't distinguish between state change notifications and events.

**Fix Steps:**
1. Separate event emission from state change notifications
2. Ensure `onEvent` subscriptions are called when `emit()` is invoked
3. Fix event propagation in the registry system

#### 3. Validation Always Returns Valid
**Affected Tests:** 15+ validation tests
**Root Cause:** Schema validation functions are not being executed.

**Failing Tests:**
- `test/index.test.ts` - "should validate model state"
- `test/validation.test.ts` - All validation tests
- `test/schema-builder.test.ts` - Schema validation tests

**Symptoms:**
```typescript
const result = app.models.user.validate()
expect(result.valid).toBe(false)  // Always returns true
```

**Fix Location:** `src/index.ts` - `validate()` method in `createModelAPI`

**Root Cause Analysis:**
The validation function in the schema is not being called, or the constraints object is not properly structured.

**Fix Steps:**
1. Verify schema constraints are properly passed to `createModelAPI`
2. Ensure `constraints.validate` function is called with current state
3. Fix error collection and return logic

### 🟡 High Priority Issues

#### 4. Transaction Rollback Not Working
**Affected Tests:** Transaction tests
**Root Cause:** Error handling in transactions doesn't properly rollback state.

**Failing Tests:**
- `test/index.test.ts` - "should support transactions with rollback"
- `test/edge-cases.test.ts` - "should handle transactions with errors"

**Fix Location:** `src/index.ts` - `transaction` method in `ModelRegistry.createContext()`

**Fix Steps:**
1. Implement proper snapshot creation before transaction
2. Ensure state is restored on error
3. Handle nested transactions correctly

#### 5. Lens Composition Errors
**Affected Tests:** Lens system tests
**Root Cause:** Complex lens operations fail due to type issues and implementation bugs.

**Failing Tests:**
- `test/lens-system.test.ts` - "should support filter() method for array filtering"
- `test/lens-system.test.ts` - "should update through focused models"
- `test/edge-cases.test.ts` - "should handle lens composition type safety"

**Fix Location:** `src/index.ts` - `lens()` function and `focus()` method

**Fix Steps:**
1. Fix type definitions for lens composition
2. Implement proper array operations (filter, index)
3. Ensure focused model updates work correctly

#### 6. Batch Operations Missing
**Affected Tests:** Batch operation tests
**Root Cause:** `ctx.batch()` method is not implemented.

**Failing Tests:**
- `test/index.test.ts` - "should batch multiple updates"
- `test/edge-cases.test.ts` - "should handle batched operations correctly"

**Fix Location:** `src/index.ts` - `batch` method in `ModelRegistry.createContext()`

**Fix Steps:**
1. Implement batch depth tracking
2. Defer notifications until batch completes
3. Ensure proper cleanup on batch end

### 🟢 Medium Priority Issues

#### 7. Cross-Model Subscriptions Broken
**Affected Tests:** Cross-model communication tests
**Root Cause:** `subscribeTo()` method doesn't work between different models.

**Failing Tests:**
- `test/index.test.ts` - "should support cross-model subscriptions"
- `test/edge-cases.test.ts` - "should handle cross-model subscriptions cleanup"

**Fix Location:** `src/index.ts` - `subscribeTo` method in `createModelAPI`

**Fix Steps:**
1. Implement proper cross-model subscription logic
2. Ensure cleanup when models are destroyed
3. Handle subscription lifecycle correctly

#### 8. Computed Properties Not Updating
**Affected Tests:** Computed property tests
**Root Cause:** Computed values are cached but not invalidated on dependency changes.

**Failing Tests:**
- `test/index.test.ts` - "should cache computed values"
- `test/schema-builder.test.ts` - Schema computed property tests

**Fix Location:** `src/index.ts` - `compute` method and computed property implementation

**Fix Steps:**
1. Implement dependency tracking
2. Add invalidation logic when dependencies change
3. Ensure computed values update reactively

#### 9. Lit-HTML Integration Issues
**Affected Tests:** All Lit-HTML tests
**Root Cause:** Reactive view updates not working, component system broken.

**Failing Tests:**
- `test/lit-integration.test.ts` - All 16 tests

**Fix Location:** `src/lit.ts` - View creation and update logic

**Fix Steps:**
1. Fix subscription integration with Lit views
2. Implement proper component model creation
3. Ensure reactive re-rendering works

#### 10. Memory Leaks
**Affected Tests:** Memory management tests
**Root Cause:** Event listeners and subscriptions not properly cleaned up.

**Failing Tests:**
- `test/edge-cases.test.ts` - Memory management tests

**Fix Location:** Throughout the codebase - cleanup methods

**Fix Steps:**
1. Implement proper unsubscribe mechanisms
2. Add cleanup to destroy methods
3. Ensure resource disposal

## Fix Implementation Guide

### Priority Order

1. **Start with Critical Issues** (1-3): These break core functionality
2. **Fix High Priority Issues** (4-6): Essential for production use
3. **Address Medium Priority Issues** (7-10): Quality of life improvements

### Testing Strategy

For each fix:

1. **Run specific failing tests** for the issue
2. **Verify the fix** doesn't break existing passing tests
3. **Add regression tests** if needed
4. **Document the fix** in code comments

### Example Fix Workflow

```bash
# 1. Identify failing test
npm test -- test/index.test.ts -t "should support subscriptions"

# 2. Implement fix in src/index.ts

# 3. Run test again
npm test -- test/index.test.ts -t "should support subscriptions"

# 4. Run full test suite to check for regressions
npm test
```

### Code Quality Guidelines

- **Add comprehensive error handling**
- **Include detailed JSDoc comments**
- **Add TypeScript strict type checking**
- **Implement proper cleanup in destructors**
- **Add performance monitoring where appropriate**

## Development Environment Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run specific test file
npm test -- test/index.test.ts

# Run tests in watch mode
npm run test:watch

# Build and test
npm run build && npm test
```

## Contributing

When fixing issues:

1. **Create a branch** for each issue category
2. **Write tests first** (TDD approach)
3. **Implement minimal fix**
4. **Add documentation**
5. **Submit PR with detailed description**

## Success Metrics

- **All tests passing** (129/129)
- **No performance regressions**
- **Memory leak free**
- **Type safety maintained**
- **API stability preserved**

## Additional Resources

- [Test Files](./test/) - Comprehensive test suite
- [Source Code](./src/) - Implementation details
- [API Documentation](./src/index.ts) - Type definitions and JSDoc

---

*This document will be updated as issues are resolved and new issues are discovered.*