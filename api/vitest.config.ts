import { defineConfig } from 'vitest/config';

// Unit tests live in test/ (outside src/ so the tsc production build never
// compiles them). They cover the highest-consequence pure logic — password
// hashing, session tokens, the RBAC map, and the run-stage gate — none of which
// need a live database. Auth/role lookups that hit Prisma (`authenticate`,
// `resolveRole`) want a test database and are intentionally deferred to a future
// integration suite.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    environment: 'node',
  },
});
