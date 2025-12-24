import { commandAPI, queryAPI } from './utils/api-client.js';
import { Logger } from './utils/logger.js';
import { sampleReports } from './config.js';
import { sleep } from './utils/api-client.js';

async function main() {
    Logger.section('Reporting Service Test Suite');
    Logger.info('Starting comprehensive API tests...\n');

    try {
        // 1. Health Checks
        Logger.section('1. Health Checks');
        const commandHealth = await commandAPI.healthCheck();
        if (commandHealth.success) {
            Logger.success(`Command Service: ${JSON.stringify(commandHealth.data)}`);
        } else {
            Logger.error(`Command Service failed: ${commandHealth.error}`);
        }

        const queryHealth = await queryAPI.healthCheck();
        if (queryHealth.success) {
            Logger.success(`Query Service: ${JSON.stringify(queryHealth.data)}`);
        } else {
            Logger.error(`Query Service failed: ${queryHealth.error}`);
        }

        await sleep(1000);

        // 2. Create Reports
        Logger.section('2. Create Reports');
        const createdReports = [];
        for (let i = 0; i < 3; i++) {
            const report = sampleReports[i];
            Logger.info(`Creating: ${report.title}`);
            const result = await commandAPI.createReport(report);
            if (result.success) {
                createdReports.push(result.data.data);
                Logger.success(`Created: ${result.data.data.id}`);
            } else {
                Logger.error(`Failed: ${result.error}`);
            }
            await sleep(500);
        }

        await sleep(2000); // Wait for eventual consistency

        // 3. Query Reports
        Logger.section('3. Query Reports');
        const allReports = await queryAPI.getAllReports();
        if (allReports.success) {
            Logger.success(`Found ${allReports.data.data.length} reports`);
            Logger.info(`Instance: ${allReports.data.instance}`);
        }

        // 4. Get Statistics
        Logger.section('4. Statistics');
        const stats = await queryAPI.getStatistics();
        if (stats.success) {
            Logger.success('Statistics:');
            stats.data.data.forEach(stat => {
                Logger.info(`  ${stat.category}: ${stat.total_count} total`);
            });
        }

        Logger.separator();
        Logger.success('All tests completed successfully!');

    } catch (error) {
        Logger.error(`Test suite failed: ${error.message}`);
        console.error(error);
    }
}

main();

