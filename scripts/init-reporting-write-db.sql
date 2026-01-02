-- Reporting Service WRITE Database Schema
-- Database: reporting_write_db
-- Purpose: Command side - handles all INSERT/UPDATE operations

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reports table (citizen submissions) - WRITE ONLY
CREATE TABLE IF NOT EXISTS reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_user_id VARCHAR(100) NOT NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'ANONYMOUS')),
    content TEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'lainnya',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Votes table (upvotes on public reports) - WRITE ONLY
CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    report_id UUID NOT NULL,
    voter_user_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(report_id, voter_user_id)
);

-- Indexes for write operations
CREATE INDEX IF NOT EXISTS idx_reports_id ON reports(report_id);
CREATE INDEX IF NOT EXISTS idx_votes_report ON votes(report_id);
