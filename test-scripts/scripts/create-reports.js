import { commandAPI } from '../utils/api-client.js';
import { sampleReports } from '../config.js';
import { Logger } from '../utils/logger.js';
import { sleep } from '../utils/api-client.js';

async function createReports() {
  Logger.section('Create Reports Test');
  
  const createdReports = [];

  for (let i = 0; i < sampleReports.length; i++) {
    const report = sampleReports[i];
    Logger.info(`Creating report ${i + 1}/${sampleReports.length}: ${report.title}`);
    
    const result = await commandAPI.createReport(report);
    
    if (result.success) {
      Logger.success(`Report created: ${result.data.data.id}`);
      Logger.info(`  Title: ${result.data.data.title}`);
      Logger.info(`  Category: ${result.data.data.category}`);
      Logger.info(`  Status: ${result.data.data.status}`);
      createdReports.push(result.data.data);
    } else {
      Logger.error(`Failed to create report: ${result.error}`);
    }
    
    // Small delay between requests
    await sleep(500);
  }

  Logger.separator();
  Logger.success(`Successfully created ${createdReports.length} reports!`);
  
  // Save report IDs for later use
  const reportIds = createdReports.map(r => r.id);
  Logger.info(`Report IDs: ${reportIds.join(', ')}`);
  
  return createdReports;
}

createReports().catch(console.error);

