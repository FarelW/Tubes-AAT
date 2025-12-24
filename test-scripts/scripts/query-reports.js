import { queryAPI } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';
import { sleep } from '../utils/api-client.js';
import { categories, statuses } from '../config.js';

async function queryReports() {
  Logger.section('Query Reports Test');

  // Wait a bit for eventual consistency
  Logger.info('Waiting for eventual consistency...');
  await sleep(2000);

  // Test 1: Get all reports
  Logger.info('Test 1: Get all reports');
  const allReports = await queryAPI.getAllReports();
  if (allReports.success) {
    Logger.success(`Found ${allReports.data.data.length} reports`);
    Logger.info(`Total: ${allReports.data.meta?.total || 0}`);
    Logger.info(`Instance: ${allReports.data.instance}`);
  } else {
    Logger.error(`Failed: ${allReports.error}`);
  }

  Logger.separator();

  // Test 2: Get reports by category
  for (const category of categories.slice(0, 3)) {
    Logger.info(`Test: Get reports by category (${category})`);
    const result = await queryAPI.getAllReports({ category });
    if (result.success) {
      Logger.success(`Found ${result.data.data.length} reports in category "${category}"`);
      Logger.info(`Instance: ${result.data.instance}`);
    } else {
      Logger.error(`Failed: ${result.error}`);
    }
    await sleep(300);
  }

  Logger.separator();

  // Test 3: Get reports by status
  for (const status of statuses.slice(0, 2)) {
    Logger.info(`Test: Get reports by status (${status})`);
    const result = await queryAPI.getAllReports({ status });
    if (result.success) {
      Logger.success(`Found ${result.data.data.length} reports with status "${status}"`);
      Logger.info(`Instance: ${result.data.instance}`);
    } else {
      Logger.error(`Failed: ${result.error}`);
    }
    await sleep(300);
  }

  Logger.separator();

  // Test 4: Get reports with pagination
  Logger.info('Test: Get reports with pagination (page=1, per_page=3)');
  const paginated = await queryAPI.getAllReports({ page: 1, per_page: 3 });
  if (paginated.success) {
    Logger.success(`Retrieved ${paginated.data.data.length} reports`);
    Logger.info(`Page: ${paginated.data.meta?.page}`);
    Logger.info(`Per Page: ${paginated.data.meta?.per_page}`);
    Logger.info(`Total: ${paginated.data.meta?.total}`);
    Logger.info(`Instance: ${paginated.data.instance}`);
  } else {
    Logger.error(`Failed: ${paginated.error}`);
  }

  Logger.separator();

  // Test 5: Get statistics
  Logger.info('Test: Get all statistics');
  const stats = await queryAPI.getStatistics();
  if (stats.success) {
    Logger.success(`Retrieved statistics for ${stats.data.data.length} categories`);
    stats.data.data.forEach(stat => {
      Logger.info(`  ${stat.category}: ${stat.total_count} total (${stat.pending_count} pending, ${stat.in_progress_count} in progress, ${stat.resolved_count} resolved)`);
    });
    Logger.info(`Instance: ${stats.data.instance}`);
  } else {
    Logger.error(`Failed: ${stats.error}`);
  }

  Logger.separator();
  Logger.success('Query tests completed!');
}

queryReports().catch(console.error);

