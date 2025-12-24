import { queryAPI, sleep } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';

async function loadTest() {
  Logger.section('Load Balancing Test');
  Logger.info('Sending multiple requests to test load balancing...\n');

  const requests = 20;
  const instanceCounts = {};

  Logger.info(`Sending ${requests} requests to Query Service...\n`);

  for (let i = 1; i <= requests; i++) {
    const result = await queryAPI.healthCheck();
    
    if (result.success && result.data.instance) {
      const instance = result.data.instance;
      instanceCounts[instance] = (instanceCounts[instance] || 0) + 1;
      
      if (i % 5 === 0) {
        Logger.info(`Request ${i}/${requests} → ${instance}`);
      }
    }
    
    // Small delay to avoid overwhelming
    await sleep(100);
  }

  Logger.separator();
  Logger.section('Load Distribution Results');
  
  const total = Object.values(instanceCounts).reduce((a, b) => a + b, 0);
  
  for (const [instance, count] of Object.entries(instanceCounts)) {
    const percentage = ((count / total) * 100).toFixed(1);
    Logger.info(`${instance}: ${count} requests (${percentage}%)`);
  }

  Logger.separator();
  
  // Check distribution balance
  const counts = Object.values(instanceCounts);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const diff = max - min;
  const balance = ((1 - diff / max) * 100).toFixed(1);

  Logger.info(`Balance: ${balance}% (difference: ${diff} requests)`);
  
  if (balance > 70) {
    Logger.success('Load balancing is working well!');
  } else {
    Logger.warning('Load distribution could be more balanced');
  }

  Logger.separator();
}

loadTest().catch(console.error);

