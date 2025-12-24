-- Query Database Schema (Denormalized / Read-optimized)
-- This database is used by reporting-query service for reads
-- and reporting-projection service for writes

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reports read model (denormalized for fast queries)
CREATE TABLE IF NOT EXISTS reports_read_model (
    id UUID PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    -- Denormalized fields for faster queries
    category_lower VARCHAR(100) GENERATED ALWAYS AS (LOWER(category)) STORED
);

-- Event tracking for idempotency
CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(255) PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_reports_read_category ON reports_read_model(category_lower);
CREATE INDEX IF NOT EXISTS idx_reports_read_status ON reports_read_model(status);
CREATE INDEX IF NOT EXISTS idx_reports_read_created_at ON reports_read_model(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_read_category_status ON reports_read_model(category_lower, status);

-- Statistics table for analytics (per category + status combination)
CREATE TABLE IF NOT EXISTS report_statistics (
    id SERIAL PRIMARY KEY,
    category VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    count INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, status)
);

-- Create index for statistics lookups
CREATE INDEX IF NOT EXISTS idx_report_statistics_category ON report_statistics(category);
CREATE INDEX IF NOT EXISTS idx_report_statistics_status ON report_statistics(status);
