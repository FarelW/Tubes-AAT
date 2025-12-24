# Test Scripts - Reporting Service

Kumpulan scripts untuk testing Reporting Service CQRS.

## 📦 Setup

```bash
cd test-scripts
npm install
```

## 🧪 Available Scripts

### Basic Tests

| Command | Deskripsi |
|---------|-----------|
| `npm run test:health` | Health check semua services |
| `npm run test:create` | Buat beberapa sample reports |
| `npm run test:query` | Query reports dari Query Service |
| `npm run test:full` | Full integration test |
| `npm run test:scalability` | Test distribusi load antar instances |

### Data Seeding

| Command | Jumlah Reports |
|---------|----------------|
| `npm run seed` | 50 reports |
| `npm run seed:small` | 20 reports |
| `npm run seed:medium` | 50 reports |
| `npm run seed:large` | 100 reports |

### Sync Verification

| Command | Deskripsi |
|---------|-----------|
| `npm run check:sync` | Cek sync via API |
| `npm run check:db` | Cek sync langsung ke database containers |

### Load Test - Single-Threaded

| Command | Write RPS | Read RPS | Total |
|---------|-----------|----------|-------|
| `npm run loadtest:light` | 10 | 40 | ~50 |
| `npm run loadtest:medium` | 20 | 80 | ~100 |
| `npm run loadtest:heavy` | 50 | 200 | ~250 |
| `npm run loadtest:extreme` | 100 | 400 | ~500 |
| `npm run loadtest:stress` | 200 | 800 | ~1000 |

### Load Test - Multi-Threaded (Worker Threads)

| Command | Workers | Write RPS | Read RPS | Total |
|---------|---------|-----------|----------|-------|
| `npm run parallel` | 4 | 100 | 400 | ~500 |
| `npm run parallel:medium` | 8 | 500 | 2000 | ~2500 |
| `npm run parallel:heavy` | 16 | 1000 | 4000 | ~5000 |
| `npm run parallel:extreme` | 32 | 2000 | 8000 | ~10000 |
| `npm run parallel:stress` | 64 | 5000 | 20000 | ~25000 |
| `npm run parallel:max` | 128 | 10000 | 40000 | ~50000 |

## 📊 Interpretasi Hasil Load Test

### Success Rate
- **100%**: Semua request berhasil
- **90-99%**: Normal untuk high load
- **<90%**: Server kelebihan beban

### Total Requests vs Target
- **Total < Target**: Waktu habis sebelum semua terkirim (NORMAL)
- **Total > Target**: Multi-threading lebih cepat dari expected

### Instance Distribution
- Idealnya merata (~33% per instance untuk 3 instances)
- Nginx menggunakan `least_conn` algorithm

### Response Times
- **P50**: 50% request lebih cepat dari ini
- **P95**: 95% request lebih cepat dari ini
- **P99**: 99% request lebih cepat dari ini

## 🔧 Custom Load Test

### Single-Threaded

```bash
node scripts/comprehensive-load-test.js [level] [type]

# Levels: light, medium, heavy, extreme, stress
# Types: write, read, both

# Examples:
node scripts/comprehensive-load-test.js medium write
node scripts/comprehensive-load-test.js heavy read
node scripts/comprehensive-load-test.js extreme both
```

### Multi-Threaded

```bash
node scripts/parallel-load-test.js [level] [type]

# Levels: light, medium, heavy, extreme, stress, max
# Types: write, read, both

# Examples:
node scripts/parallel-load-test.js heavy write
node scripts/parallel-load-test.js stress read
node scripts/parallel-load-test.js max both
```

## 📁 File Structure

```
test-scripts/
├── config.js                      # Configuration (URLs, timeout)
├── index.js                       # Main entry point
├── package.json                   # Dependencies
├── README.md                      # This file
├── scripts/
│   ├── check-db-sync.js          # Check database sync
│   ├── check-sync-status.js      # Check API sync
│   ├── comprehensive-load-test.js # Single-threaded load test
│   ├── create-reports.js         # Create sample reports
│   ├── full-test.js              # Full integration test
│   ├── health-check.js           # Health check
│   ├── load-test.js              # Basic load test
│   ├── parallel-load-test.js     # Multi-threaded load test
│   ├── query-reports.js          # Query reports
│   ├── scalability-test.js       # Scalability test
│   └── seed-data.js              # Data seeding
└── utils/
    ├── api-client.js             # API client wrapper
    └── logger.js                 # Console logger
```

## ⚙️ Configuration

Edit `config.js` untuk mengubah:

```javascript
export const config = {
    commandService: 'http://localhost:8080',  // Command Service URL
    queryService: 'http://localhost:8090',    // Query Service URL
    timeout: 30000,                           // Request timeout (ms)
};
```

## 🐛 Troubleshooting

### "Command Service is not available!"
```bash
# Pastikan Docker running
docker-compose ps

# Restart jika perlu
docker-compose restart
```

### "0 reports synced"
```bash
# Cek projection service logs
docker logs reporting-projection

# Restart projection
docker-compose restart reporting-projection
```

### Timeout errors saat load test
- Kurangi load level
- Tambah resources Docker
- Cek `docker stats` untuk resource usage
