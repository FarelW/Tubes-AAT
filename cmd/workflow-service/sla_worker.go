package main

import (
	"context"
	"log"
	"time"

	"reporting-service/internal/events"
)

// startSLAWorker starts the background SLA checker
func startSLAWorker(app *App) {
	log.Println("[SLA_WORKER] Starting SLA worker...")
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		checkSLABreaches(app)
	}
}

// checkSLABreaches finds overdue reports and publishes escalation events
func checkSLABreaches(app *App) {
	ctx := context.Background()
	now := time.Now()

	// Find overdue jobs
	rows, err := app.DB.QueryContext(ctx,
		`SELECT report_id, escalation_level FROM sla_jobs
		 WHERE status = 'PENDING' AND due_at < $1`,
		now)
	if err != nil {
		log.Printf("[SLA_WORKER] Error querying SLA jobs: %v", err)
		return
	}
	defer rows.Close()

	var breaches []struct {
		ReportID        string
		EscalationLevel int
	}

	for rows.Next() {
		var reportID string
		var level int
		rows.Scan(&reportID, &level)
		breaches = append(breaches, struct {
			ReportID        string
			EscalationLevel int
		}{reportID, level})
	}

	// Process each breach
	for _, breach := range breaches {
		newLevel := breach.EscalationLevel + 1
		log.Printf("[SLA_WORKER] SLA BREACH detected for report %s, escalating to level %d", breach.ReportID, newLevel)

		// Update SLA job
		_, err := app.DB.ExecContext(ctx,
			`UPDATE sla_jobs SET status = 'ESCALATED', escalation_level = $1, processed_at = $2
			 WHERE report_id = $3`,
			newLevel, now, breach.ReportID)
		if err != nil {
			log.Printf("[SLA_WORKER] Error updating SLA job: %v", err)
			continue
		}

		// Publish escalation event
		payload := events.ReportEscalatedPayload{
			ReportID:        breach.ReportID,
			Reason:          "SLA_BREACH",
			EscalationLevel: newLevel,
		}

		event, _ := events.NewEvent(events.ReportEscalated, breach.ReportID, payload)
		if err := app.EventBus.Publish(ctx, event); err != nil {
			log.Printf("[SLA_WORKER] Error publishing escalation event: %v", err)
		} else {
			log.Printf("[EVENT] Published %s for report %s (level %d)", events.ReportEscalated, breach.ReportID, newLevel)
		}
	}

	if len(breaches) > 0 {
		log.Printf("[SLA_WORKER] Processed %d SLA breaches", len(breaches))
	}
}
