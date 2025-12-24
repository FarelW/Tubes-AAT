# Reporting Service Test Scripts

Script testing untuk Reporting Service CQRS menggunakan Node.js.

## Setup

1. Install dependencies:
```bash
npm install
```

## Available Scripts

### 1. Main Test Suite
Menjalankan semua test dasar:
```bash
npm test
# atau
node index.js
```

### 2. Health Check Test
Test health check endpoint dan load balancing:
```bash
npm run test:health
# atau
node scripts/health-check.js
```

### 3. Create Reports Test
Membuat beberapa laporan:
```bash
npm run test:create
# atau
node scripts/create-reports.js
```

### 4. Query Reports Test
Test berbagai query endpoint:
```bash
npm run test:query
# atau
node scripts/query-reports.js
```

### 5. Full Integration Test
Test lengkap: create, update, query, delete:
```bash
npm run test:full
# atau
node scripts/full-test.js
```

### 6. Load Test
Test load balancing dengan multiple requests:
```bash
npm run test:load
# atau
node scripts/load-test.js
```

### 7. Seed Data (Data Seeding)
Mengisi database dengan banyak data untuk testing:
```bash
# Default: 50 reports
npm run seed
# atau
node scripts/seed-data.js

# Custom jumlah (contoh: 100 reports)
node scripts/seed-data.js 100

# Custom jumlah dan batch size (contoh: 100 reports, batch 10)
node scripts/seed-data.js 100 10

# Quick seed options:
npm run seed:small   # 20 reports
npm run seed:medium  # 50 reports
npm run seed:large   # 100 reports
```

**Fitur Seed Script:**
- Generate random reports dengan berbagai kategori
- Batch processing untuk efisiensi
- Progress tracking
- Category distribution summary
- **Automatic sync verification** - menunggu dan memverifikasi data tersinkronisasi ke Query DB
- Error handling dan reporting

### 8. Verify Sync
Memverifikasi sinkronisasi antara Command DB dan Query DB:
```bash
npm run verify:sync
# atau
node scripts/verify-sync.js
```

**Fitur:**
- Membandingkan jumlah data di Command DB vs Query DB
- Menampilkan statistics per kategori
- Memverifikasi CQRS eventual consistency bekerja

## Configuration

Edit `config.js` untuk mengubah:
- API endpoints
- Timeout settings
- Sample data

## Requirements

- Node.js 14+ (dengan ES modules support)
- Reporting Service berjalan di localhost:8080 dan localhost:8090

## Notes

- Script menggunakan `sleep()` untuk menunggu eventual consistency (CQRS)
- Semua script menggunakan async/await
- Output menggunakan emoji untuk readability

