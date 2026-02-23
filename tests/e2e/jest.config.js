/**
 * Jest Configuration for E2E Tests
 */

module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  testMatch: ['**/tests/e2e/*.test.js'],
  setupFilesAfterEnv: ['./setup.js'],
  
  // Run tests in sequence (important for E2E)
  maxWorkers: 1,
  
  // Test ordering
  testSequencer: './sequencer.js',
  
  // Reporter configuration (using default only)
  reporters: ['default'],
  
  // Global variables
  globals: {
    TEST_OUTLET_ID: null,
    TOKEN_ADMIN: null,
    TOKEN_MANAGER: null,
    TOKEN_CAPTAIN: null,
    TOKEN_CASHIER: null,
    TOKEN_KITCHEN: null
  }
};
