import { commandAPI, queryAPI, sleep } from '../utils/api-client.js';
import { Logger } from '../utils/logger.js';
import { categories } from '../config.js';

// Generate random report data
function generateRandomReport(index) {
  const titles = [
    'Jalan Rusak di Jl. Sudirman',
    'Sampah Menumpuk di Pasar Baru',
    'Pencurian Motor di Parkiran Mall',
    'Wabah Demam Berdarah',
    'Lampu Jalan Mati',
    'Fasilitas Umum Rusak',
    'Banjir di Perumahan',
    'Kebakaran Rumah',
    'Air PDAM Tidak Keluar',
    'Listrik Mati',
    'Trotoar Rusak',
    'Parkir Liar',
    'Pohon Tumbang',
    'Selokan Tersumbat',
    'Vandalisme Tembok',
    'Kemacetan Lalu Lintas',
    'Polusi Udara',
    'Suara Bising',
    'Hewan Liar Berkeliaran',
    'Fasilitas Olahraga Rusak'
  ];

  const descriptions = [
    'Terdapat lubang besar di jalan utama yang membahayakan pengendara',
    'Tumpukan sampah sudah lebih dari 3 hari tidak diangkut',
    'Sering terjadi pencurian motor di area parkiran',
    'Terdapat beberapa kasus DBD, perlu fogging segera',
    'Lampu jalan mati sudah seminggu, membuat area gelap',
    'Fasilitas umum banyak yang rusak dan tidak layak pakai',
    'Banjir terjadi setiap kali hujan deras',
    'Kebakaran terjadi di rumah warga, perlu penanganan cepat',
    'Air PDAM tidak keluar selama 2 hari',
    'Listrik mati sejak pagi, belum ada perbaikan',
    'Trotoar banyak yang rusak dan berbahaya untuk pejalan kaki',
    'Banyak kendaraan parkir sembarangan di jalan',
    'Pohon besar tumbang menutupi jalan',
    'Selokan tersumbat dan menyebabkan genangan air',
    'Tembok dicorat-coret dengan grafiti',
    'Kemacetan parah terjadi setiap pagi dan sore',
    'Polusi udara sangat terasa di area ini',
    'Suara bising dari pabrik mengganggu warga',
    'Hewan liar seperti monyet berkeliaran di pemukiman',
    'Fasilitas olahraga seperti lapangan basket rusak'
  ];

  const randomTitle = titles[Math.floor(Math.random() * titles.length)];
  const randomDescription = descriptions[Math.floor(Math.random() * descriptions.length)];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];

  return {
    title: `${randomTitle} #${index}`,
    description: `${randomDescription} - Laporan ke-${index}`,
    category: randomCategory
  };
}

async function seedData(count = 50, batchSize = 5) {
  Logger.section('Data Seeding');
  Logger.info(`Will create ${count} reports in batches of ${batchSize}\n`);

  const createdReports = [];
  const failedReports = [];
  let successCount = 0;
  let failCount = 0;

  // Check command service health first
  Logger.info('Checking Command Service health...');
  const health = await commandAPI.healthCheck();
  if (!health.success) {
    Logger.error('Command Service is not available!');
    return;
  }
  Logger.success('Command Service is ready\n');

  // Create reports in batches
  for (let i = 1; i <= count; i++) {
    const report = generateRandomReport(i);

    Logger.info(`[${i}/${count}] Creating: ${report.title.substring(0, 40)}...`);

    const result = await commandAPI.createReport(report);

    if (result.success) {
      const reportId = result.data.data.id;
      createdReports.push({
        id: reportId,
        title: report.title,
        category: report.category
      });
      successCount++;

      if (i % 10 === 0) {
        Logger.success(`Progress: ${i}/${count} reports created (${successCount} success, ${failCount} failed)`);
      }
    } else {
      failedReports.push({ index: i, report, error: result.error });
      failCount++;
      Logger.error(`Failed to create report ${i}: ${result.error}`);
    }

    // Batch delay - wait after every batchSize requests
    if (i % batchSize === 0) {
      await sleep(500);
    } else {
      await sleep(200);
    }
  }

  Logger.separator();
  Logger.section('Seeding Summary');
  Logger.success(`Successfully created: ${successCount} reports`);
  if (failCount > 0) {
    Logger.error(`Failed to create: ${failCount} reports`);
  }

  // Category distribution
  const categoryCounts = {};
  createdReports.forEach(r => {
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  });

  Logger.separator();
  Logger.section('Category Distribution');
  for (const [category, count] of Object.entries(categoryCounts)) {
    Logger.info(`${category}: ${count} reports`);
  }

  Logger.separator();
  Logger.info(`Created ${createdReports.length} report IDs`);

  // Save first 10 IDs for reference
  if (createdReports.length > 0) {
    Logger.info('\nFirst 10 Report IDs:');
    createdReports.slice(0, 10).forEach((r, idx) => {
      Logger.info(`  ${idx + 1}. ${r.id} - ${r.title.substring(0, 30)}...`);
    });
  }

  // Wait for eventual consistency (CQRS sync)
  Logger.separator();
  Logger.section('Waiting for Eventual Consistency');
  Logger.info('Waiting for projection service to sync data to Query DB...');

  const maxWaitTime = 30000; // 30 seconds
  const checkInterval = 2000; // Check every 2 seconds
  const maxChecks = maxWaitTime / checkInterval;
  let syncedCount = 0;
  let checkCount = 0;

  while (checkCount < maxChecks && syncedCount < createdReports.length) {
    await sleep(checkInterval);
    checkCount++;

    const queryResult = await queryAPI.getAllReports({ per_page: 1000 }); // Get all reports
    if (queryResult.success) {
      // Use meta.total if available, otherwise use data.length
      const totalInDB = queryResult.data.meta?.total || queryResult.data.data.length;
      syncedCount = totalInDB;
      const progress = ((syncedCount / createdReports.length) * 100).toFixed(1);
      Logger.info(`Check ${checkCount}/${maxChecks}: ${syncedCount}/${createdReports.length} reports synced (${progress}%)`);

      if (syncedCount >= createdReports.length) {
        Logger.success('All reports have been synced to Query DB!');
        break;
      }
    } else {
      Logger.warning(`Check ${checkCount}: Query service not responding`);
    }
  }

  if (syncedCount < createdReports.length) {
    Logger.warning(`Only ${syncedCount}/${createdReports.length} reports synced. This is normal for CQRS eventual consistency.`);
    Logger.info('Reports will continue to sync in the background.');
  }

  // Final verification
  Logger.separator();
  Logger.section('Final Verification');
  const finalQuery = await queryAPI.getAllReports({ per_page: 1000 }); // Get all reports
  if (finalQuery.success) {
    const totalInDB = finalQuery.data.meta?.total || finalQuery.data.data.length;
    Logger.success(`Query DB contains ${totalInDB} reports (${finalQuery.data.data.length} returned in this page)`);
    Logger.info(`Command DB created: ${createdReports.length} reports`);
    Logger.info(`Sync status: ${totalInDB}/${createdReports.length} (${((totalInDB / createdReports.length) * 100).toFixed(1)}%)`);
    Logger.info(`Query instance: ${finalQuery.data.instance}`);
  }

  Logger.separator();
  Logger.success('Seeding completed!');

  return { createdReports, failedReports, successCount, failCount, syncedCount };
}

// Parse command line arguments
const args = process.argv.slice(2);
let count = 50;
let batchSize = 5;

if (args.length > 0) {
  count = parseInt(args[0]) || 50;
}
if (args.length > 1) {
  batchSize = parseInt(args[1]) || 5;
}

Logger.info(`Starting seed with ${count} reports, batch size: ${batchSize}\n`);

seedData(count, batchSize)
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    Logger.error(`Seeding failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  });

