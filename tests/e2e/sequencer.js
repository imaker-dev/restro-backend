/**
 * Test Sequencer for E2E Tests
 * Ensures tests run in correct order
 */

const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Define test order
    const testOrder = [
      '01-setup.test.js',
      '02-layout.test.js',
      '03-staff.test.js',
      '04-menu.test.js',
      '05-orders.test.js',
      '06-billing.test.js',
      '07-printers.test.js',
      '08-reports.test.js',
      '09-realtime.test.js',
      '10-access-control.test.js',
      '11-cleanup.test.js'
    ];
    
    return tests.sort((a, b) => {
      const aName = a.path.split(/[\\/]/).pop();
      const bName = b.path.split(/[\\/]/).pop();
      
      const aIndex = testOrder.indexOf(aName);
      const bIndex = testOrder.indexOf(bName);
      
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      
      return aIndex - bIndex;
    });
  }
}

module.exports = CustomSequencer;
