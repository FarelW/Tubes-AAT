# Reporting Service - CQRS Architecture

Sistem backend untuk pelaporan warga menggunakan arsitektur **CQRS (Command Query Responsibility Segregation)** dengan Go (Golang), mendukung **horizontal scaling** dan **database replication**.

## 🏗️ Arsitektur Sistem

```
                              NGINX LOAD BALANCER
                    ┌─────────────────────────────────────┐
                    │   Port 8080        Port 8090        │
                    │   (Write)          (Read)           │
                    └──────┬─────────────────┬────────────┘
                           │                 │
         ┌─────────────────┼─────────────────┼─────────────────┐
         │                 │                 │                 │
         ▼                 ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐      ┌──────────┐     ┌──────────┐
   │command-1 │     │command-2 │      │ query-1  │     │ query-2  │
   └────┬─────┘     └────┬─────┘      └────┬─────┘     └────┬─────┘
        │                │                 │                 │
        │  ┌──────────┐  │                 │  ┌──────────┐   │
        │  │command-3 │  │                 │  │ query-3  │   │
        │  └────┬─────┘  │                 │  └────┬─────┘   │
        │       │        │                 │       │         │
        └───────┼────────┘                 └───────┼─────────┘
                │                                  │
                ▼                                  ▼
         ┌──────────┐                    ┌─────────────────────┐
         │command-db│                    │ QUERY DB CLUSTER    │
         │ (5432)   │                    │                     │
         └────┬─────┘                    │ primary  replica1   │
              │                          │ (5433)   (5434)     │
              │ Events                   │                     │
              ▼                          │      replica2       │
         ┌──────────┐                    │      (5435)         │
         │  Redis   │◄───────────────────└─────────────────────┘
         │  (6379)  │                              ▲
         └────┬─────┘                              │
              │                                    │
              ▼                          Write to ALL DBs
         ┌──────────┐                              │
         │projection│──────────────────────────────┘
         │ (worker) │
         └──────────┘
```

## 📦 Komponen

| Komponen | Instances | Port | Fungsi |
|----------|-----------|------|--------|
| command-service | 3 | 8080 (LB) | Handle write (POST, PUT, DELETE) |
| query-service | 3 | 8090 (LB) | Handle read (GET) |
| projection-service | 1 | - | Sync events ke Query DBs |
| command-db | 1 | 5432 | Database untuk write |
| query-db-primary | 1 | 5433 | Primary read database |
| query-db-replica1 | 1 | 5434 | Replica untuk query-1 |
| query-db-replica2 | 1 | 5435 | Replica untuk query-2 |
| redis | 1 | 6379 | Event bus (Redis Streams) |
| nginx-lb | 1 | 8080, 8090 | Load balancer |

## 🚀 Cara Menjalankan

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (untuk test scripts)

### Start Services

```bash
cd D:\Coding\TUBES-AAT

# Stop & hapus data lama (jika ada)
docker-compose down -v

# Build & jalankan semua services
docker-compose up --build -d

# Cek status (tunggu semua "healthy")
docker-compose ps
```

### Verifikasi Services

```bash
# Test Command Service (akan menampilkan instance berbeda)
curl http://localhost:8080/health
curl http://localhost:8080/health
curl http://localhost:8080/health

# Test Query Service
curl http://localhost:8090/health
curl http://localhost:8090/health
curl http://localhost:8090/health
```

### Stop Services

```bash
docker-compose down      # Stop saja
docker-compose down -v   # Stop + hapus data
```

## 📡 API Endpoints

### Command Service (Port 8080) - Write Operations

| Method | Endpoint | Body | Deskripsi |
|--------|----------|------|-----------|
| GET | /health | - | Health check |
| POST | /reports | `{title, description, category}` | Buat laporan |
| PUT | /reports/{id} | `{title, description, category, status}` | Update laporan |
| DELETE | /reports/{id} | - | Hapus laporan |

### Query Service (Port 8090) - Read Operations

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | /health | Health check |
| GET | /reports | List laporan (paginated, max 100/page) |
| GET | /reports?page=1&per_page=20 | Pagination |
| GET | /reports?category=infrastruktur | Filter by category |
| GET | /reports/{id} | Detail laporan |
| GET | /statistics | Statistik per kategori |

### Contoh Request

```bash
# Create Report
curl -X POST http://localhost:8080/reports \
  -H "Content-Type: application/json" \
  -d '{"title":"Jalan Rusak","description":"Lubang besar","category":"infrastruktur"}'

# Get Reports
curl http://localhost:8090/reports

# Get by Category
curl http://localhost:8090/reports?category=infrastruktur

# Get Statistics
curl http://localhost:8090/statistics
```

## 🧪 Test Scripts

### Setup

```bash
cd test-scripts
npm install
```

### Available Commands

| Command | Deskripsi |
|---------|-----------|
| `npm run test:health` | Health check semua services |
| `npm run test:scalability` | Test distribusi load antar instances |
| `npm run seed` | Buat 50 sample reports |
| `npm run check:sync` | Cek sync status API |
| `npm run check:db` | Cek sync semua database |

### Load Test (Single-Threaded)

```bash
npm run loadtest:light    # ~50 req/sec
npm run loadtest:medium   # ~100 req/sec
npm run loadtest:heavy    # ~250 req/sec
npm run loadtest:extreme  # ~500 req/sec
npm run loadtest:stress   # ~1000 req/sec
```

### Load Test (Multi-Threaded - Worker Threads)

```bash
npm run parallel          # ~500 req/sec (4 workers)
npm run parallel:medium   # ~2500 req/sec (8 workers)
npm run parallel:heavy    # ~5000 req/sec (16 workers)
npm run parallel:extreme  # ~10000 req/sec (32 workers)
npm run parallel:stress   # ~25000 req/sec (64 workers)
npm run parallel:max      # ~50000 req/sec (128 workers)
```

## 📊 Load Test Results

### Perbandingan Single vs Multi-Threaded

| Mode | Workers | Target RPS | Actual RPS | Success Rate |
|------|---------|------------|------------|--------------|
| Single | 1 | 50 | ~40 | 100% |
| Single | 1 | 250 | ~95 | 100% |
| Parallel | 4 | 500 | ~250 | 100% |
| Parallel | 16 | 5000 | ~760-1400 | ~90% |

### Interpretasi Hasil

- **Total Requests < Target**: Waktu habis sebelum semua request terkirim (NORMAL)
- **Success Rate 100%**: Semua request yang dikirim berhasil
- **Failed > 0**: Ada request yang timeout atau error

### Contoh Output

```
📊 RESULTS:
├─ Total Requests: 3352
├─ Success: 3352 | Failed: 0
├─ Success Rate: 100.00%
├─ Actual RPS: 249.83
├─ Avg Response: 3.29ms
└─ P50: 3ms | P95: 4ms | P99: 5ms

🖥️  Instance Distribution:
├─ command-1: 33.3%
├─ command-2: 33.3%
├─ command-3: 33.3%
```

## 🔧 Scaling Manual

### Menambah Command Service Instance

1. Edit `docker-compose.yml`:
```yaml
reporting-command-4:
  build:
    context: .
    dockerfile: cmd/reporting-command/Dockerfile
  environment:
    - INSTANCE_ID=command-4
    # ... (copy dari instance lain)
```

2. Update `nginx/nginx.conf`:
```nginx
upstream command_services {
    least_conn;
    server reporting-command-1:8080;
    server reporting-command-2:8080;
    server reporting-command-3:8080;
    server reporting-command-4:8080;  # NEW
}
```

### Menambah Query Database Replica

1. Edit `docker-compose.yml`:
```yaml
query-db-replica3:
  image: postgres:15-alpine
  # ... (copy dari replica lain)
```

2. Update projection service:
```yaml
- DB_HOSTS=query-db-primary,query-db-replica1,query-db-replica2,query-db-replica3
```

## 📈 Monitoring

### Cek Database Sync

```bash
# Via script
cd test-scripts
npm run check:db

# Manual
docker exec query-db-primary psql -U postgres -d query_db -c "SELECT COUNT(*) FROM reports_read_model;"
docker exec query-db-replica1 psql -U postgres -d query_db -c "SELECT COUNT(*) FROM reports_read_model;"
docker exec query-db-replica2 psql -U postgres -d query_db -c "SELECT COUNT(*) FROM reports_read_model;"
```

### Cek Logs

```bash
# Semua services
docker-compose logs -f

# Service tertentu
docker-compose logs -f reporting-projection
docker-compose logs -f nginx-lb
```

## 🏛️ Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Backend | Go 1.21 |
| Database | PostgreSQL 15 |
| Event Bus | Redis 7 (Streams) |
| Load Balancer | Nginx |
| Container | Docker & Docker Compose |
| Test Scripts | Node.js 18+ |

## 📝 Domain Model

### Report Entity

| Field | Type | Deskripsi |
|-------|------|-----------|
| id | UUID | Unique identifier |
| title | String | Judul laporan |
| description | String | Deskripsi detail |
| category | String | Kategori (infrastruktur, kebersihan, dll) |
| status | String | Status (pending, in_progress, resolved, rejected) |
| created_at | Timestamp | Waktu dibuat |
| updated_at | Timestamp | Waktu diupdate |

### Valid Categories
- kebersihan
- kriminalitas
- infrastruktur
- kesehatan
- keamanan
- lainnya

### Valid Statuses
- pending (default)
- in_progress
- resolved
- rejected

## 🔄 CQRS Flow

```
1. Client POST /reports → nginx → command-service
2. command-service → INSERT ke command-db
3. command-service → PUBLISH event ke Redis Streams
4. projection-service ← CONSUME event dari Redis
5. projection-service → INSERT ke query-db-primary, replica1, replica2
6. Client GET /reports → nginx → query-service → SELECT dari replica
```

### Eventual Consistency

- Write dan Read terpisah (CQRS)
- Sync via event-driven (Redis Streams)
- Ada delay kecil (~1-5 detik) antara write dan read
- Projection service idempotent (aman untuk replay)
