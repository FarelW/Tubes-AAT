package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"reporting-service/internal/auth"
)

// setupRoutes configures all HTTP routes
func setupRoutes(app *App) {
	app.Router.HandleFunc("/health", healthHandler(app)).Methods("GET")
	app.Router.HandleFunc("/notifications/me", authMiddleware(getNotificationsHandler(app))).Methods("GET")
	app.Router.HandleFunc("/sla/status", getSLAStatusHandler(app)).Methods("GET")
	app.Router.HandleFunc("/sla/config", getSLAConfigHandler()).Methods("GET")
	app.Router.HandleFunc("/sla/config", setSLAConfigHandler()).Methods("POST")
}

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

func healthHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		respondWithJSON(w, http.StatusOK, map[string]string{
			"status":   "healthy",
			"service":  "workflow-service",
			"instance": app.InstanceID,
		})
	}
}

// getNotificationsHandler returns notifications for current user
func getNotificationsHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := r.Context().Value("claims").(*auth.Claims)

		rows, err := app.DB.QueryContext(r.Context(),
			`SELECT id, report_id, message, is_read, created_at
			 FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
			claims.Sub)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to fetch notifications")
			return
		}
		defer rows.Close()

		var notifications []map[string]interface{}
		for rows.Next() {
			var id int
			var reportID, message string
			var isRead bool
			var createdAt time.Time
			rows.Scan(&id, &reportID, &message, &isRead, &createdAt)
			notifications = append(notifications, map[string]interface{}{
				"id":         id,
				"report_id":  reportID,
				"message":    message,
				"is_read":    isRead,
				"created_at": createdAt,
			})
		}

		if notifications == nil {
			notifications = []map[string]interface{}{}
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"data":    notifications,
		})
	}
}

// getSLAStatusHandler returns SLA status for all reports
func getSLAStatusHandler(app *App) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := app.DB.QueryContext(r.Context(),
			`SELECT s.report_id, s.due_at, s.status, s.escalation_level, p.current_status
			 FROM sla_jobs s
			 LEFT JOIN report_status_projection p ON s.report_id = p.report_id
			 ORDER BY s.due_at ASC LIMIT 50`)
		if err != nil {
			respondWithError(w, http.StatusInternalServerError, "Failed to fetch SLA status")
			return
		}
		defer rows.Close()

		var jobs []map[string]interface{}
		for rows.Next() {
			var reportID, slaStatus string
			var currentStatus sql.NullString
			var dueAt time.Time
			var escalationLevel int
			rows.Scan(&reportID, &dueAt, &slaStatus, &escalationLevel, &currentStatus)
			jobs = append(jobs, map[string]interface{}{
				"report_id":        reportID,
				"due_at":           dueAt,
				"sla_status":       slaStatus,
				"escalation_level": escalationLevel,
				"current_status":   currentStatus.String,
				"is_overdue":       time.Now().After(dueAt) && slaStatus == "PENDING",
			})
		}

		if jobs == nil {
			jobs = []map[string]interface{}{}
		}

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"data":    jobs,
		})
	}
}

// getSLAConfigHandler returns current SLA duration
func getSLAConfigHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		duration := GetSLADuration()
		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success":          true,
			"sla_duration_sec": int(duration.Seconds()),
			"sla_duration_str": duration.String(),
		})
	}
}

// setSLAConfigHandler sets new SLA duration
func setSLAConfigHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			DurationSeconds int `json:"duration_seconds"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			respondWithError(w, http.StatusBadRequest, "Invalid request")
			return
		}

		if req.DurationSeconds < 10 {
			respondWithError(w, http.StatusBadRequest, "Duration must be at least 10 seconds")
			return
		}

		newDuration := time.Duration(req.DurationSeconds) * time.Second
		SetSLADuration(newDuration)

		respondWithJSON(w, http.StatusOK, map[string]interface{}{
			"success":          true,
			"message":          "SLA duration updated",
			"sla_duration_sec": req.DurationSeconds,
			"sla_duration_str": newDuration.String(),
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

