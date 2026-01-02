# Citizen Reporting System - PoC

Proof-of-Concept untuk Sistem Pelaporan Warga menggunakan **Microservices + Event-Driven Architecture** dengan Go (Golang).

## 🏗️ Arsitektur Sistem

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    CITIZEN / OFFICER                     │
                    └──────────────┬────────────────────┬─────────────────────┘
                                   │                    │
                    ┌──────────────▼──────┐   ┌────────▼────────────┐
                    │  Reporting Service  │   │  Operations Service │
                    │   (Citizen-facing)  │   │   (Officer-facing)  │
                    │      Port 8080      │   │      Port 8081      │
                    └──────────┬──────────┘   └──────────┬──────────┘
                               │                         │
                    ┌──────────▼──────────┐   ┌──────────▼──────────┐
                    │    Reporting DB     │   │    Operations DB    │
                    │    (PostgreSQL)     │   │    (PostgreSQL)     │
                    └─────────────────────┘   └─────────────────────┘
                               │                         │
                               │    ┌────────────────┐   │
                               └────►  Redis Streams ◄───┘
                                    │   (Event Bus)  │
                                    └───────┬────────┘
                                            │
                               ┌────────────▼────────────┐
                               │    Workflow Service     │
                               │   (SLA + Notifications) │
                               │       Port 8082         │
                               └────────────┬────────────┘
                                            │
                               ┌────────────▼────────────┐
                               │      Workflow DB        │
                               │      (PostgreSQL)       │
                               └─────────────────────────┘
```

## 📦 Komponen

| Service | Port | Database | Fungsi |
|---------|------|----------|--------|
| Reporting Service | 8080 | reporting_db | Citizen: buat laporan, lihat status, upvote |
| Operations Service | 8081 | operations_db | Officer: inbox, update status |
| Workflow Service | 8082 | workflow_db | SLA tracking, notifications |
| Redis | 6379 | - | Event Bus (Redis Streams) |

## 🚀 Cara Menjalankan

### Prerequisites
- Docker & Docker Compose

### Start Services

```bash
# Stop & hapus data lama (jika ada)
docker-compose down -v

# Build & jalankan semua services
docker-compose up --build -d

# Cek status
docker-compose ps

# Lihat logs
docker-compose logs -f
```

### Stop Services

```bash
docker-compose down      # Stop saja
docker-compose down -v   # Stop + hapus data
```

## 👤 Hardcoded Users (PoC)

| Username | Password | Role | Agency |
|----------|----------|------|--------|
| citizen1 | password | citizen | - |
| citizen2 | password | citizen | - |
| citizen3 | password | citizen | - |
| officer1 | password | officer | AGENCY_INFRA |
| officer2 | password | officer | AGENCY_HEALTH |
| officer3 | password | officer | AGENCY_SAFETY |

## 📡 API Endpoints

### Reporting Service (Port 8080) - Citizen

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | /health | - | Health check |
| POST | /auth/login | - | Login, dapatkan JWT token |
| POST | /reports | Bearer | Buat laporan baru |
| GET | /reports/me | Bearer | Lihat laporan milik sendiri + status |
| POST | /reports/:id/upvote | Bearer | Upvote laporan publik |
| GET | /reports/public | - | Lihat semua laporan publik |

### Operations Service (Port 8081) - Officer

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | /health | - | Health check |
| POST | /auth/login | - | Login, dapatkan JWT token |
| GET | /cases/inbox | Bearer | Lihat inbox (filtered by agency) |
| PATCH | /cases/:id/status | Bearer | Update status (RECEIVED → IN_PROGRESS → RESOLVED) |

### Workflow Service (Port 8082)

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | /health | - | Health check |
| GET | /notifications/me | Bearer | Lihat notifikasi saya |
| GET | /sla/status | - | Lihat status SLA semua laporan |

## 🧪 Contoh Request

### 1. Login sebagai Citizen

```bash
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"citizen1","password":"password"}'
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {"id": "citizen1", "role": "citizen", "agency": ""}
}
```

### 2. Buat Laporan

```bash
curl -X POST http://localhost:8080/reports \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"content":"Jalan rusak di Jl. Sudirman","visibility":"PUBLIC","category":"infrastruktur"}'
```

### 3. Login sebagai Officer

```bash
curl -X POST http://localhost:8081/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"officer1","password":"password"}'
```

### 4. Lihat Inbox Officer

```bash
curl http://localhost:8081/cases/inbox \
  -H "Authorization: Bearer <OFFICER_TOKEN>"
```

### 5. Update Status

```bash
curl -X PATCH http://localhost:8081/cases/<REPORT_ID>/status \
  -H "Authorization: Bearer <OFFICER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"status":"IN_PROGRESS"}'
```

### 6. Cek Notifikasi (Citizen)

```bash
curl http://localhost:8082/notifications/me \
  -H "Authorization: Bearer <CITIZEN_TOKEN>"
```

## 📊 Event Flow

```
1. Citizen → POST /reports
   └─► Reporting Service
       ├─► Save to reporting_db
       └─► Publish: report.created

2. Operations Service ← Consume: report.created
   └─► Insert to cases (inbox), route to agency

3. Workflow Service ← Consume: report.created
   └─► Create SLA job (due in 24h)

4. Officer → PATCH /cases/:id/status
   └─► Operations Service
       ├─► Update cases table
       └─► Publish: report.status.updated

5. Reporting Service ← Consume: report.status.updated
   └─► Update my_reports_view

6. Workflow Service ← Consume: report.status.updated
   └─► Create notification for citizen

7. [Background] SLA Worker (every 30s)
   └─► If overdue → Publish: report.escalated
```

## 🔄 Event Contracts

### report.created
```json
{
  "report_id": "uuid",
  "reporter_user_id": "citizen1",
  "visibility": "PUBLIC",
  "content": "...",
  "category": "infrastruktur",
  "created_at": "2026-01-02T20:00:00Z"
}
```

### report.status.updated
```json
{
  "report_id": "uuid",
  "old_status": "RECEIVED",
  "new_status": "IN_PROGRESS",
  "owner_agency": "AGENCY_INFRA",
  "changed_at": "2026-01-02T21:00:00Z"
}
```

### report.escalated
```json
{
  "report_id": "uuid",
  "reason": "SLA_BREACH",
  "escalation_level": 1
}
```

### report.upvoted
```json
{
  "report_id": "uuid",
  "voter_user_id": "citizen2",
  "created_at": "2026-01-02T20:30:00Z"
}
```

## 🏛️ Teknologi

| Komponen | Teknologi |
|----------|-----------|
| Backend | Go 1.21 |
| Database | PostgreSQL 15 (3 instances) |
| Event Bus | Redis 7 (Streams) |
| Container | Docker & Docker Compose |
| Auth | JWT (simplified, hardcoded users) |

## 📝 Database Schema

### Reporting DB
- `reports` - Laporan warga
- `votes` - Upvotes
- `my_reports_view` - Read model untuk citizen

### Operations DB
- `cases` - Inbox officer
- `case_status_history` - Audit trail

### Workflow DB
- `report_status_projection` - Status tracking
- `sla_jobs` - SLA monitoring
- `notifications` - Notifikasi citizen

## 🔍 Monitoring & Debug

### Lihat Logs Event

```bash
# Semua services
docker-compose logs -f | grep -E "\[EVENT\]|\[CONSUMER\]"

# Service tertentu
docker-compose logs -f reporting-service
docker-compose logs -f operations-service
docker-compose logs -f workflow-service
```

### Cek Database

```bash
# Reporting DB
docker exec -it reporting-db psql -U postgres -d reporting_db -c "SELECT * FROM reports;"

# Operations DB
docker exec -it operations-db psql -U postgres -d operations_db -c "SELECT * FROM cases;"

# Workflow DB
docker exec -it workflow-db psql -U postgres -d workflow_db -c "SELECT * FROM sla_jobs;"
```

### Cek Redis Streams

```bash
docker exec -it redis redis-cli
> XINFO STREAM report-events
> XLEN report-events
```
