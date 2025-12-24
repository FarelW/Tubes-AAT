import { commandAPI, queryAPI, sleep } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';
import { categories } from '../config.js';

// ===========================================
// CONFIGURATION
// ===========================================

const LOAD_LEVELS = {
  // Light load - 50 requests/second (safe for local Docker)
  light: {
    name: 'Light',
    writeRPS: 10,      // 10 writes/sec
    readRPS: 40,       // 40 reads/sec
    duration: 10,      // 10 seconds
    description: '~50 req/sec total (10 write + 40 read)'
  },
  // Medium load - 100 requests/second
  medium: {
    name: 'Medium',
    writeRPS: 20,      // 20 writes/sec
    readRPS: 80,       // 80 reads/sec
    duration: 10,      // 10 seconds
    description: '~100 req/sec total (20 write + 80 read)'
  },
  // Heavy load - 250 requests/second
  heavy: {
    name: 'Heavy',
    writeRPS: 50,      // 50 writes/sec
    readRPS: 200,      // 200 reads/sec
    duration: 10,      // 10 seconds
    description: '~250 req/sec total (50 write + 200 read)'
  },
  // Extreme load - 500 requests/second
  extreme: {
    name: 'Extreme',
    writeRPS: 100,     // 100 writes/sec
    readRPS: 400,      // 400 reads/sec
    duration: 10,      // 10 seconds
    description: '~500 req/sec total (100 write + 400 read)'
  },
  // Stress test - 1000 requests/second (max for local Docker)
  stress: {
    name: 'Stress',
    writeRPS: 200,     // 200 writes/sec
    readRPS: 800,      // 800 reads/sec
    duration: 10,      // 10 seconds
    description: '~1000 req/sec total (stress test for local Docker)'
  }
};

// Query types for read operations
const QUERY_TYPES = {
  getAllReports: { weight: 40, name: 'GET /reports' },
  getReportById: { weight: 20, name: 'GET /reports/{id}' },
  getByCategory: { weight: 25, name: 'GET /reports?category=' },
  getStatistics: { weight: 10, name: 'GET /statistics' },
  healthCheck: { weight: 5, name: 'GET /health' }
};

// ===========================================
// UTILITIES
// ===========================================

function generateRandomReport(index) {
  const titles = [
    'Jalan Rusak', 'Sampah Menumpuk', 'Lampu Mati', 'Banjir', 'Pencurian',
    'Kebakaran', 'Polusi', 'Vandalisme', 'Kemacetan', 'Fasilitas Rusak',
    'Gedung Berbahaya', 'Pohon Tumbang', 'Saluran Tersumbat', 'Trotoar Rusak'
  ];
  const randomTitle = titles[Math.floor(Math.random() * titles.length)];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];

  return {
    title: `${randomTitle} - Load Test #${index}`,
    description: `Deskripsi untuk load test ke-${index}. Generated at ${new Date().toISOString()}`,
    category: randomCategory
  };
}

function selectQueryType() {
  const rand = Math.random() * 100;
  let cumulative = 0;

  for (const [type, config] of Object.entries(QUERY_TYPES)) {
    cumulative += config.weight;
    if (rand <= cumulative) {
      return type;
    }
  }
  return 'getAllReports';
}

class LoadTestStats {
  constructor(name) {
    this.name = name;
    this.startTime = Date.now();
    this.requests = 0;
    this.success = 0;
    this.failed = 0;
    this.responseTimes = [];
    this.instanceCounts = {};
    this.queryTypeCounts = {};
    this.errors = {};
  }

  recordRequest(success, responseTime, instance = 'unknown', queryType = null) {
    this.requests++;
    if (success) {
      this.success++;
    } else {
      this.failed++;
    }
    this.responseTimes.push(responseTime);

    this.instanceCounts[instance] = (this.instanceCounts[instance] || 0) + 1;

    if (queryType) {
      this.queryTypeCounts[queryType] = (this.queryTypeCounts[queryType] || 0) + 1;
    }
  }

  recordError(errorType) {
    this.errors[errorType] = (this.errors[errorType] || 0) + 1;
  }

  getStats() {
    const duration = (Date.now() - this.startTime) / 1000;
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);

    return {
      name: this.name,
      totalRequests: this.requests,
      success: this.success,
      failed: this.failed,
      successRate: this.requests > 0 ? ((this.success / this.requests) * 100).toFixed(2) : 0,
      duration: duration.toFixed(2),
      actualRPS: (this.requests / duration).toFixed(2),
      avgResponseTime: this.responseTimes.length > 0
        ? (this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length).toFixed(2)
        : 0,
      minResponseTime: sortedTimes.length > 0 ? sortedTimes[0].toFixed(2) : 0,
      maxResponseTime: sortedTimes.length > 0 ? sortedTimes[sortedTimes.length - 1].toFixed(2) : 0,
      p50: sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.5)].toFixed(2) : 0,
      p95: sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.95)].toFixed(2) : 0,
      p99: sortedTimes.length > 0 ? sortedTimes[Math.floor(sortedTimes.length * 0.99)].toFixed(2) : 0,
      instanceDistribution: this.instanceCounts,
      queryTypeDistribution: this.queryTypeCounts,
      errors: this.errors
    };
  }
}

// ===========================================
// WRITE LOAD TEST
// ===========================================

async function runWriteLoadTest(config) {
  Logger.section(`WRITE LOAD TEST - ${config.name}`);
  Logger.info(`Target: ${config.writeRPS} requests/second for ${config.duration} seconds`);
  Logger.info(`Total expected requests: ${config.writeRPS * config.duration}\n`);

  const stats = new LoadTestStats('Write Operations');
  const interval = 1000 / config.writeRPS; // ms between requests
  const totalRequests = config.writeRPS * config.duration;

  let requestIndex = 0;
  const startTime = Date.now();
  const endTime = startTime + (config.duration * 1000);

  // Create promises array for concurrent requests
  const promises = [];

  while (Date.now() < endTime && requestIndex < totalRequests) {
    const currentIndex = requestIndex++;
    const requestStart = Date.now();

    const promise = (async () => {
      try {
        const report = generateRandomReport(currentIndex);
        const result = await commandAPI.createReport(report);
        const responseTime = Date.now() - requestStart;

        if (result.success) {
          const instance = result.data?.instance || 'unknown';
          stats.recordRequest(true, responseTime, instance, 'createReport');
        } else {
          stats.recordRequest(false, responseTime, 'error', 'createReport');
          stats.recordError(result.error?.message || 'Unknown error');
        }
      } catch (error) {
        const responseTime = Date.now() - requestStart;
        stats.recordRequest(false, responseTime, 'error', 'createReport');
        stats.recordError(error.message || 'Exception');
      }
    })();

    promises.push(promise);

    // Throttle to achieve target RPS
    if (interval > 1) {
      await sleep(interval);
    }

    // Progress update every 20%
    if (requestIndex % Math.floor(totalRequests / 5) === 0) {
      const progress = ((requestIndex / totalRequests) * 100).toFixed(0);
      Logger.info(`Progress: ${progress}% (${requestIndex}/${totalRequests} requests)`);
    }
  }

  // Wait for all pending requests to complete
  await Promise.all(promises);

  return stats.getStats();
}

// ===========================================
// READ LOAD TEST
// ===========================================

async function runReadLoadTest(config, reportIds = []) {
  Logger.section(`READ LOAD TEST - ${config.name}`);
  Logger.info(`Target: ${config.readRPS} requests/second for ${config.duration} seconds`);
  Logger.info(`Total expected requests: ${config.readRPS * config.duration}\n`);

  const stats = new LoadTestStats('Read Operations');
  const interval = 1000 / config.readRPS;
  const totalRequests = config.readRPS * config.duration;

  let requestIndex = 0;
  const startTime = Date.now();
  const endTime = startTime + (config.duration * 1000);

  const promises = [];

  while (Date.now() < endTime && requestIndex < totalRequests) {
    requestIndex++;
    const requestStart = Date.now();
    const queryType = selectQueryType();

    const promise = (async () => {
      try {
        let result;

        switch (queryType) {
          case 'getAllReports':
            result = await queryAPI.getAllReports({ per_page: 20, page: Math.floor(Math.random() * 5) + 1 });
            break;
          case 'getReportById':
            if (reportIds.length > 0) {
              const randomId = reportIds[Math.floor(Math.random() * reportIds.length)];
              result = await queryAPI.getReportById(randomId);
            } else {
              result = await queryAPI.getAllReports({ per_page: 1 });
            }
            break;
          case 'getByCategory':
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            result = await queryAPI.getReportsByCategory(randomCategory);
            break;
          case 'getStatistics':
            result = await queryAPI.getStatistics();
            break;
          case 'healthCheck':
          default:
            result = await queryAPI.healthCheck();
            break;
        }

        const responseTime = Date.now() - requestStart;

        if (result.success) {
          const instance = result.data?.instance || 'unknown';
          stats.recordRequest(true, responseTime, instance, QUERY_TYPES[queryType].name);
        } else {
          stats.recordRequest(false, responseTime, 'error', QUERY_TYPES[queryType].name);
          stats.recordError(result.error?.message || 'Unknown error');
        }
      } catch (error) {
        const responseTime = Date.now() - requestStart;
        stats.recordRequest(false, responseTime, 'error', QUERY_TYPES[queryType].name);
        stats.recordError(error.message || 'Exception');
      }
    })();

    promises.push(promise);

    if (interval > 1) {
      await sleep(interval);
    }

    if (requestIndex % Math.floor(totalRequests / 5) === 0) {
      const progress = ((requestIndex / totalRequests) * 100).toFixed(0);
      Logger.info(`Progress: ${progress}% (${requestIndex}/${totalRequests} requests)`);
    }
  }

  await Promise.all(promises);

  return stats.getStats();
}

// ===========================================
// DISPLAY RESULTS
// ===========================================

function displayResults(writeStats, readStats) {
  Logger.separator();
  Logger.section('📊 LOAD TEST RESULTS');

  // Write Results
  Logger.separator();
  Logger.info('📝 WRITE OPERATIONS (Command Service)');
  Logger.info(`   Total Requests: ${writeStats.totalRequests}`);
  Logger.info(`   Success: ${writeStats.success} | Failed: ${writeStats.failed}`);
  Logger.info(`   Success Rate: ${writeStats.successRate}%`);
  Logger.info(`   Duration: ${writeStats.duration}s`);
  Logger.info(`   Actual RPS: ${writeStats.actualRPS}`);
  Logger.info('');
  Logger.info('   Response Times:');
  Logger.info(`   - Average: ${writeStats.avgResponseTime}ms`);
  Logger.info(`   - Min: ${writeStats.minResponseTime}ms | Max: ${writeStats.maxResponseTime}ms`);
  Logger.info(`   - P50: ${writeStats.p50}ms | P95: ${writeStats.p95}ms | P99: ${writeStats.p99}ms`);
  Logger.info('');
  Logger.info('   Instance Distribution:');
  for (const [instance, count] of Object.entries(writeStats.instanceDistribution)) {
    const pct = ((count / writeStats.success) * 100).toFixed(1);
    Logger.info(`   - ${instance}: ${count} (${pct}%)`);
  }

  // Read Results
  Logger.separator();
  Logger.info('📖 READ OPERATIONS (Query Service)');
  Logger.info(`   Total Requests: ${readStats.totalRequests}`);
  Logger.info(`   Success: ${readStats.success} | Failed: ${readStats.failed}`);
  Logger.info(`   Success Rate: ${readStats.successRate}%`);
  Logger.info(`   Duration: ${readStats.duration}s`);
  Logger.info(`   Actual RPS: ${readStats.actualRPS}`);
  Logger.info('');
  Logger.info('   Response Times:');
  Logger.info(`   - Average: ${readStats.avgResponseTime}ms`);
  Logger.info(`   - Min: ${readStats.minResponseTime}ms | Max: ${readStats.maxResponseTime}ms`);
  Logger.info(`   - P50: ${readStats.p50}ms | P95: ${readStats.p95}ms | P99: ${readStats.p99}ms`);
  Logger.info('');
  Logger.info('   Instance Distribution:');
  for (const [instance, count] of Object.entries(readStats.instanceDistribution)) {
    const pct = ((count / readStats.success) * 100).toFixed(1);
    Logger.info(`   - ${instance}: ${count} (${pct}%)`);
  }
  Logger.info('');
  Logger.info('   Query Type Distribution:');
  for (const [queryType, count] of Object.entries(readStats.queryTypeDistribution)) {
    const pct = ((count / readStats.totalRequests) * 100).toFixed(1);
    Logger.info(`   - ${queryType}: ${count} (${pct}%)`);
  }

  // Errors
  if (Object.keys(writeStats.errors).length > 0 || Object.keys(readStats.errors).length > 0) {
    Logger.separator();
    Logger.warning('⚠️ ERRORS');
    if (Object.keys(writeStats.errors).length > 0) {
      Logger.info('   Write Errors:');
      for (const [error, count] of Object.entries(writeStats.errors)) {
        Logger.info(`   - ${error}: ${count}`);
      }
    }
    if (Object.keys(readStats.errors).length > 0) {
      Logger.info('   Read Errors:');
      for (const [error, count] of Object.entries(readStats.errors)) {
        Logger.info(`   - ${error}: ${count}`);
      }
    }
  }

  // Summary
  Logger.separator();
  Logger.section('📈 SUMMARY');
  const totalRequests = writeStats.totalRequests + readStats.totalRequests;
  const totalSuccess = writeStats.success + readStats.success;
  const totalFailed = writeStats.failed + readStats.failed;
  const overallSuccessRate = ((totalSuccess / totalRequests) * 100).toFixed(2);
  const combinedRPS = (parseFloat(writeStats.actualRPS) + parseFloat(readStats.actualRPS)).toFixed(2);

  Logger.info(`   Total Requests: ${totalRequests}`);
  Logger.info(`   Total Success: ${totalSuccess} | Total Failed: ${totalFailed}`);
  Logger.info(`   Overall Success Rate: ${overallSuccessRate}%`);
  Logger.info(`   Combined RPS: ${combinedRPS}`);
  Logger.info(`   Write:Read Ratio: 1:${(readStats.totalRequests / writeStats.totalRequests).toFixed(1)}`);
}

// ===========================================
// MAIN
// ===========================================

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let level = 'light';
  let testType = 'both'; // 'write', 'read', or 'both'

  for (const arg of args) {
    if (LOAD_LEVELS[arg]) {
      level = arg;
    } else if (['write', 'read', 'both'].includes(arg)) {
      testType = arg;
    }
  }

  const config = LOAD_LEVELS[level];

  Logger.section('🚀 COMPREHENSIVE LOAD TEST');
  Logger.info(`Load Level: ${config.name}`);
  Logger.info(`Description: ${config.description}`);
  Logger.info(`Test Type: ${testType.toUpperCase()}`);
  Logger.info(`Duration: ${config.duration} seconds per test`);
  Logger.separator();

  // Check services health first
  Logger.info('Checking services health...');
  const commandHealth = await commandAPI.healthCheck();
  const queryHealth = await queryAPI.healthCheck();

  if (!commandHealth.success) {
    Logger.error('Command Service is not available!');
    process.exit(1);
  }
  if (!queryHealth.success) {
    Logger.error('Query Service is not available!');
    process.exit(1);
  }
  Logger.success('All services are healthy!\n');

  let writeStats = null;
  let readStats = null;
  let reportIds = [];

  // Run Write Load Test
  if (testType === 'write' || testType === 'both') {
    writeStats = await runWriteLoadTest(config);
    Logger.success(`Write test completed: ${writeStats.totalRequests} requests\n`);

    // Collect some report IDs for read test
    if (testType === 'both') {
      Logger.info('Waiting for eventual consistency (3 seconds)...');
      await sleep(3000);

      const reportsResult = await queryAPI.getAllReports({ per_page: 100 });
      if (reportsResult.success && reportsResult.data?.data) {
        reportIds = reportsResult.data.data.map(r => r.id);
        Logger.info(`Collected ${reportIds.length} report IDs for read test\n`);
      }
    }
  }

  // Run Read Load Test
  if (testType === 'read' || testType === 'both') {
    readStats = await runReadLoadTest(config, reportIds);
    Logger.success(`Read test completed: ${readStats.totalRequests} requests\n`);
  }

  // Display Results
  if (writeStats && readStats) {
    displayResults(writeStats, readStats);
  } else if (writeStats) {
    Logger.separator();
    Logger.section('📊 WRITE LOAD TEST RESULTS');
    Logger.info(`Total Requests: ${writeStats.totalRequests}`);
    Logger.info(`Success Rate: ${writeStats.successRate}%`);
    Logger.info(`Actual RPS: ${writeStats.actualRPS}`);
    Logger.info(`Avg Response Time: ${writeStats.avgResponseTime}ms`);
    Logger.info(`P95: ${writeStats.p95}ms | P99: ${writeStats.p99}ms`);
  } else if (readStats) {
    Logger.separator();
    Logger.section('📊 READ LOAD TEST RESULTS');
    Logger.info(`Total Requests: ${readStats.totalRequests}`);
    Logger.info(`Success Rate: ${readStats.successRate}%`);
    Logger.info(`Actual RPS: ${readStats.actualRPS}`);
    Logger.info(`Avg Response Time: ${readStats.avgResponseTime}ms`);
    Logger.info(`P95: ${readStats.p95}ms | P99: ${readStats.p99}ms`);
  }

  Logger.separator();
  Logger.success('Load test completed!');
  Logger.info('\n📋 Available load levels:');
  for (const [key, val] of Object.entries(LOAD_LEVELS)) {
    Logger.info(`   ${key}: ${val.description}`);
  }
  Logger.info('\n📋 Usage:');
  Logger.info('   node comprehensive-load-test.js [level] [type]');
  Logger.info('   Levels: light, medium, heavy, extreme, stress');
  Logger.info('   Types: write, read, both (default: both)');
}

main().catch(console.error);

