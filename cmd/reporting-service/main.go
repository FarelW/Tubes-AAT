package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"

	"reporting-service/internal/eventbus"
)

// App holds the application dependencies (CQRS enabled)
type App struct {
	WriteDB    *sql.DB // Command side - for INSERT/UPDATE
	ReadDB     *sql.DB // Query side - for SELECT
	EventBus   *eventbus.RedisEventBus
	Router     *mux.Router
	InstanceID string
}

func main() {
	log.Println("Starting Reporting Service (CQRS Enabled)...")

	// Load config from environment
	cfg := loadConfig()

	// Connect to Write DB (Command Side)
	writeDB, err := connectDB(cfg.WriteDBHost, cfg.WriteDBPort, cfg.WriteDBUser, cfg.WriteDBPassword, cfg.WriteDBName)
	if err != nil {
		log.Fatalf("Failed to connect to Write DB: %v", err)
	}
	defer writeDB.Close()
	log.Println("[CQRS] Connected to Write Database (Command Side)")

	// Connect to Read DB (Query Side)
	readDB, err := connectDB(cfg.ReadDBHost, cfg.ReadDBPort, cfg.ReadDBUser, cfg.ReadDBPassword, cfg.ReadDBName)
	if err != nil {
		log.Fatalf("Failed to connect to Read DB: %v", err)
	}
	defer readDB.Close()
	log.Println("[CQRS] Connected to Read Database (Query Side)")

	// Connect to Redis
	eventBus, err := eventbus.NewRedisEventBus(cfg.RedisHost, cfg.RedisPort)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer eventBus.Close()
	log.Println("Connected to Redis Event Bus")

	// Create app
	app := &App{
		WriteDB:    writeDB,
		ReadDB:     readDB,
		EventBus:   eventBus,
		Router:     mux.NewRouter(),
		InstanceID: cfg.InstanceID,
	}

	// Setup routes
	setupRoutes(app)

	// Start event consumer in background
	go startConsumer(app)

	// Create and start server
	server := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      app.Router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("Reporting Service [%s] listening on port %s", cfg.InstanceID, cfg.ServerPort)
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
	server.Shutdown(ctx)
	log.Println("Server exited")
}

// Config holds application configuration (CQRS)
type Config struct {
	// Write DB (Command Side)
	WriteDBHost     string
	WriteDBPort     string
	WriteDBUser     string
	WriteDBPassword string
	WriteDBName     string
	// Read DB (Query Side)
	ReadDBHost     string
	ReadDBPort     string
	ReadDBUser     string
	ReadDBPassword string
	ReadDBName     string
	// Event Bus
	RedisHost  string
	RedisPort  string
	ServerPort string
	InstanceID string
}

func loadConfig() Config {
	return Config{
		// Write DB
		WriteDBHost:     getEnv("WRITE_DB_HOST", "localhost"),
		WriteDBPort:     getEnv("WRITE_DB_PORT", "5432"),
		WriteDBUser:     getEnv("WRITE_DB_USER", "postgres"),
		WriteDBPassword: getEnv("WRITE_DB_PASSWORD", "postgres"),
		WriteDBName:     getEnv("WRITE_DB_NAME", "reporting_write_db"),
		// Read DB
		ReadDBHost:     getEnv("READ_DB_HOST", "localhost"),
		ReadDBPort:     getEnv("READ_DB_PORT", "5435"),
		ReadDBUser:     getEnv("READ_DB_USER", "postgres"),
		ReadDBPassword: getEnv("READ_DB_PASSWORD", "postgres"),
		ReadDBName:     getEnv("READ_DB_NAME", "reporting_read_db"),
		// Other
		RedisHost:  getEnv("REDIS_HOST", "localhost"),
		RedisPort:  getEnv("REDIS_PORT", "6379"),
		ServerPort: getEnv("SERVER_PORT", "8080"),
		InstanceID: getEnv("INSTANCE_ID", "reporting-1"),
	}
}

func connectDB(host, port, user, password, dbname string) (*sql.DB, error) {
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, password, dbname)

	var db *sql.DB
	var err error

	for i := 0; i < 30; i++ {
		db, err = sql.Open("postgres", connStr)
		if err == nil {
			err = db.Ping()
			if err == nil {
				return db, nil
			}
		}
		log.Printf("[%s] Waiting for database... attempt %d/30", dbname, i+1)
		time.Sleep(2 * time.Second)
	}
	return nil, err
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}
