import { commandAPI, queryAPI, sleep } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';

async function checkSyncStatus() {
  Logger.section('CQRS Sync Status Check');
  Logger.info('Checking synchronization status between Command and Query DB...\n');

  // Check services
  const commandHealth = await commandAPI.healthCheck();
  const queryHealth = await queryAPI.healthCheck();

  if (!commandHealth.success || !queryHealth.success) {
    Logger.error('Services are not healthy!');
    return;
  }

  Logger.success('Both services are healthy\n');

  // Get query count - use large per_page to get all
  const queryResult = await queryAPI.getAllReports({ per_page: 1000 });
  if (!queryResult.success) {
    Logger.error('Failed to query reports');
    return;
  }

  const totalFromMeta = queryResult.data.meta?.total || queryResult.data.data.length;
  const queryCount = queryResult.data.data.length; // Actual returned count

  Logger.section('Current Status');
  Logger.info(`Query DB total reports: ${totalFromMeta}`);
  Logger.info(`Reports returned in this query: ${queryCount}`);
  Logger.info(`Query instance: ${queryResult.data.instance}`);
  
  if (totalFromMeta !== queryCount) {
    Logger.info(`Note: Using pagination (per_page=1000). Total in DB: ${totalFromMeta}`);
  }

  // Check statistics
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
    
    if (totalFromStats !== totalFromMeta) {
      Logger.warning(`⚠️  Mismatch: Query DB total (${totalFromMeta}) vs Stats total (${totalFromStats})`);
    }
  }

  Logger.separator();
  
  if (totalFromMeta === 0) {
    Logger.warning('Query DB is empty. Possible reasons:');
    Logger.warning('  1. No data has been created yet');
    Logger.warning('  2. Projection service is still processing events');
    Logger.warning('  3. Check projection service logs: docker-compose logs reporting-projection');
  } else {
    Logger.success(`Query DB contains ${totalFromMeta} reports`);
    if (totalFromMeta === queryCount) {
      Logger.info('All reports are accessible (no pagination limit hit).');
    } else {
      Logger.info(`Note: Only ${queryCount} reports returned due to pagination. Total in DB: ${totalFromMeta}`);
    }
    Logger.info('Sync appears to be working. If you just created data, wait a few seconds.');
  }

  Logger.separator();
  Logger.info('💡 Tip: In CQRS, there is eventual consistency.');
  Logger.info('   Data written to Command DB will sync to Query DB via events.');
  Logger.info('   This typically takes 1-3 seconds.');
}

checkSyncStatus().catch(console.error);

