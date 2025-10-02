# Claude AI Developer Guide

**👋 Welcome, Claude!**

This file serves as your entry point for working with the GPUI-TS codebase.

## 📖 Primary Documentation

For comprehensive technical documentation, architecture guidelines, and contribution rules, please read:

**[AGENTS.md](./AGENTS.md)** - Complete developer guide for AI agents

## 🎯 Quick Reference

### Core Principles
1. **Centralized State Ownership** - Single source of truth via `ModelRegistry`
2. **Explicit, Atomic Updates** - No direct mutations, transactional updates
3. **Queued Effect System** - Predictable run-to-completion cycles

### Key Files
- `src/index.ts` - Core engine (ModelRegistry, ModelAPI)
- `src/lit.ts` - Rendering layer (lit-html integration)
- `src/helpers.ts` - Schema builder and composition
- `src/selectors.ts` - Memoized selectors
- `test/` - Comprehensive test suite (vitest)

### Development Workflow
1. **Always write tests first** (TDD approach)
2. Run tests: `npm test`
3. Type check: `npx tsc --noEmit` or `npm run type-check`
4. Build: `npm run build`
5. **Document changes** in `docs/AGENT_SUMMARIES/`

### Critical Rules
- ✅ Use `updateAndNotify()` for reactive subscriptions
- ✅ Maintain API consistency with existing patterns
- ✅ Ensure immutability in public APIs
- ✅ Add comprehensive JSDoc comments
- ❌ Never mutate state outside `update()` callbacks
- ❌ Never bypass the queued effect system
- ❌ Never use `any` unless absolutely necessary

## 📚 Additional Resources

### Agent Summaries
Review past work and lessons learned in:
```
docs/AGENT_SUMMARIES/
```

Each summary follows the format: `YYYY-MM-DD - Task Name.md`

### After Completing Tasks
Create a summary document in `docs/AGENT_SUMMARIES/` including:
- Full summary of attempts and solutions
- API changes and additions
- Gotchas and lessons learned
- Wrong paths taken vs. correct approach
- Key findings and next steps

## 🧪 Testing
- Framework: vitest with jsdom
- Run specific test: `npm test -- test/file.test.ts`
- All tests must pass before completion
- Coverage includes edge cases and integration tests

## 🔧 Current Status
- **Tests**: 271/271 passing ✅
- **Type Safety**: Full TypeScript with strict mode ✅
- **Build**: Clean builds for ESM and CJS ✅
- **Documentation**: README and CHANGELOG up to date ✅

## 💡 Philosophy
Focus on **predictability**, **type safety**, and **developer ergonomics**. When in doubt, prioritize correctness over convenience, and maintainability over cleverness.

---

**Ready to contribute?** Start with [AGENTS.md](./AGENTS.md) for the complete guide! 🚀
