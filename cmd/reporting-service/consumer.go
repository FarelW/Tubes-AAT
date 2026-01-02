package main

import (
	"context"
	"log"

	"reporting-service/internal/events"
)

// startConsumer starts the event consumer for report.status.updated
func startConsumer(app *App) {
	ctx := context.Background()
	log.Println("[CONSUMER] Starting to consume report.status.updated events...")

	err := app.EventBus.Consume(ctx, "reporting-service", app.InstanceID, func(event *events.Event) error {
		if event.EventType != events.ReportStatusUpdated {
			return nil
		}

		var payload events.ReportStatusUpdatedPayload
		if err := event.ParsePayload(&payload); err != nil {
			return err
		}

		log.Printf("[CONSUMER] Received %s: report=%s, status=%s", event.EventType, payload.ReportID, payload.NewStatus)

		// Update my_reports_view
		_, err := app.DB.ExecContext(ctx,
			`UPDATE my_reports_view SET current_status = $1, last_status_at = $2 WHERE report_id = $3`,
			payload.NewStatus, payload.ChangedAt, payload.ReportID)
		if err != nil {
			log.Printf("Error updating my_reports_view: %v", err)
		}

		return nil
	})

	if err != nil {
		log.Printf("Consumer error: %v", err)
	}
}
