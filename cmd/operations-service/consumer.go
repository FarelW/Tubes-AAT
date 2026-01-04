package main

import (
	"context"
	"log"

	"reporting-service/internal/auth"
	"reporting-service/internal/events"
)

// startConsumer starts the event consumer for report.created
func startConsumer(app *App) {
	ctx := context.Background()
	log.Println("[CONSUMER] Starting to consume report.created events...")

	err := app.EventBus.Consume(ctx, "operations-service", app.InstanceID, func(event *events.Event) error {
		if event.EventType != events.ReportCreated {
			return nil
		}

		var payload events.ReportCreatedPayload
		if err := event.ParsePayload(&payload); err != nil {
			return err
		}

		log.Printf("[CONSUMER] Received %s: report=%s, category=%s", event.EventType, payload.ReportID, payload.Category)

		// Route to appropriate agency based on category
		ownerAgency := auth.GetAgencyForCategory(payload.Category)

		// Insert into cases (inbox)
		_, err := app.DB.ExecContext(ctx,
			`INSERT INTO cases (report_id, owner_agency, status, content, reporter_user_id, visibility, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
			 ON CONFLICT (report_id) DO NOTHING`,
			payload.ReportID, ownerAgency, "RECEIVED", payload.Content, payload.ReporterUserID, payload.Visibility, payload.CreatedAt)
		if err != nil {
			log.Printf("Error inserting case: %v", err)
			return err
		}

		log.Printf("[CONSUMER] Created case for report %s, routed to agency %s", payload.ReportID, ownerAgency)
		return nil
	})

	if err != nil {
		log.Printf("Consumer error: %v", err)
	}
}
