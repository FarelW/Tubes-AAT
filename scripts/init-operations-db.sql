-- Operations Service Database Schema
-- Database: operations_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cases table (officer inbox)
CREATE TABLE IF NOT EXISTS cases (
    report_id UUID PRIMARY KEY,
    owner_agency VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'RESOLVED')),
    content TEXT,
    reporter_user_id VARCHAR(100),
    visibility VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Case Status History (audit trail)
CREATE TABLE IF NOT EXISTS case_status_history (
    id SERIAL PRIMARY KEY,
    report_id UUID NOT NULL,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(100),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cases_agency ON cases(owner_agency);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status);
CREATE INDEX IF NOT EXISTS idx_history_report ON case_status_history(report_id);
