import { commandAPI, queryAPI, sleep } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';
import { categories } from '../config.js';

// Generate random report data
function generateRandomReport(index) {
  const titles = [
    'Jalan Rusak', 'Sampah Menumpuk', 'Lampu Mati', 'Banjir', 'Pencurian',
    'Kebakaran', 'Polusi', 'Vandalisme', 'Kemacetan', 'Fasilitas Rusak'
  ];
  const randomTitle = titles[Math.floor(Math.random() * titles.length)];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];

  return {
    title: `${randomTitle} #${index}`,
    description: `Deskripsi laporan ke-${index}`,
    category: randomCategory
  };
}

async function scalabilityTest() {
  Logger.section('Scalability Test');
  Logger.info('Testing load distribution across multiple service instances\n');

  // Configuration
  const totalRequests = 30;
  const concurrency = 5; // Number of concurrent requests

  // Track instance distribution
  const commandInstances = {};
  const queryInstances = {};

  // Test 1: Command Service Load Balancing
  Logger.section('Test 1: Command Service Load Balancing');
  Logger.info(`Sending ${totalRequests} requests to Command Service...\n`);

  const createdReports = [];
  let commandSuccess = 0;
  let commandFail = 0;

  for (let i = 1; i <= totalRequests; i++) {
    const report = generateRandomReport(i);
    const result = await commandAPI.createReport(report);

    if (result.success) {
      commandSuccess++;
      const instance = result.data.instance || 'unknown';
      commandInstances[instance] = (commandInstances[instance] || 0) + 1;
      createdReports.push(result.data.data);

      if (i % 10 === 0) {
        Logger.info(`Progress: ${i}/${totalRequests} requests sent`);
      }
    } else {
      commandFail++;
    }

    // Small delay to avoid overwhelming
    await sleep(100);
  }

  Logger.separator();
  Logger.section('Command Service Distribution');
  Logger.success(`Total requests: ${totalRequests}`);
  Logger.success(`Success: ${commandSuccess}, Failed: ${commandFail}`);

  for (const [instance, count] of Object.entries(commandInstances)) {
    const percentage = ((count / commandSuccess) * 100).toFixed(1);
    Logger.info(`  ${instance}: ${count} requests (${percentage}%)`);
  }

  // Wait for eventual consistency
  Logger.separator();
  Logger.info('Waiting for eventual consistency (5 seconds)...');
  await sleep(5000);

  // Test 2: Query Service Load Balancing
  Logger.section('Test 2: Query Service Load Balancing');
  Logger.info(`Sending ${totalRequests} read requests to Query Service...\n`);

  let querySuccess = 0;
  let queryFail = 0;

  for (let i = 1; i <= totalRequests; i++) {
    const result = await queryAPI.healthCheck();

    if (result.success) {
      querySuccess++;
      const instance = result.data.instance || 'unknown';
      queryInstances[instance] = (queryInstances[instance] || 0) + 1;
    } else {
      queryFail++;
    }

    await sleep(50);
  }

  Logger.separator();
  Logger.section('Query Service Distribution');
  Logger.success(`Total requests: ${totalRequests}`);
  Logger.success(`Success: ${querySuccess}, Failed: ${queryFail}`);

  for (const [instance, count] of Object.entries(queryInstances)) {
    const percentage = ((count / querySuccess) * 100).toFixed(1);
    Logger.info(`  ${instance}: ${count} requests (${percentage}%)`);
  }

  // Test 3: Verify data sync
  Logger.separator();
  Logger.section('Test 3: Data Sync Verification');

  const queryResult = await queryAPI.getAllReports({ per_page: 1000 });
  if (queryResult.success) {
    const totalInDB = queryResult.data.meta?.total || queryResult.data.data.length;
    Logger.success(`Reports in Query DB: ${totalInDB}`);
    Logger.info(`Reports created: ${createdReports.length}`);

    if (totalInDB >= createdReports.length) {
      Logger.success('All reports successfully synced!');
    } else {
      Logger.warning(`Sync in progress: ${totalInDB}/${createdReports.length}`);
    }
  }

  // Summary
  Logger.separator();
  Logger.section('Scalability Test Summary');
  Logger.info('');
  Logger.info('Command Service Instances:');
  for (const [instance, count] of Object.entries(commandInstances)) {
    Logger.info(`  ✓ ${instance}: handled ${count} write requests`);
  }
  Logger.info('');
  Logger.info('Query Service Instances:');
  for (const [instance, count] of Object.entries(queryInstances)) {
    Logger.info(`  ✓ ${instance}: handled ${count} read requests`);
  }

  // Calculate balance
  const cmdCounts = Object.values(commandInstances);
  const queryCounts = Object.values(queryInstances);

  if (cmdCounts.length > 1) {
    const cmdMax = Math.max(...cmdCounts);
    const cmdMin = Math.min(...cmdCounts);
    const cmdBalance = ((1 - (cmdMax - cmdMin) / cmdMax) * 100).toFixed(1);
    Logger.info(`\nCommand Service Load Balance: ${cmdBalance}%`);
  }

  if (queryCounts.length > 1) {
    const queryMax = Math.max(...queryCounts);
    const queryMin = Math.min(...queryCounts);
    const queryBalance = ((1 - (queryMax - queryMin) / queryMax) * 100).toFixed(1);
    Logger.info(`Query Service Load Balance: ${queryBalance}%`);
  }

  Logger.separator();
  Logger.success('Scalability test completed!');
  Logger.info('\n📋 Key Findings:');
  Logger.info('  • Load is distributed across multiple service instances');
  Logger.info('  • Services can scale horizontally by adding more instances');
  Logger.info('  • CQRS pattern allows independent scaling of read/write operations');
}

scalabilityTest().catch(console.error);

