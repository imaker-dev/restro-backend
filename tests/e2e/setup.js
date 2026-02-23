/**
 * Jest Setup for E2E Tests
 * Runs before all test suites
 */

const { BASE_URL } = require('./config');

beforeAll(async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 RESTROPOS E2E TEST SUITE');
  console.log('='.repeat(60));
  console.log(`\n📍 API URL: ${BASE_URL}`);
  console.log(`📅 Started: ${new Date().toISOString()}`);
  console.log('\n');
  
  // Verify server is running
  try {
    const axios = require('axios');
    const res = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    
    if (res.status === 200) {
      console.log('✅ Server is running');
    } else {
      console.log('⚠️  Server responded but health check failed');
    }
  } catch (error) {
    console.log('❌ Server is not running or not accessible!');
    console.log('   Please start the server with: npm run dev');
    console.log('   Then run tests again: npm run test:e2e\n');
    console.log(`   Error: ${error.message}`);
    throw new Error('Server not running');
  }
});

afterAll(async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🏁 E2E TESTS COMPLETED');
  console.log('='.repeat(60));
  console.log(`📅 Finished: ${new Date().toISOString()}`);
  console.log('\n');
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
