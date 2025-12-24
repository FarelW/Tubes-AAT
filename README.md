# Reporting Service - CQRS Architecture with Database Scaling

Sistem backend untuk pelaporan warga yang mengimplementasikan arsitektur **CQRS (Command Query Responsibility Segregation)** menggunakan Go (Golang) dengan dukungan **horizontal scaling** dan **database replication**.

## 🏗️ Arsitektur

```
                         ┌─────────────────────────────────────────────────────────────┐
                         │                      NGINX LOAD BALANCER                     │
                         │                                                              │
                         │      Port 8080 (Write)              Port 8090 (Read)         │
                         └────────────────┬────────────────────────────┬────────────────┘
                                          │                            │
         ┌────────────────────────────────┼────────────────────────────┼─────────────────────────────┐
         │                                │                            │                             │
         ▼                                ▼                            ▼                             ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   command-1     │  │   command-2     │  │   command-3     │  │    query-1      │  │    query-2      │
│    (8080)       │  │    (8080)       │  │    (8080)       │  │    (8081)       │  │    (8081)       │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │                    │                    │
         └────────────────────┼────────────────────┘                    │                    │
                              │                                         │     ┌─────────────────┐
                              ▼                                         │     │    query-3      │
                    ┌─────────────────┐                                 │     │    (8081)       │
                    │   command-db    │                                 │     └────────┬────────┘
                    │   (Port 5432)   │                                 │              │
                    └────────┬────────┘                                 │              │
                             │                                          │              │
                             │ Publish Events                           │              │
                             ▼                                          ▼              ▼
                    ┌─────────────────┐                        ┌────────────────────────────────┐
                    │  Redis Streams  │                        │     QUERY DATABASE CLUSTER      │
                    │   (Port 6379)   │                        │                                │
                    └────────┬────────┘                        │  ┌──────────┐  ┌──────────┐   │
                             │                                 │  │ replica1 │  │ replica2 │   │
                             │ Consume Events                  │  │ (5434)   │  │ (5435)   │   │
                             ▼                                 │  └──────────┘  └──────────┘   │
                    ┌─────────────────┐                        │        ▲            ▲         │
                    │   projection    │────────────────────────┼────────┼────────────┼─────────┤
                    │   (worker)      │   Write to ALL DBs     │  ┌─────┴────────────┴─────┐   │
                    └─────────────────┘                        │  │      primary (5433)    │   │
                                                               │  └────────────────────────┘   │
                                                               │                                │
                                                               │  ┌────────────────────────┐   │
                                                               │  │  PgBouncer (6432)      │   │
                                                               │  │  Connection Pooling    │   │
                                                               │  └────────────────────────┘   │
                                                               └────────────────────────────────┘
```

## 📊 Komponen Scaling

### Service Scaling
| Service | Instances | Purpose |
|---------|-----------|---------|
| command-service | 3 | Handle write operations |
| query-service | 3 | Handle read operations |
| projection-service | 1 | Event consumer & DB sync |

### Database Scaling
| Database | Type | Purpose |
|----------|------|---------|
| command-db | Single | Write operations dari command service |
| query-db-primary | Primary | Source of truth untuk read model |
| query-db-replica1 | Replica | Read operations (query-1) |
| query-db-replica2 | Replica | Read operations (query-2) |
| pgbouncer | Pool | Connection pooling (1000 → 50 connections) |

### Flow Data
1. **Write**: Client → nginx → command-service → command-db → Redis (event)
2. **Sync**: Redis → projection → query-db-primary + replica1 + replica2
3. **Read**: Client → nginx → query-service → query-db-replica

## 🚀 Cara Menjalankan

### Prerequisites
- Docker & Docker Compose
- Node.js (untuk test scripts)

### Start All Services

```bash
cd D:\Coding\TUBES-AAT

# Stop & remove existing containers
docker-compose down -v

# Build & start all services
docker-compose up --build -d

# Check status
docker-compose ps
```

### Verify Services

```bash
# Check all containers running
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test Command Service (should show different instances)
curl http://localhost:8080/health
curl http://localhost:8080/health
curl http://localhost:8080/health

# Test Query Service (should show different instances)
curl http://localhost:8090/health
curl http://localhost:8090/health
curl http://localhost:8090/health
```

### Stop Services

```bash
docker-compose down

# With volume cleanup (reset all data)
docker-compose down -v
```

## 📡 API Endpoints

### Command Service (Port 8080)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| POST | /reports | Create report |
| PUT | /reports/{id} | Update report |
| DELETE | /reports/{id} | Delete report |

### Query Service (Port 8090)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /reports | List reports (paginated, max 100/page) |
| GET | /reports/{id} | Get report by ID |
| GET | /reports?category={cat} | Filter by category |
| GET | /statistics | Get statistics |

## 🧪 Test Scripts

```bash
cd test-scripts
npm install

# Health check
npm run test:health

# Scalability test (shows instance distribution)
npm run test:scalability

# Load tests
npm run loadtest:light     # ~50 req/sec
npm run loadtest:medium    # ~100 req/sec
npm run loadtest:heavy     # ~250 req/sec
npm run loadtest:extreme   # ~500 req/sec
npm run loadtest:stress    # ~1000 req/sec

# Seeding
npm run seed              # 50 reports
npm run seed:small        # 20 reports
npm run seed:medium       # 50 reports
npm run seed:large        # 100 reports

# Check sync status
npm run check:sync
```

## 📈 Load Test Levels

| Level | Write RPS | Read RPS | Total | Duration |
|-------|-----------|----------|-------|----------|
| light | 10 | 40 | ~50 | 10s |
| medium | 20 | 80 | ~100 | 10s |
| heavy | 50 | 200 | ~250 | 10s |
| extreme | 100 | 400 | ~500 | 10s |
| stress | 200 | 800 | ~1000 | 10s |

## 🔧 Konfigurasi Scaling

### Menambah Command Service Instance

1. Edit `docker-compose.yml`:
```yaml
reporting-command-4:
  build:
    context: .
    dockerfile: cmd/reporting-command/Dockerfile
  container_name: reporting-command-4
  environment:
    - INSTANCE_ID=command-4
    # ... same as other instances
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

1. Add new replica in `docker-compose.yml`:
```yaml
query-db-replica3:
  image: postgres:15-alpine
  container_name: query-db-replica3
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: query_db
  volumes:
    - query-db-replica3-data:/var/lib/postgresql/data
    - ./scripts/init-query-db.sql:/docker-entrypoint-initdb.d/init.sql
  # ...
```

2. Update projection service environment:
```yaml
- DB_HOSTS=query-db-primary,query-db-replica1,query-db-replica2,query-db-replica3
```

3. Add new volume:
```yaml
volumes:
  query-db-replica3-data:
```

## 🛡️ Fault Tolerance

### Database Failure Handling
- Projection service writes to ALL databases in parallel
- If one replica fails, others still receive data
- Query services can failover to different replicas

### Service Failure Handling
- nginx automatically removes unhealthy instances
- Docker restart policy ensures services restart on failure
- Redis persists events for replay if needed

## 📊 Monitoring

### Check Database Sync

```bash
# Check reports count on each database
docker exec query-db-primary psql -U postgres -d query_db -c "SELECT COUNT(*) FROM reports_read_model;"
docker exec query-db-replica1 psql -U postgres -d query_db -c "SELECT COUNT(*) FROM reports_read_model;"
docker exec query-db-replica2 psql -U postgres -d query_db -c "SELECT COUNT(*) FROM reports_read_model;"
```

### Check PgBouncer Stats

```bash
docker exec pgbouncer psql -p 5432 -U postgres pgbouncer -c "SHOW STATS;"
docker exec pgbouncer psql -p 5432 -U postgres pgbouncer -c "SHOW POOLS;"
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f reporting-projection
docker-compose logs -f nginx-lb
```

## 🏛️ Teknologi

| Component | Technology |
|-----------|------------|
| Backend | Go 1.21 |
| Database | PostgreSQL 15 |
| Event Bus | Redis Streams |
| Load Balancer | nginx |
| Connection Pool | PgBouncer |
| Containerization | Docker & Docker Compose |
