import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// Database containers to check
const DATABASES = [
  { name: 'query-db-primary', container: 'query-db-primary', port: 5433 },
  { name: 'query-db-replica1', container: 'query-db-replica1', port: 5434 },
  { name: 'query-db-replica2', container: 'query-db-replica2', port: 5435 },
];

async function checkDatabaseCount(container) {
  try {
    const { stdout } = await execAsync(
      `docker exec ${container} psql -U postgres -d query_db -t -c "SELECT COUNT(*) FROM reports_read_model;"`
    );
    return parseInt(stdout.trim()) || 0;
  } catch (error) {
    return -1; // Error
  }
}

async function checkEventCount(container) {
  try {
    const { stdout } = await execAsync(
      `docker exec ${container} psql -U postgres -d query_db -t -c "SELECT COUNT(*) FROM processed_events;"`
    );
    return parseInt(stdout.trim()) || 0;
  } catch (error) {
    return -1;
  }
}

async function checkStatistics(container) {
  try {
    const { stdout } = await execAsync(
      `docker exec ${container} psql -U postgres -d query_db -t -c "SELECT SUM(count) FROM report_statistics;"`
    );
    return parseInt(stdout.trim()) || 0;
  } catch (error) {
    return -1;
  }
}

async function main() {
  Logger.section('🔍 DATABASE SYNC STATUS CHECK');
  Logger.info('Checking all Query Database instances...\n');

  const results = [];

  for (const db of DATABASES) {
    Logger.info(`Checking ${db.name}...`);
    
    const reportCount = await checkDatabaseCount(db.container);
    const eventCount = await checkEventCount(db.container);
    const statsSum = await checkStatistics(db.container);

    results.push({
      name: db.name,
      container: db.container,
      port: db.port,
      reports: reportCount,
      events: eventCount,
      stats: statsSum,
      status: reportCount >= 0 ? 'OK' : 'ERROR'
    });
  }

  // Display results
  Logger.separator();
  Logger.section('📊 SYNC STATUS RESULTS');
  Logger.info('');
  
  console.log('┌────────────────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Database           │ Reports  │ Events   │ Stats    │ Status   │');
  console.log('├────────────────────┼──────────┼──────────┼──────────┼──────────┤');
  
  for (const r of results) {
    const reports = r.reports >= 0 ? r.reports.toString().padStart(8) : '   ERROR';
    const events = r.events >= 0 ? r.events.toString().padStart(8) : '   ERROR';
    const stats = r.stats >= 0 ? r.stats.toString().padStart(8) : '   ERROR';
    const status = r.status === 'OK' ? '   ✅   ' : '   ❌   ';
    console.log(`│ ${r.name.padEnd(18)} │${reports} │${events} │${stats} │${status}│`);
  }
  
  console.log('└────────────────────┴──────────┴──────────┴──────────┴──────────┘');

  // Check sync status
  Logger.separator();
  
  const validResults = results.filter(r => r.reports >= 0);
  if (validResults.length === 0) {
    Logger.error('No databases accessible!');
    return;
  }

  const reportCounts = validResults.map(r => r.reports);
  const allSynced = reportCounts.every(c => c === reportCounts[0]);

  if (allSynced) {
    Logger.success(`✅ All databases are IN SYNC with ${reportCounts[0]} reports`);
  } else {
    Logger.warning('⚠️ Databases are OUT OF SYNC!');
    Logger.info(`   Report counts: ${reportCounts.join(', ')}`);
    Logger.info('   This may be normal during high load - projection is catching up');
  }

  // Also check command-db
  Logger.separator();
  Logger.info('Checking Command Database...');
  
  try {
    const { stdout } = await execAsync(
      `docker exec command-db psql -U postgres -d command_db -t -c "SELECT COUNT(*) FROM reports;"`
    );
    const commandCount = parseInt(stdout.trim()) || 0;
    Logger.info(`Command DB reports: ${commandCount}`);
    
    if (validResults.length > 0 && validResults[0].reports === commandCount) {
      Logger.success('✅ Command DB and Query DBs are in sync!');
    } else {
      Logger.warning(`⚠️ Command DB has ${commandCount} reports, Query DBs have ${reportCounts[0] || 0}`);
    }
  } catch (error) {
    Logger.error('Failed to check Command DB');
  }
}

main().catch(console.error);

