package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"reporting-service/internal/events"
)

// startConsumer starts the event consumer for workflow events
func startConsumer(app *App) {
	ctx := context.Background()
	log.Println("[CONSUMER] Starting to consume events...")

	err := app.EventBus.Consume(ctx, "workflow-service", app.InstanceID, func(event *events.Event) error {
		log.Printf("[CONSUMER] Received event: %s for report %s", event.EventType, event.ReportID)

		switch event.EventType {
		case events.ReportCreated:
			return handleReportCreated(app, ctx, event)
		case events.ReportStatusUpdated:
			return handleStatusUpdated(app, ctx, event)
		}
		return nil
	})

	if err != nil {
		log.Printf("Consumer error: %v", err)
	}
}

// handleReportCreated creates SLA job and projection when report is created
func handleReportCreated(app *App, ctx context.Context, event *events.Event) error {
	var payload events.ReportCreatedPayload
	if err := event.ParsePayload(&payload); err != nil {
		return err
	}

	dueAt := payload.CreatedAt.Add(GetSLADuration())

	// Create report status projection (with reporter_user_id for notifications)
	_, err := app.DB.ExecContext(ctx,
		`INSERT INTO report_status_projection (report_id, reporter_user_id, current_status, due_at, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $5)
		 ON CONFLICT (report_id) DO UPDATE SET current_status = $3, updated_at = $5`,
		payload.ReportID, payload.ReporterUserID, "RECEIVED", dueAt, payload.CreatedAt)
	if err != nil {
		log.Printf("Error creating projection: %v", err)
	}

	// Create SLA job
	_, err = app.DB.ExecContext(ctx,
		`INSERT INTO sla_jobs (report_id, due_at, status, created_at)
		 VALUES ($1, $2, 'PENDING', $3)
		 ON CONFLICT (report_id) DO NOTHING`,
		payload.ReportID, dueAt, payload.CreatedAt)
	if err != nil {
		log.Printf("Error creating SLA job: %v", err)
	}

	log.Printf("[WORKFLOW] Created SLA job for report %s, due at %s", payload.ReportID, dueAt)
	return nil
}

// handleStatusUpdated updates projection and creates notification
func handleStatusUpdated(app *App, ctx context.Context, event *events.Event) error {
	var payload events.ReportStatusUpdatedPayload
	if err := event.ParsePayload(&payload); err != nil {
		return err
	}

	// Update projection
	_, err := app.DB.ExecContext(ctx,
		`UPDATE report_status_projection SET current_status = $1, updated_at = $2 WHERE report_id = $3`,
		payload.NewStatus, payload.ChangedAt, payload.ReportID)
	if err != nil {
		log.Printf("Error updating projection: %v", err)
	}

	// If resolved, mark SLA job as completed
	if payload.NewStatus == "RESOLVED" {
		_, err = app.DB.ExecContext(ctx,
			`UPDATE sla_jobs SET status = 'COMPLETED', processed_at = $1 WHERE report_id = $2`,
			time.Now(), payload.ReportID)
		if err != nil {
			log.Printf("Error completing SLA job: %v", err)
		}
		log.Printf("[WORKFLOW] Marked SLA job as COMPLETED for report %s", payload.ReportID)
	}

	// Get reporter user ID from projection
	var reporterUserID string
	app.DB.QueryRowContext(ctx,
		`SELECT reporter_user_id FROM report_status_projection WHERE report_id = $1`,
		payload.ReportID).Scan(&reporterUserID)

	// Create notification for the citizen
	if reporterUserID != "" {
		message := fmt.Sprintf("Your report status has been updated to: %s", payload.NewStatus)
		_, err = app.DB.ExecContext(ctx,
			`INSERT INTO notifications (user_id, report_id, message, created_at)
			 VALUES ($1, $2, $3, $4)`,
			reporterUserID, payload.ReportID, message, time.Now())
		if err != nil {
			log.Printf("Error creating notification: %v", err)
		} else {
			log.Printf("[WORKFLOW] Created notification for user %s: %s", reporterUserID, message)
		}
	}

	return nil
}
