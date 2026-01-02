-- Reporting Service Database Schema
-- Database: reporting_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reports table (citizen submissions)
CREATE TABLE IF NOT EXISTS reports (
    report_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_user_id VARCHAR(100) NOT NULL,
    visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'ANONYMOUS')),
    content TEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'lainnya',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Votes table (upvotes on public reports)
CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    report_id UUID NOT NULL,
    voter_user_id VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(report_id, voter_user_id)
);

-- My Reports View (read model for citizen's own reports with status)
CREATE TABLE IF NOT EXISTS my_reports_view (
    report_id UUID PRIMARY KEY,
    reporter_user_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    visibility VARCHAR(20) NOT NULL,
    current_status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    vote_count INTEGER DEFAULT 0,
    last_status_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_visibility ON reports(visibility);
CREATE INDEX IF NOT EXISTS idx_votes_report ON votes(report_id);
CREATE INDEX IF NOT EXISTS idx_my_reports_reporter ON my_reports_view(reporter_user_id);
