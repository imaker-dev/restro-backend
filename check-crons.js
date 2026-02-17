const cron = require('node-cron');

// Check all scheduled tasks
function checkCronStatus() {
  console.log('\n=== CRON JOB STATUS ===');
  
  // Get all registered tasks
  const tasks = cron.getTasks();
  
  if (tasks.size === 0) {
    console.log('❌ No cron jobs are registered');
    return;
  }
  
  console.log(`✅ ${tasks.size} cron jobs registered:\n`);
  
  tasks.forEach((task, name) => {
    console.log(`📋 Job: ${name || 'unnamed'}`);
    console.log(`   Schedule: ${task.options.schedule}`);
    console.log(`   Running: ${task.running ? '🟢 YES' : '🔴 NO'}`);
    console.log(`   Next run: ${task.nextDate()?.toString() || 'Not scheduled'}`);
    console.log('');
  });
}

// Export for use in your app
module.exports = { checkCronStatus };

// If run directly
if (require.main === module) {
  checkCronStatus();
}
