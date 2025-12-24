package events

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Event types
const (
	ReportCreated = "ReportCreated"
	ReportUpdated = "ReportUpdated"
	ReportDeleted = "ReportDeleted"
)

// Event represents a domain event
type Event struct {
	EventID   string          `json:"event_id"`
	EventType string          `json:"event_type"`
	ReportID  string          `json:"report_id"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp time.Time       `json:"timestamp"`
}

// ReportCreatedPayload represents the payload for ReportCreated event
type ReportCreatedPayload struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ReportUpdatedPayload represents the payload for ReportUpdated event
type ReportUpdatedPayload struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Category    string    `json:"category"`
	Status      string    `json:"status"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ReportDeletedPayload represents the payload for ReportDeleted event
type ReportDeletedPayload struct {
	ID        string    `json:"id"`
	DeletedAt time.Time `json:"deleted_at"`
}

// NewEvent creates a new Event
func NewEvent(eventType string, reportID string, payload interface{}) (*Event, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	return &Event{
		EventID:   uuid.New().String(),
		EventType: eventType,
		ReportID:  reportID,
		Payload:   payloadBytes,
		Timestamp: time.Now(),
	}, nil
}

// ToJSON converts event to JSON bytes
func (e *Event) ToJSON() ([]byte, error) {
	return json.Marshal(e)
}

// FromJSON parses event from JSON bytes
func FromJSON(data []byte) (*Event, error) {
	var event Event
	err := json.Unmarshal(data, &event)
	if err != nil {
		return nil, err
	}
	return &event, nil
}

