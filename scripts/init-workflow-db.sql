-- Workflow Service Database Schema
-- Database: workflow_db

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Report Status Projection (for tracking)
CREATE TABLE IF NOT EXISTS report_status_projection (
    report_id UUID PRIMARY KEY,
    reporter_user_id VARCHAR(100),
    current_status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    owner_agency VARCHAR(100),
    due_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SLA Jobs (for background processing)
CREATE TABLE IF NOT EXISTS sla_jobs (
    id SERIAL PRIMARY KEY,
    report_id UUID NOT NULL UNIQUE,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'ESCALATED')),
    escalation_level INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Notifications (for citizens)
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    report_id UUID NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projection_status ON report_status_projection(current_status);
CREATE INDEX IF NOT EXISTS idx_sla_status ON sla_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sla_due ON sla_jobs(due_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
