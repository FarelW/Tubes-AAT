import { commandAPI, queryAPI } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';

async function testHealthChecks() {
  Logger.section('Health Check Tests');

  // Test Command Service Health
  Logger.info('Testing Command Service Health...');
  const commandHealth = await commandAPI.healthCheck();
  if (commandHealth.success) {
    Logger.success(`Command Service: ${JSON.stringify(commandHealth.data)}`);
  } else {
    Logger.error(`Command Service failed: ${commandHealth.error}`);
  }

  Logger.separator();

  // Test Query Service Health (multiple times to see load balancing)
  Logger.info('Testing Query Service Health (Load Balancing)...');
  for (let i = 1; i <= 5; i++) {
    const queryHealth = await queryAPI.healthCheck();
    if (queryHealth.success) {
      Logger.success(`Query Service Request ${i}: ${JSON.stringify(queryHealth.data)}`);
    } else {
      Logger.error(`Query Service Request ${i} failed: ${queryHealth.error}`);
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Small delay
  }

  Logger.separator();
  Logger.success('Health check tests completed!');
}

testHealthChecks().catch(console.error);

