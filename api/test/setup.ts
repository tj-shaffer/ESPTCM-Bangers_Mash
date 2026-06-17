// Minimal env so loadConfig() (used by auth.ts) succeeds without a real .env or
// database connection. issueToken/verifyToken only need the auth secret; nothing
// here opens a DB connection.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/testforge_test';
process.env.TESTFORGE_INTERNAL_SECRET ??= 'test-secret-not-for-production';
