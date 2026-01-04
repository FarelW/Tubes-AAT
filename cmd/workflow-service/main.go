package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"

	"reporting-service/internal/eventbus"
)

// SLA Duration (configurable via API) - default 1 minute for easy PoC testing
var (
	slaDuration = 1 * time.Minute
	slaMutex    sync.RWMutex
)

// GetSLADuration returns current SLA duration
func GetSLADuration() time.Duration {
	slaMutex.RLock()
	defer slaMutex.RUnlock()
	return slaDuration
}

// SetSLADuration sets new SLA duration
func SetSLADuration(d time.Duration) {
	slaMutex.Lock()
	defer slaMutex.Unlock()
	slaDuration = d
	log.Printf("[SLA] Duration changed to %v", d)
}

// App holds the application dependencies
type App struct {
	DB         *sql.DB
	EventBus   *eventbus.RedisEventBus
	Router     *mux.Router
	InstanceID string
}

func main() {
	log.Println("Starting Workflow Service (Async Automation)...")

	cfg := loadConfig()

	// Connect to database
	db, err := connectDB(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Connected to Workflow Database")

	// Connect to Redis
	eventBus, err := eventbus.NewRedisEventBus(cfg.RedisHost, cfg.RedisPort)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer eventBus.Close()
	log.Println("Connected to Redis Event Bus")

	app := &App{
		DB:         db,
		EventBus:   eventBus,
		Router:     mux.NewRouter(),
		InstanceID: cfg.InstanceID,
	}

	// Setup routes
	setupRoutes(app)

	// Start event consumer
	go startConsumer(app)

	// Start SLA worker
	go startSLAWorker(app)

	// Start server
	server := &http.Server{
		Addr:         ":" + cfg.ServerPort,
		Handler:      app.Router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("Workflow Service [%s] listening on port %s", cfg.InstanceID, cfg.ServerPort)
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

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	RedisHost  string
	RedisPort  string
	ServerPort string
	InstanceID string
}

func loadConfig() Config {
	return Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", "postgres"),
		DBName:     getEnv("DB_NAME", "workflow_db"),
		RedisHost:  getEnv("REDIS_HOST", "localhost"),
		RedisPort:  getEnv("REDIS_PORT", "6379"),
		ServerPort: getEnv("SERVER_PORT", "8082"),
		InstanceID: getEnv("INSTANCE_ID", "workflow-1"),
	}
}

func connectDB(cfg Config) (*sql.DB, error) {
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName)

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
		log.Printf("Waiting for database... attempt %d/30", i+1)
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
