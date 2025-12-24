package domain

import (
	"time"

	"github.com/google/uuid"
)

// Report represents the main domain entity
type Report struct {
	ID          uuid.UUID `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ReportStatus constants
const (
	StatusPending    = "pending"
	StatusInProgress = "in_progress"
	StatusResolved   = "resolved"
	StatusRejected   = "rejected"
)

// ValidCategories represents valid report categories
var ValidCategories = []string{
	"kebersihan",
	"kriminalitas",
	"infrastruktur",
	"kesehatan",
	"keamanan",
	"lainnya",
}

// ValidStatuses represents valid report statuses
var ValidStatuses = []string{
	StatusPending,
	StatusInProgress,
	StatusResolved,
	StatusRejected,
}

// IsValidCategory checks if category is valid
func IsValidCategory(category string) bool {
	for _, c := range ValidCategories {
		if c == category {
			return true
		}
	}
	return false
}

// IsValidStatus checks if status is valid
func IsValidStatus(status string) bool {
	for _, s := range ValidStatuses {
		if s == status {
			return true
		}
	}
	return false
}

// NewReport creates a new Report with default values
func NewReport(title, description, category string) *Report {
	now := time.Now()
	return &Report{
		ID:          uuid.New(),
		Title:       title,
		Description: description,
		Category:    category,
		Status:      StatusPending,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
}

