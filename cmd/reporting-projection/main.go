package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "github.com/lib/pq"

	"reporting-service/internal/eventbus"
	"reporting-service/internal/events"
)

// ProjectionService handles event projection to multiple query databases
type ProjectionService struct {
	databases []*DatabaseConnection
	eventBus  *eventbus.RedisEventBus
}

// DatabaseConnection represents a connection to a single database
type DatabaseConnection struct {
	db   *sql.DB
	host string
}

func main() {
	log.Println("Starting Reporting Projection Service...")

	// Get configuration from environment
	dbHosts := getEnv("DB_HOSTS", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")
	dbName := getEnv("DB_NAME", "query_db")
	redisHost := getEnv("REDIS_HOST", "localhost")
	redisPort := getEnv("REDIS_PORT", "6379")
	consumerName := getEnv("CONSUMER_NAME", "projection-1")

	// Parse multiple database hosts
	hosts := strings.Split(dbHosts, ",")
	var databases []*DatabaseConnection

	log.Printf("Connecting to %d query database(s)...", len(hosts))

	for _, host := range hosts {
		host = strings.TrimSpace(host)
		if host == "" {
			continue
		}

		connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			host, dbPort, dbUser, dbPassword, dbName)

		var db *sql.DB
		var err error

		// Retry connection
		for i := 0; i < 30; i++ {
			db, err = sql.Open("postgres", connStr)
			if err == nil {
				err = db.Ping()
				if err == nil {
					break
				}
			}
			log.Printf("Waiting for database %s... attempt %d/30", host, i+1)
			time.Sleep(2 * time.Second)
		}

		if err != nil {
			log.Printf("Warning: Failed to connect to database %s: %v", host, err)
			continue
		}

		// Configure connection pool
		db.SetMaxOpenConns(25)
		db.SetMaxIdleConns(10)
		db.SetConnMaxLifetime(5 * time.Minute)

		databases = append(databases, &DatabaseConnection{
			db:   db,
			host: host,
		})
		log.Printf("✓ Connected to Query Database: %s", host)
	}

	if len(databases) == 0 {
		log.Fatal("Failed to connect to any query database")
	}

	log.Printf("Successfully connected to %d query database(s)", len(databases))

	// Connect to Redis
	eventBus, err := eventbus.NewRedisEventBus(redisHost, redisPort)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer eventBus.Close()
	log.Println("Connected to Redis Event Bus")

	// Create projection service
	service := &ProjectionService{
		databases: databases,
		eventBus:  eventBus,
	}

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	// Start consuming events in goroutine
	go func() {
		log.Printf("Starting event consumer: %s (writing to %d databases)", consumerName, len(databases))
		if err := service.eventBus.Consume(ctx, eventbus.ConsumerGroup, consumerName, service.handleEvent); err != nil {
			if ctx.Err() == nil {
				log.Printf("Error consuming events: %v", err)
			}
		}
	}()

	// Wait for shutdown signal
	<-quit
	log.Println("Shutting down projection service...")
	cancel()

	// Close all database connections
	for _, dbConn := range databases {
		dbConn.db.Close()
	}

	// Give some time for graceful shutdown
	time.Sleep(2 * time.Second)
	log.Println("Projection service stopped")
}

// handleEvent processes an event and writes to ALL query databases
func (s *ProjectionService) handleEvent(event *events.Event) error {
	log.Printf("Processing event: %s for report: %s (to %d databases)", event.EventType, event.ReportID, len(s.databases))

	var wg sync.WaitGroup
	var mu sync.Mutex
	var errors []error

	// Write to ALL databases in parallel
	for _, dbConn := range s.databases {
		wg.Add(1)
		go func(conn *DatabaseConnection) {
			defer wg.Done()

			if err := s.processEventForDatabase(conn, event); err != nil {
				mu.Lock()
				errors = append(errors, fmt.Errorf("database %s: %w", conn.host, err))
				mu.Unlock()
				log.Printf("Error processing event for %s: %v", conn.host, err)
			} else {
				log.Printf("✓ Event %s processed for database: %s", event.EventID[:8], conn.host)
			}
		}(dbConn)
	}

	wg.Wait()

	// If any database succeeded, consider it a success (at-least-once delivery)
	if len(errors) < len(s.databases) {
		return nil
	}

	// All databases failed
	return fmt.Errorf("failed to process event on all databases: %v", errors)
}

// processEventForDatabase processes a single event for a single database
func (s *ProjectionService) processEventForDatabase(conn *DatabaseConnection, event *events.Event) error {
	// Check if event was already processed (idempotency)
	var exists bool
	err := conn.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM processed_events WHERE event_id = $1)`, event.EventID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check event idempotency: %w", err)
	}
	if exists {
		log.Printf("Event %s already processed on %s, skipping", event.EventID[:8], conn.host)
		return nil
	}

	// Start transaction
	tx, err := conn.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// Process event based on type
	switch event.EventType {
	case events.ReportCreated:
		if err := s.handleReportCreated(tx, event); err != nil {
			return err
		}
	case events.ReportUpdated:
		if err := s.handleReportUpdated(tx, event); err != nil {
			return err
		}
	case events.ReportDeleted:
		if err := s.handleReportDeleted(tx, event); err != nil {
			return err
		}
	default:
		log.Printf("Unknown event type: %s", event.EventType)
		return nil
	}

	// Mark event as processed
	_, err = tx.Exec(`INSERT INTO processed_events (event_id, event_type, processed_at) VALUES ($1, $2, $3)`,
		event.EventID, event.EventType, time.Now())
	if err != nil {
		return fmt.Errorf("failed to mark event as processed: %w", err)
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

func (s *ProjectionService) handleReportCreated(tx *sql.Tx, event *events.Event) error {
	var payload events.ReportCreatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal ReportCreated payload: %w", err)
	}

	// Insert into read model
	_, err := tx.Exec(`
		INSERT INTO reports_read_model (id, title, description, category, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (id) DO UPDATE SET
			title = EXCLUDED.title,
			description = EXCLUDED.description,
			category = EXCLUDED.category,
			status = EXCLUDED.status,
			updated_at = EXCLUDED.updated_at`,
		payload.ID, payload.Title, payload.Description, payload.Category, payload.Status, payload.CreatedAt, payload.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to insert report into read model: %w", err)
	}

	// Update statistics
	if err := s.updateStatistics(tx, payload.Category, payload.Status, "create"); err != nil {
		log.Printf("Failed to update statistics: %v", err)
	}

	return nil
}

func (s *ProjectionService) handleReportUpdated(tx *sql.Tx, event *events.Event) error {
	var payload events.ReportUpdatedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal ReportUpdated payload: %w", err)
	}

	// Get old status for statistics update
	var oldStatus string
	err := tx.QueryRow(`SELECT status FROM reports_read_model WHERE id = $1`, payload.ID).Scan(&oldStatus)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to get old status: %w", err)
	}

	// Update read model
	_, err = tx.Exec(`
		UPDATE reports_read_model 
		SET title = $1, description = $2, category = $3, status = $4, updated_at = $5
		WHERE id = $6`,
		payload.Title, payload.Description, payload.Category, payload.Status, payload.UpdatedAt, payload.ID)
	if err != nil {
		return fmt.Errorf("failed to update report in read model: %w", err)
	}

	// Update statistics if status changed
	if oldStatus != "" && oldStatus != payload.Status {
		if err := s.updateStatistics(tx, payload.Category, oldStatus, "decrement"); err != nil {
			log.Printf("Failed to decrement old status statistics: %v", err)
		}
		if err := s.updateStatistics(tx, payload.Category, payload.Status, "increment"); err != nil {
			log.Printf("Failed to increment new status statistics: %v", err)
		}
	}

	return nil
}

func (s *ProjectionService) handleReportDeleted(tx *sql.Tx, event *events.Event) error {
	var payload events.ReportDeletedPayload
	if err := json.Unmarshal(event.Payload, &payload); err != nil {
		return fmt.Errorf("failed to unmarshal ReportDeleted payload: %w", err)
	}

	// Get report info for statistics update
	var category, status string
	err := tx.QueryRow(`SELECT category, status FROM reports_read_model WHERE id = $1`, payload.ID).Scan(&category, &status)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to get report info: %w", err)
	}

	// Delete from read model
	_, err = tx.Exec(`DELETE FROM reports_read_model WHERE id = $1`, payload.ID)
	if err != nil {
		return fmt.Errorf("failed to delete report from read model: %w", err)
	}

	// Update statistics
	if category != "" {
		if err := s.updateStatistics(tx, category, status, "delete"); err != nil {
			log.Printf("Failed to update statistics: %v", err)
		}
	}

	return nil
}

func (s *ProjectionService) updateStatistics(tx *sql.Tx, category, status, operation string) error {
	// Upsert category statistics
	switch operation {
	case "create", "increment":
		_, err := tx.Exec(`
			INSERT INTO report_statistics (category, status, count)
			VALUES ($1, $2, 1)
			ON CONFLICT (category, status) DO UPDATE SET
				count = report_statistics.count + 1,
				updated_at = NOW()`,
			category, status)
		return err
	case "delete", "decrement":
		_, err := tx.Exec(`
			UPDATE report_statistics 
			SET count = GREATEST(count - 1, 0), updated_at = NOW()
			WHERE category = $1 AND status = $2`,
			category, status)
		return err
	}
	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
