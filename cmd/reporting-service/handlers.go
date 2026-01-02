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

	// COMMAND handlers (use WriteDB)
	app.Router.HandleFunc("/reports", authMiddleware(createReportHandler(app))).Methods("POST")
	app.Router.HandleFunc("/reports/{id}/upvote", authMiddleware(upvoteReportHandler(app))).Methods("POST")

	// QUERY handlers (use ReadDB)
	app.Router.HandleFunc("/reports/me", authMiddleware(getMyReportsHandler(app))).Methods("GET")
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
			"cqrs":     "enabled",
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
// Uses: WriteDB (COMMAND)

// createReportHandler creates a new citizen report
// Uses: WriteDB (COMMAND)
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

		// [CQRS - COMMAND] Insert into WriteDB.reports
		_, err := app.WriteDB.ExecContext(r.Context(),
			`INSERT INTO reports (report_id, reporter_user_id, visibility, content, category, created_at)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			reportID, claims.Sub, visibility, req.Content, category, now)
		if err != nil {
			log.Printf("[CQRS-WRITE] Error inserting report: %v", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to create report")
			return
		}
		log.Printf("[CQRS-WRITE] Report %s written to WriteDB", reportID)

		// [CQRS - SYNC] Also insert into ReadDB for immediate consistency
		// (In a full CQRS, this would be done by consumer, but we also do it here for responsiveness)
		_, err = app.ReadDB.ExecContext(r.Context(),
			`INSERT INTO my_reports_view (report_id, reporter_user_id, content, category, visibility, current_status, created_at, last_status_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			reportID, claims.Sub, req.Content, category, visibility, "RECEIVED", now, now)
		if err != nil {
			log.Printf("[CQRS-SYNC] Error syncing to ReadDB: %v", err)
		}

		// [CQRS - SYNC] Also insert into public_reports_view if public
		if visibility == "PUBLIC" {
			app.ReadDB.ExecContext(r.Context(),
				`INSERT INTO public_reports_view (report_id, content, category, vote_count, created_at)
				 VALUES ($1, $2, $3, 0, $4)`,
				reportID, req.Content, category, now)
		}

		// Publish event for other services
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

// upvoteReportHandler handles upvoting a public report
// Uses: WriteDB (COMMAND) + ReadDB (for check + sync)
func upvoteReportHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)
		vars := mux.Vars(r)
		reportID := vars["id"]

		// [CQRS - READ] Check if report exists and is public (from WriteDB for authoritative check)
		var visibility string
		err := app.WriteDB.QueryRowContext(r.Context(),
			`SELECT visibility FROM reports WHERE report_id = $1`, reportID).Scan(&visibility)
		if err == sql.ErrNoRows {
			respondWithError(w, http.StatusNotFound, "Report not found")
			return
		}
		if visibility != "PUBLIC" {
			respondWithError(w, http.StatusBadRequest, "Can only upvote public reports")
			return
		}

		// [CQRS - COMMAND] Insert vote into WriteDB
		_, err = app.WriteDB.ExecContext(r.Context(),
			`INSERT INTO votes (report_id, voter_user_id, created_at)
			 VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
			reportID, claims.Sub, time.Now())
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to upvote")
			return
		}
		log.Printf("[CQRS-WRITE] Vote for %s written to WriteDB", reportID)

		// [CQRS - SYNC] Update vote count in ReadDB
		var voteCount int
		app.WriteDB.QueryRowContext(r.Context(),
			`SELECT COUNT(*) FROM votes WHERE report_id = $1`, reportID).Scan(&voteCount)

		app.ReadDB.ExecContext(r.Context(),
			`UPDATE my_reports_view SET vote_count = $1 WHERE report_id = $2`, voteCount, reportID)
		app.ReadDB.ExecContext(r.Context(),
			`UPDATE public_reports_view SET vote_count = $1 WHERE report_id = $2`, voteCount, reportID)

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

// getMyReportsHandler returns citizen's own reports
// Uses: ReadDB (QUERY)

// getMyReportsHandler returns citizen's own reports
// Uses: ReadDB (QUERY)
func getMyReportsHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)

		// [CQRS - QUERY] Read from ReadDB with pagination
		rows, err := app.ReadDB.QueryContext(r.Context(),
			`SELECT report_id, content, visibility, current_status, vote_count, last_status_at, created_at
			 FROM my_reports_view WHERE reporter_user_id = $1 ORDER BY created_at DESC LIMIT 100`,
			claims.Sub)
		if err != nil {
			log.Printf("[CQRS-READ] Error querying: %v", err)
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

// getPublicReportsHandler returns all public reports
// Uses: ReadDB (QUERY)
func getPublicReportsHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// [CQRS - QUERY] Read from ReadDB.public_reports_view
		rows, err := app.ReadDB.QueryContext(r.Context(),
			`SELECT report_id, content, category, vote_count, created_at
			 FROM public_reports_view ORDER BY created_at DESC LIMIT 50`)
		if err != nil {
			log.Printf("[CQRS-READ] Error querying public reports: %v", err)
			respondWithError(w, http.StatusInternalServerError, "Failed to fetch reports")
			return
		}
		defer rows.Close()

		var reports []map[string]interface{}
		for rows.Next() {
			var reportID, content, category string
			var createdAt time.Time
			var voteCount int
			rows.Scan(&reportID, &content, &category, &voteCount, &createdAt)
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

// getPublicReportsHandler returns all public reports
// Uses: ReadDB (QUERY)

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
