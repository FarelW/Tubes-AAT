package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"

	"reporting-service/internal/auth"
	"reporting-service/internal/events"
)

// setupRoutes configures all HTTP routes
func setupRoutes(app *App) {
	app.Router.HandleFunc("/health", healthHandler(app)).Methods("GET")
	app.Router.HandleFunc("/auth/login", loginHandler()).Methods("POST")
	app.Router.HandleFunc("/reports", authMiddleware(createReportHandler(app))).Methods("POST")
	app.Router.HandleFunc("/reports/me", authMiddleware(getMyReportsHandler(app))).Methods("GET")
	app.Router.HandleFunc("/reports/{id}/upvote", authMiddleware(upvoteReportHandler(app))).Methods("POST")
	app.Router.HandleFunc("/reports/public", getPublicReportsHandler(app)).Methods("GET")
}

// authMiddleware validates JWT token
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := auth.ExtractTokenFromHeader(r)
		if token == "" {
			respondWithError(w, http.StatusUnauthorized, "Missing authorization token")
			return
		}

		claims, err := auth.ValidateToken(token)
		if err != nil {
			respondWithError(w, http.StatusUnauthorized, "Invalid token")
			return
		}

		ctx := context.WithValue(r.Context(), "claims", claims)
		next(w, r.WithContext(ctx))
	}
}

// healthHandler returns service health status
func healthHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respondWithJSON(w, http.StatusOK, map[string]string{
			"status":   "healthy",
			"service":  "reporting-service",
			"instance": app.InstanceID,
		})
	}
}

// loginHandler authenticates users and returns JWT
func loginHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondWithError(w, http.StatusBadRequest, "Invalid request")
			return
		}

		user, err := auth.Authenticate(req.Username, req.Password)
		if err != nil {
			respondWithError(w, http.StatusUnauthorized, "Invalid credentials")
			return
		}

		token, err := auth.GenerateToken(*user)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to generate token")
			return
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"token":   token,
			"user": map[string]string{
				"id":     user.ID,
				"role":   user.Role,
				"agency": user.Agency,
			},
		})
	}
}

// createReportHandler creates a new citizen report
func createReportHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)

		var req struct {
			Content    string `json:"content"`
			Visibility string `json:"visibility"`
			Category   string `json:"category"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondWithError(w, http.StatusBadRequest, "Invalid request body")
			return
		}

		if req.Content == "" {
			respondWithError(w, http.StatusBadRequest, "Content is required")
			return
		}

		visibility := "PUBLIC"
		if req.Visibility == "ANONYMOUS" {
			visibility = "ANONYMOUS"
		}

		category := "lainnya"
		if req.Category != "" {
			category = req.Category
		}

		reportID := uuid.New()
		now := time.Now()

		// Insert into reports table
		_, err := app.DB.ExecContext(r.Context(),
			`INSERT INTO reports (report_id, reporter_user_id, visibility, content, category, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			reportID, claims.Sub, visibility, req.Content, category, now)
		if err != nil {
			log.Printf("Error inserting report: %v", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to create report")
			return
		}

		// Insert into my_reports_view (initial state)
		_, err = app.DB.ExecContext(r.Context(),
			`INSERT INTO my_reports_view (report_id, reporter_user_id, content, visibility, current_status, created_at, last_status_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			reportID, claims.Sub, req.Content, visibility, "RECEIVED", now, now)
		if err != nil {
			log.Printf("Error inserting to my_reports_view: %v", err)
		}

		// Publish event
		payload := events.ReportCreatedPayload{
			ReportID:       reportID.String(),
			ReporterUserID: claims.Sub,
			Visibility:     visibility,
			Content:        req.Content,
			Category:       category,
			CreatedAt:      now,
		}

		event, _ := events.NewEvent(events.ReportCreated, reportID.String(), payload)
		if err := app.EventBus.Publish(r.Context(), event); err != nil {
			log.Printf("Error publishing event: %v", err)
		} else {
			log.Printf("[EVENT] Published %s for report %s", events.ReportCreated, reportID)
		}

		respondWithJSON(w, http.StatusCreated, map[string]interface{}{
			"success":   true,
			"message":   "Report created successfully",
			"report_id": reportID.String(),
			"instance":  app.InstanceID,
		})
	}
}

// getMyReportsHandler returns citizen's own reports
func getMyReportsHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)

		rows, err := app.DB.QueryContext(r.Context(),
			`SELECT report_id, content, visibility, current_status, vote_count, last_status_at, created_at
			 FROM my_reports_view WHERE reporter_user_id = $1 ORDER BY created_at DESC`,
			claims.Sub)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to fetch reports")
			return
		}
		defer rows.Close()

		var reports []map[string]interface{}
		for rows.Next() {
			var reportID, content, visibility, status string
			var voteCount int
			var lastStatusAt, createdAt time.Time
			rows.Scan(&reportID, &content, &visibility, &status, &voteCount, &lastStatusAt, &createdAt)
			reports = append(reports, map[string]interface{}{
				"report_id":      reportID,
				"content":        content,
				"visibility":     visibility,
				"current_status": status,
				"vote_count":     voteCount,
				"last_status_at": lastStatusAt,
				"created_at":     createdAt,
			})
		}

		if reports == nil {
			reports = []map[string]interface{}{}
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"data":    reports,
		})
	}
}

// upvoteReportHandler handles upvoting a public report
func upvoteReportHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)
		vars := mux.Vars(r)
		reportID := vars["id"]

		// Check if report exists and is public
		var visibility string
		err := app.DB.QueryRowContext(r.Context(),
			`SELECT visibility FROM reports WHERE report_id = $1`, reportID).Scan(&visibility)
		if err == sql.ErrNoRows {
			respondWithError(w, http.StatusNotFound, "Report not found")
			return
		}
		if visibility != "PUBLIC" {
			respondWithError(w, http.StatusBadRequest, "Can only upvote public reports")
			return
		}

		// Insert vote
		_, err = app.DB.ExecContext(r.Context(),
			`INSERT INTO votes (report_id, voter_user_id, created_at)
			 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			reportID, claims.Sub, time.Now())
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to upvote")
			return
		}

		// Update vote count
		app.DB.ExecContext(r.Context(),
			`UPDATE my_reports_view SET vote_count = (SELECT COUNT(*) FROM votes WHERE report_id = $1)
			 WHERE report_id = $1`, reportID)

		// Publish event
		payload := events.ReportUpvotedPayload{
			ReportID:    reportID,
			VoterUserID: claims.Sub,
			CreatedAt:   time.Now(),
		}
		event, _ := events.NewEvent(events.ReportUpvoted, reportID, payload)
		if err := app.EventBus.Publish(r.Context(), event); err != nil {
			log.Printf("Error publishing upvote event: %v", err)
		} else {
			log.Printf("[EVENT] Published %s for report %s", events.ReportUpvoted, reportID)
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "Upvoted successfully",
		})
	}
}

// getPublicReportsHandler returns all public reports
func getPublicReportsHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := app.DB.QueryContext(r.Context(),
			`SELECT r.report_id, r.content, r.category, r.created_at,
			        COALESCE(v.vote_count, 0) as vote_count
			 FROM reports r
			 LEFT JOIN (SELECT report_id, COUNT(*) as vote_count FROM votes GROUP BY report_id) v
			 ON r.report_id = v.report_id
			 WHERE r.visibility = 'PUBLIC'
			 ORDER BY r.created_at DESC LIMIT 50`)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to fetch reports")
			return
		}
		defer rows.Close()

		var reports []map[string]interface{}
		for rows.Next() {
			var reportID, content, category string
			var createdAt time.Time
			var voteCount int
			rows.Scan(&reportID, &content, &category, &createdAt, &voteCount)
			reports = append(reports, map[string]interface{}{
				"report_id":  reportID,
				"content":    content,
				"category":   category,
				"vote_count": voteCount,
				"created_at": createdAt,
			})
		}

		if reports == nil {
			reports = []map[string]interface{}{}
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"data":    reports,
		})
	}
}

// respondWithJSON writes JSON response
func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

// respondWithError writes error JSON response
func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, map[string]interface{}{
		"success": false,
		"error":   message,
	})
}
