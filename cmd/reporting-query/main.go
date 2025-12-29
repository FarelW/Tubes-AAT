package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	_ "github.com/lib/pq"
)

// Report represents the read model
type Report struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ReportStatistics represents category statistics
type ReportStatistics struct {
	Category        string    `json:"category"`
	TotalCount      int       `json:"total_count"`
	PendingCount    int       `json:"pending_count"`
	InProgressCount int       `json:"in_progress_count"`
	ResolvedCount   int       `json:"resolved_count"`
	RejectedCount   int       `json:"rejected_count"`
	LastUpdated     time.Time `json:"last_updated"`
}

// App represents the query service application
type App struct {
	dbPool     []*sql.DB
	router     *mux.Router
	instanceID string
}

func main() {
	log.Println("Starting Reporting Query Service...")

	// Get configuration from environment
	dbHosts := getEnv("DB_HOSTS", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")
	dbName := getEnv("DB_NAME", "query_db")
	serverPort := getEnv("SERVER_PORT", "8081")
	instanceID := getEnv("INSTANCE_ID", "query-1")

	// Parse database hosts
	hosts := strings.Split(dbHosts, ",")
	var dbPool []*sql.DB

	// Connect to all database instances
	for _, host := range hosts {
		host = strings.TrimSpace(host)
		connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			host, dbPort, dbUser, dbPassword, dbName)

		var db *sql.DB
		var err error

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
			log.Printf("Failed to connect to database %s: %v", host, err)
			continue
		}

		// Configure connection pool
		db.SetMaxOpenConns(10)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(time.Hour)

		dbPool = append(dbPool, db)
		log.Printf("Connected to Query Database: %s", host)
	}

	if len(dbPool) == 0 {
		log.Fatal("Failed to connect to any database")
	}

	// Create app
	app := &App{
		dbPool:     dbPool,
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
		log.Printf("Reporting Query Service [%s] listening on port %s", instanceID, serverPort)
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

	// Close database connections
	for _, db := range app.dbPool {
		db.Close()
	}

	log.Println("Server exited")
}

func (app *App) setupRoutes() {
	app.router.HandleFunc("/health", app.healthHandler).Methods("GET")
	app.router.HandleFunc("/reports", app.getReportsHandler).Methods("GET")
	app.router.HandleFunc("/reports/{id}", app.getReportByIDHandler).Methods("GET")
	app.router.HandleFunc("/statistics", app.getStatisticsHandler).Methods("GET")
}

// getDB returns a random database connection for load balancing
func (app *App) getDB() *sql.DB {
	if len(app.dbPool) == 1 {
		return app.dbPool[0]
	}
	return app.dbPool[rand.Intn(len(app.dbPool))]
}

func (app *App) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":   "healthy",
		"service":  "reporting-query",
		"instance": app.instanceID,
	})
}

// APIResponse represents a standard API response
type APIResponse struct {
	Success  bool        `json:"success"`
	Message  string      `json:"message,omitempty"`
	Data     interface{} `json:"data,omitempty"`
	Error    string      `json:"error,omitempty"`
	Instance string      `json:"instance,omitempty"`
	Meta     *MetaData   `json:"meta,omitempty"`
}

// MetaData represents pagination metadata
type MetaData struct {
	Total   int `json:"total"`
	Page    int `json:"page"`
	PerPage int `json:"per_page"`
}

func (app *App) getReportsHandler(w http.ResponseWriter, r *http.Request) {
	db := app.getDB()

	// Get query parameters
	category := r.URL.Query().Get("category")
	status := r.URL.Query().Get("status")
	page := parseIntParam(r.URL.Query().Get("page"), 1)
	perPage := parseIntParam(r.URL.Query().Get("per_page"), 20)

	if perPage > 100 {
		perPage = 100
	}

	offset := (page - 1) * perPage

	// Build query
	query := `SELECT id, title, description, category, status, created_at, updated_at FROM reports_read_model WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM reports_read_model WHERE 1=1`
	args := []interface{}{}
	argIndex := 1

	if category != "" {
		query += fmt.Sprintf(" AND LOWER(category) = LOWER($%d)", argIndex)
		countQuery += fmt.Sprintf(" AND LOWER(category) = LOWER($%d)", argIndex)
		args = append(args, category)
		argIndex++
	}

	if status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIndex)
		countQuery += fmt.Sprintf(" AND status = $%d", argIndex)
		args = append(args, status)
		argIndex++
	}

	// Get total count
	var total int
	err := db.QueryRowContext(r.Context(), countQuery, args...).Scan(&total)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "Failed to count reports")
		return
	}

	// Add pagination
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, perPage, offset)

	// Execute query
	rows, err := db.QueryContext(r.Context(), query, args...)
	if err != nil {
		log.Printf("Error querying reports: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch reports")
		return
	}
	defer rows.Close()

	var reports []Report
	for rows.Next() {
		var report Report
		err := rows.Scan(&report.ID, &report.Title, &report.Description, &report.Category, &report.Status, &report.CreatedAt, &report.UpdatedAt)
		if err != nil {
			log.Printf("Error scanning report: %v", err)
			continue
		}
		reports = append(reports, report)
	}

	if reports == nil {
		reports = []Report{}
	}

	respondWithJSON(w, http.StatusOK, APIResponse{
		Success:  true,
		Data:     reports,
		Instance: app.instanceID,
		Meta: &MetaData{
			Total:   total,
			Page:    page,
			PerPage: perPage,
		},
	})
}

func (app *App) getReportByIDHandler(w http.ResponseWriter, r *http.Request) {
	db := app.getDB()
	vars := mux.Vars(r)
	id := vars["id"]

	// Validate UUID
	if _, err := uuid.Parse(id); err != nil {
		respondWithError(w, http.StatusBadRequest, "Invalid report ID format")
		return
	}

	var report Report
	err := db.QueryRowContext(r.Context(),
		`SELECT id, title, description, category, status, created_at, updated_at 
		 FROM reports_read_model WHERE id = $1`, id).
		Scan(&report.ID, &report.Title, &report.Description, &report.Category, &report.Status, &report.CreatedAt, &report.UpdatedAt)

	if err == sql.ErrNoRows {
		respondWithError(w, http.StatusNotFound, "Report not found")
		return
	}
	if err != nil {
		log.Printf("Error querying report: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch report")
		return
	}

	respondWithJSON(w, http.StatusOK, APIResponse{
		Success:  true,
		Data:     report,
		Instance: app.instanceID,
	})
}

func (app *App) getStatisticsHandler(w http.ResponseWriter, r *http.Request) {
	db := app.getDB()

	categoryFilter := r.URL.Query().Get("category")

	// Aggregate statistics from the new schema (category, status, count)
	var query string
	var args []interface{}

	if categoryFilter != "" {
		query = `SELECT category, status, COALESCE(count, 0) as count 
				 FROM report_statistics WHERE LOWER(category) = LOWER($1)`
		args = append(args, categoryFilter)
	} else {
		query = `SELECT category, status, COALESCE(count, 0) as count 
				 FROM report_statistics ORDER BY category, status`
	}

	rows, err := db.QueryContext(r.Context(), query, args...)
	if err != nil {
		log.Printf("Error querying statistics: %v", err)
		respondWithError(w, http.StatusInternalServerError, "Failed to fetch statistics")
		return
	}
	defer rows.Close()

	// Aggregate by category
	categoryStats := make(map[string]*ReportStatistics)
	for rows.Next() {
		var category, status string
		var count int
		if err := rows.Scan(&category, &status, &count); err != nil {
			log.Printf("Error scanning statistics: %v", err)
			continue
		}

		if _, exists := categoryStats[category]; !exists {
			categoryStats[category] = &ReportStatistics{
				Category:    category,
				LastUpdated: time.Now(),
			}
		}

		stat := categoryStats[category]
		stat.TotalCount += count
		switch status {
		case "pending":
			stat.PendingCount = count
		case "in_progress":
			stat.InProgressCount = count
		case "resolved":
			stat.ResolvedCount = count
		case "rejected":
			stat.RejectedCount = count
		}
	}

	// Convert map to slice
	var stats []ReportStatistics
	for _, stat := range categoryStats {
		stats = append(stats, *stat)
	}

	if stats == nil {
		stats = []ReportStatistics{}
	}

	respondWithJSON(w, http.StatusOK, APIResponse{
		Success:  true,
		Data:     stats,
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

func parseIntParam(value string, defaultValue int) int {
	if value == "" {
		return defaultValue
	}
	var result int
	if _, err := fmt.Sscanf(value, "%d", &result); err != nil || result < 1 {
		return defaultValue
	}
	return result
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

