package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"

	"reporting-service/internal/auth"
	"reporting-service/internal/events"
)

// setupRoutes configures all HTTP routes
func setupRoutes(app *App) {
	app.Router.HandleFunc("/health", healthHandler(app)).Methods("GET")
	app.Router.HandleFunc("/auth/login", loginHandler()).Methods("POST")
	app.Router.HandleFunc("/cases/inbox", authMiddleware(getInboxHandler(app))).Methods("GET")
	app.Router.HandleFunc("/cases/{id}/status", authMiddleware(updateStatusHandler(app))).Methods("PATCH")
}

// authMiddleware validates JWT and ensures officer role
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

		// Only officers can access operations service
		if claims.Role != "officer" {
			respondWithError(w, http.StatusForbidden, "Only officers can access this service")
			return
		}

		ctx := context.WithValue(r.Context(), "claims", claims)
		next(w, r.WithContext(ctx))
	}
}

func healthHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respondWithJSON(w, http.StatusOK, map[string]string{
			"status":   "healthy",
			"service":  "operations-service",
			"instance": app.InstanceID,
		})
	}
}

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

// getInboxHandler returns cases for officer's agency
func getInboxHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)

		rows, err := app.DB.QueryContext(r.Context(),
			`SELECT report_id, owner_agency, status, content, reporter_user_id, visibility, created_at, updated_at
			 FROM cases WHERE owner_agency = $1 ORDER BY created_at DESC`,
			claims.Agency)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to fetch cases")
			return
		}
		defer rows.Close()

		var cases []map[string]interface{}
		for rows.Next() {
			var reportID, agency, status string
			var content, reporterUserID, visibility sql.NullString
			var createdAt, updatedAt time.Time
			rows.Scan(&reportID, &agency, &status, &content, &reporterUserID, &visibility, &createdAt, &updatedAt)

			caseData := map[string]interface{}{
				"report_id":    reportID,
				"owner_agency": agency,
				"status":       status,
				"created_at":   createdAt,
				"updated_at":   updatedAt,
			}

			// Only show reporter if not anonymous
			if visibility.Valid && visibility.String != "ANONYMOUS" {
				caseData["content"] = content.String
				caseData["reporter_user_id"] = reporterUserID.String
			} else {
				caseData["content"] = content.String
				caseData["reporter_user_id"] = "[ANONYMOUS]"
			}

			cases = append(cases, caseData)
		}

		if cases == nil {
			cases = []map[string]interface{}{}
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"agency":  claims.Agency,
			"data":    cases,
		})
	}
}

// updateStatusHandler updates case status
func updateStatusHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)
		vars := mux.Vars(r)
		reportID := vars["id"]

		var req struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondWithError(w, http.StatusBadRequest, "Invalid request body")
			return
		}

		// Validate status
		validStatuses := map[string]bool{"RECEIVED": true, "IN_PROGRESS": true, "RESOLVED": true}
		if !validStatuses[req.Status] {
			respondWithError(w, http.StatusBadRequest, "Invalid status. Must be: RECEIVED, IN_PROGRESS, or RESOLVED")
			return
		}

		// Check if case exists and belongs to officer's agency
		var ownerAgency, oldStatus string
		err := app.DB.QueryRowContext(r.Context(),
			`SELECT owner_agency, status FROM cases WHERE report_id = $1`, reportID).Scan(&ownerAgency, &oldStatus)
		if err == sql.ErrNoRows {
			respondWithError(w, http.StatusNotFound, "Case not found")
			return
		}

		// SECURITY: Check agency authorization
		if ownerAgency != claims.Agency {
			respondWithError(w, http.StatusForbidden, "You can only update cases for your agency")
			return
		}

		// Update status
		now := time.Now()
		_, err = app.DB.ExecContext(r.Context(),
			`UPDATE cases SET status = $1, updated_at = $2 WHERE report_id = $3`,
			req.Status, now, reportID)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to update status")
			return
		}

		// Insert status history
		app.DB.ExecContext(r.Context(),
			`INSERT INTO case_status_history (report_id, old_status, new_status, changed_by, changed_at)
			 VALUES ($1, $2, $3, $4, $5)`,
			reportID, oldStatus, req.Status, claims.Sub, now)

		// Publish event
		payload := events.ReportStatusUpdatedPayload{
			ReportID:    reportID,
			OldStatus:   oldStatus,
			NewStatus:   req.Status,
			OwnerAgency: ownerAgency,
			ChangedAt:   now,
		}
		event, _ := events.NewEvent(events.ReportStatusUpdated, reportID, payload)
		if err := app.EventBus.Publish(r.Context(), event); err != nil {
			log.Printf("Error publishing event: %v", err)
		} else {
			log.Printf("[EVENT] Published %s: report=%s, %s->%s", events.ReportStatusUpdated, reportID, oldStatus, req.Status)
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success":    true,
			"message":    "Status updated successfully",
			"report_id":  reportID,
			"old_status": oldStatus,
			"new_status": req.Status,
		})
	}
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, _ := json.Marshal(payload)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}

func respondWithError(w http.ResponseWriter, code int, message string) {
	respondWithJSON(w, code, map[string]interface{}{
		"success": false,
		"error":   message,
	})
}
