-- Reporting Service READ Database Schema
-- Database: reporting_read_db
-- Purpose: Query side - optimized read models, updated via events

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- My Reports View (read model for citizen's own reports with status)
-- Updated by: consumer listening to report.created, report.status.updated events
CREATE TABLE IF NOT EXISTS my_reports_view (
    report_id UUID PRIMARY KEY,
    reporter_user_id VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'lainnya',
    visibility VARCHAR(20) NOT NULL,
    current_status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    vote_count INTEGER DEFAULT 0,
    last_status_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Public Reports View (read model for public feed)
-- Denormalized view optimized for public listing with vote counts
CREATE TABLE IF NOT EXISTS public_reports_view (
    report_id UUID PRIMARY KEY,
    content TEXT NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'lainnya',
    vote_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Read-optimized indexes
CREATE INDEX IF NOT EXISTS idx_my_reports_reporter ON my_reports_view(reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_my_reports_status ON my_reports_view(current_status);
CREATE INDEX IF NOT EXISTS idx_public_reports_votes ON public_reports_view(vote_count DESC);
CREATE INDEX IF NOT EXISTS idx_public_reports_created ON public_reports_view(created_at DESC);
