import { commandAPI, queryAPI, sleep } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';

async function verifySync() {
  Logger.section('CQRS Sync Verification');
  Logger.info('Checking synchronization between Command DB and Query DB...\n');

  // Check Command Service
  Logger.info('1. Checking Command Service...');
  const commandHealth = await commandAPI.healthCheck();
  if (!commandHealth.success) {
    Logger.error('Command Service is not available!');
    return;
  }
  Logger.success('Command Service is healthy');

  // Check Query Service
  Logger.info('2. Checking Query Service...');
  const queryHealth = await queryAPI.healthCheck();
  if (!queryHealth.success) {
    Logger.error('Query Service is not available!');
    return;
  }
  Logger.success(`Query Service is healthy (instance: ${queryHealth.data.instance})`);

  Logger.separator();

  // Get counts from both sides
  Logger.section('Data Count Comparison');

  // Note: We can't directly query Command DB count via API
  // So we'll check Query DB and show the status
  Logger.info('Querying Query Database...');
  const queryResult = await queryAPI.getAllReports();
  
  if (queryResult.success) {
    const queryCount = queryResult.data.data.length;
    const totalInMeta = queryResult.data.meta?.total || queryCount;
    
    Logger.info(`Query DB reports: ${queryCount}`);
    Logger.info(`Total (from meta): ${totalInMeta}`);
    Logger.info(`Query instance: ${queryResult.data.instance}`);

    Logger.separator();
    Logger.section('Statistics by Category');
    
    const stats = await queryAPI.getStatistics();
    if (stats.success) {
      let totalFromStats = 0;
      stats.data.data.forEach(stat => {
        Logger.info(`  ${stat.category}: ${stat.total_count} reports`);
        totalFromStats += stat.total_count;
      });
      Logger.info(`\n  Total from statistics: ${totalFromStats}`);
    }

    Logger.separator();
    
    if (queryCount > 0) {
      Logger.success(`Query DB is populated with ${queryCount} reports`);
      Logger.info('CQRS synchronization appears to be working.');
    } else {
      Logger.warning('Query DB is empty. This could mean:');
      Logger.warning('  1. No data has been created yet');
      Logger.warning('  2. Projection service is still processing events');
      Logger.warning('  3. There might be an issue with event processing');
    }
  } else {
    Logger.error(`Failed to query reports: ${queryResult.error}`);
  }

  Logger.separator();
  Logger.info('Note: In CQRS architecture, there is eventual consistency.');
  Logger.info('Data written to Command DB will be synced to Query DB via events.');
  Logger.info('This process may take a few seconds.');
}

verifySync().catch(console.error);

