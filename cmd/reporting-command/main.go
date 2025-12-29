package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"

	"reporting-service/internal/domain"
	"reporting-service/internal/eventbus"
	"reporting-service/internal/events"
)

type App struct {
	db         *sql.DB
	eventBus   *eventbus.RedisEventBus
	router     *mux.Router
	instanceID string
}

func main() {
	log.Println("Starting Reporting Command Service...")

	// Get configuration from environment
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")
	dbName := getEnv("DB_NAME", "command_db")
	redisHost := getEnv("REDIS_HOST", "localhost")
	redisPort := getEnv("REDIS_PORT", "6379")
	serverPort := getEnv("SERVER_PORT", "8080")
	instanceID := getEnv("INSTANCE_ID", "command-1")

	// Connect to database with retry
	var db *sql.DB
	var err error
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName)

	for i := 0; i < 30; i++ {
		db, err = sql.Open("postgres", connStr)
		if err == nil {
			err = db.Ping()
			if err == nil {
				break
			}
		}
		log.Printf("Waiting for database... attempt %d/30", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Connected to Command Database")

	// Connect to Redis
	eventBus, err := eventbus.NewRedisEventBus(redisHost, redisPort)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer eventBus.Close()
	log.Println("Connected to Redis Event Bus")

	// Create app
	app := &App{
		db:         db,
		eventBus:   eventBus,
		router:     mux.NewRouter(),
		instanceID: instanceID,
	}

	// Setup routes
	app.setupRoutes()

	// Create server
	server := &http.Server{
		Addr:         ":" + serverPort,
		Handler:      app.router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		log.Printf("Reporting Command Service [%s] listening on port %s", instanceID, serverPort)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

func (app *App) setupRoutes() {
	app.router.HandleFunc("/health", app.healthHandler).Methods("GET")
	app.router.HandleFunc("/reports", app.createReportHandler).Methods("POST")
	app.router.HandleFunc("/reports/{id}", app.updateReportHandler).Methods("PUT")
	app.router.HandleFunc("/reports/{id}", app.deleteReportHandler).Methods("DELETE")
}

func (app *App) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":   "healthy",
		"service":  "reporting-command",
		"instance": app.instanceID,
	})
}

// CreateReportRequest represents the request body for creating a report
type CreateReportRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

// UpdateReportRequest represents the request body for updating a report
type UpdateReportRequest struct {
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Category    string `json:"category,omitempty"`
	Status      string `json:"status,omitempty"`
}

// APIResponse represents a standard API response
type APIResponse struct {
	Success  bool        `json:"success"`
	Message  string      `json:"message,omitempty"`
	Data     interface{} `json:"data,omitempty"`
	Error    string      `json:"error,omitempty"`
	Instance string      `json:"instance,omitempty"`
}

func (app *App) createReportHandler(w http.ResponseWriter, r *http.Request) {
	var req CreateReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate request
	if req.Title == "" {
		respondWithError(w, http.StatusBadRequest, "Title is required")
		return
	}
	if req.Description == "" {
		respondWithError(w, http.StatusBadRequest, "Description is required")
		return
	}
	if req.Category == "" {
		respondWithError(w, http.StatusBadRequest, "Category is required")
		return
	}
	if !domain.IsValidCategory(req.Category) {
		respondWithError(w, http.StatusBadRequest, "Invalid category. Valid categories: kebersihan, kriminalitas, infrastruktur, kesehatan, keamanan, lainnya")
		return
	}

	// Create report
	report := domain.NewReport(req.Title, req.Description, req.Category)

	// Start transaction
	tx, err := app.db.BeginTx(r.Context(), nil)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to start transaction")
		return
	}
	defer tx.Rollback()

	// Insert report
	_, err = tx.ExecContext(r.Context(),
		`INSERT INTO reports (id, title, description, category, status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		report.ID, report.Title, report.Description, report.Category, report.Status, report.CreatedAt, report.UpdatedAt)
	if err != nil {
		log.Printf("Error inserting report: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to create report")
		return
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to commit transaction")
		return
	}

	// Create and publish event
	payload := events.ReportCreatedPayload{
		ID:          report.ID.String(),
		Title:       report.Title,
		Description: report.Description,
		Category:    report.Category,
		Status:      report.Status,
		CreatedAt:   report.CreatedAt,
		UpdatedAt:   report.UpdatedAt,
	}

	event, err := events.NewEvent(events.ReportCreated, report.ID.String(), payload)
	if err != nil {
		log.Printf("Error creating event: %v", err)
	} else {
		if err := app.eventBus.Publish(r.Context(), event); err != nil {
			log.Printf("Error publishing event: %v", err)
		}
	}

	respondWithJSON(w, http.StatusCreated, APIResponse{
		Success:  true,
		Message:  "Report created successfully",
		Data:     report,
		Instance: app.instanceID,
	})
}

func (app *App) updateReportHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	reportID, err := uuid.Parse(id)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid report ID")
		return
	}

	var req UpdateReportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	// Validate status if provided
	if req.Status != "" && !domain.IsValidStatus(req.Status) {
		respondWithError(w, http.StatusBadRequest, "Invalid status. Valid statuses: pending, in_progress, resolved, rejected")
		return
	}

	// Validate category if provided
	if req.Category != "" && !domain.IsValidCategory(req.Category) {
		respondWithError(w, http.StatusBadRequest, "Invalid category")
		return
	}

	// Get existing report
	var report domain.Report
	err = app.db.QueryRowContext(r.Context(),
		`SELECT id, title, description, category, status, created_at, updated_at FROM reports WHERE id = $1`,
		reportID).Scan(&report.ID, &report.Title, &report.Description, &report.Category, &report.Status, &report.CreatedAt, &report.UpdatedAt)
	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Report not found")
		return
	}
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch report")
		return
	}

	// Update fields
	if req.Title != "" {
		report.Title = req.Title
	}
	if req.Description != "" {
		report.Description = req.Description
	}
	if req.Category != "" {
		report.Category = req.Category
	}
	if req.Status != "" {
		report.Status = req.Status
	}
	report.UpdatedAt = time.Now()

	// Update in database
	_, err = app.db.ExecContext(r.Context(),
		`UPDATE reports SET title = $1, description = $2, category = $3, status = $4, updated_at = $5 WHERE id = $6`,
		report.Title, report.Description, report.Category, report.Status, report.UpdatedAt, reportID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to update report")
		return
	}

	// Create and publish event
	payload := events.ReportUpdatedPayload{
		ID:          report.ID.String(),
		Title:       report.Title,
		Description: report.Description,
		Category:    report.Category,
		Status:      report.Status,
		UpdatedAt:   report.UpdatedAt,
	}

	event, err := events.NewEvent(events.ReportUpdated, report.ID.String(), payload)
	if err != nil {
		log.Printf("Error creating event: %v", err)
	} else {
		if err := app.eventBus.Publish(r.Context(), event); err != nil {
			log.Printf("Error publishing event: %v", err)
		}
	}

	respondWithJSON(w, http.StatusOK, APIResponse{
		Success:  true,
		Message:  "Report updated successfully",
		Data:     report,
		Instance: app.instanceID,
	})
}

func (app *App) deleteReportHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	reportID, err := uuid.Parse(id)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid report ID")
		return
	}

	// Check if report exists
	var exists bool
	err = app.db.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM reports WHERE id = $1)`, reportID).Scan(&exists)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to check report existence")
		return
	}
	if !exists {
		respondWithError(w, http.StatusNotFound, "Report not found")
		return
	}

	// Delete from database
	_, err = app.db.ExecContext(r.Context(), `DELETE FROM reports WHERE id = $1`, reportID)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to delete report")
		return
	}

	// Create and publish event
	payload := events.ReportDeletedPayload{
		ID:        reportID.String(),
		DeletedAt: time.Now(),
	}

	event, err := events.NewEvent(events.ReportDeleted, reportID.String(), payload)
	if err != nil {
		log.Printf("Error creating event: %v", err)
	} else {
		if err := app.eventBus.Publish(r.Context(), event); err != nil {
			log.Printf("Error publishing event: %v", err)
		}
	}

	respondWithJSON(w, http.StatusOK, APIResponse{
		Success:  true,
		Message:  "Report deleted successfully",
		Instance: app.instanceID,
	})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, APIResponse{
		Success: false,
		Error:   message,
	})
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

