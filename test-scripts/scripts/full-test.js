import { commandAPI, queryAPI, sleep } from '../utils/api-client.js';
import { sampleReports } from '../config.js';
import { Logger } from '../utils/logger.js';

async function fullTest() {
  Logger.section('Full Integration Test');
  Logger.info('This test will create, update, query, and delete reports\n');

  const createdReportIds = [];

  // Step 1: Health Checks
  Logger.section('Step 1: Health Checks');
  const commandHealth = await commandAPI.healthCheck();
  if (commandHealth.success) {
    Logger.success('Command Service is healthy');
  } else {
    Logger.error('Command Service is not healthy');
    return;
  }

  const queryHealth = await queryAPI.healthCheck();
  if (queryHealth.success) {
    Logger.success('Query Service is healthy');
  } else {
    Logger.error('Query Service is not healthy');
    return;
  }

  await sleep(1000);

  // Step 2: Create Reports
  Logger.section('Step 2: Create Reports');
  for (let i = 0; i < 3; i++) {
    const report = sampleReports[i];
    Logger.info(`Creating report: ${report.title}`);
    
    const result = await commandAPI.createReport(report);
    if (result.success) {
      const reportId = result.data.data.id;
      createdReportIds.push(reportId);
      Logger.success(`Created report with ID: ${reportId}`);
    } else {
      Logger.error(`Failed to create report: ${result.error}`);
    }
    await sleep(500);
  }

  Logger.info(`Created ${createdReportIds.length} reports`);
  await sleep(2000); // Wait for eventual consistency

  // Step 3: Query Reports
  Logger.section('Step 3: Query Reports');
  const allReports = await queryAPI.getAllReports();
  if (allReports.success) {
    Logger.success(`Found ${allReports.data.data.length} reports`);
    Logger.info(`Instance: ${allReports.data.instance}`);
  }

  // Step 4: Get Specific Report
  if (createdReportIds.length > 0) {
    Logger.section('Step 4: Get Specific Report');
    const reportId = createdReportIds[0];
    Logger.info(`Getting report: ${reportId}`);
    
    const report = await queryAPI.getReportById(reportId);
    if (report.success) {
      Logger.success(`Retrieved report: ${report.data.data.title}`);
      Logger.info(`Instance: ${report.data.instance}`);
    } else {
      Logger.error(`Failed to get report: ${report.error}`);
    }
  }

  await sleep(1000);

  // Step 5: Update Report
  if (createdReportIds.length > 0) {
    Logger.section('Step 5: Update Report');
    const reportId = createdReportIds[0];
    Logger.info(`Updating report: ${reportId}`);
    
    const updateResult = await commandAPI.updateReport(reportId, {
      status: 'in_progress'
    });
    
    if (updateResult.success) {
      Logger.success(`Updated report status to: ${updateResult.data.data.status}`);
    } else {
      Logger.error(`Failed to update report: ${updateResult.error}`);
    }

    await sleep(2000); // Wait for eventual consistency

    // Verify update
    const updatedReport = await queryAPI.getReportById(reportId);
    if (updatedReport.success) {
      Logger.info(`Verified: Report status is now ${updatedReport.data.data.status}`);
      Logger.info(`Instance: ${updatedReport.data.instance}`);
    }
  }

  await sleep(1000);

  // Step 6: Get Statistics
  Logger.section('Step 6: Get Statistics');
  const stats = await queryAPI.getStatistics();
  if (stats.success) {
    Logger.success('Statistics retrieved:');
    stats.data.data.forEach(stat => {
      Logger.info(`  ${stat.category}: ${stat.total_count} total`);
    });
    Logger.info(`Instance: ${stats.data.instance}`);
  }

  await sleep(1000);

  // Step 7: Delete Reports
  Logger.section('Step 7: Delete Reports');
  for (const reportId of createdReportIds) {
    Logger.info(`Deleting report: ${reportId}`);
    const deleteResult = await commandAPI.deleteReport(reportId);
    if (deleteResult.success) {
      Logger.success(`Deleted report: ${reportId}`);
    } else {
      Logger.error(`Failed to delete report: ${deleteResult.error}`);
    }
    await sleep(500);
  }

  await sleep(2000); // Wait for eventual consistency

  // Step 8: Verify Deletion
  Logger.section('Step 8: Verify Deletion');
  const finalReports = await queryAPI.getAllReports();
  if (finalReports.success) {
    Logger.info(`Remaining reports: ${finalReports.data.data.length}`);
    Logger.info(`Instance: ${finalReports.data.instance}`);
  }

  Logger.separator();
  Logger.success('Full integration test completed!');
}

fullTest().catch(console.error);

