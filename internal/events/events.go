package events

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Event types matching the contract
const (
	ReportCreated       = "report.created"
	ReportStatusUpdated = "report.status.updated"
	ReportEscalated     = "report.escalated"
	ReportUpvoted       = "report.upvoted"
)

// Event represents a domain event
type Event struct {
	EventID   string          `json:"event_id"`
	EventType string          `json:"event_type"`
	ReportID  string          `json:"report_id"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp time.Time       `json:"timestamp"`
}

// ReportCreatedPayload - published when citizen creates a report
type ReportCreatedPayload struct {
	ReportID       string    `json:"report_id"`
	ReporterUserID string    `json:"reporter_user_id"`
	Visibility     string    `json:"visibility"`
	Content        string    `json:"content"`
	Category       string    `json:"category"`
	CreatedAt      time.Time `json:"created_at"`
}

// ReportStatusUpdatedPayload - published when officer updates status
type ReportStatusUpdatedPayload struct {
	ReportID    string    `json:"report_id"`
	OldStatus   string    `json:"old_status"`
	NewStatus   string    `json:"new_status"`
	OwnerAgency string    `json:"owner_agency"`
	ChangedAt   time.Time `json:"changed_at"`
}

// ReportEscalatedPayload - published when SLA breach occurs
type ReportEscalatedPayload struct {
	ReportID        string `json:"report_id"`
	Reason          string `json:"reason"`
	EscalationLevel int    `json:"escalation_level"`
}

// ReportUpvotedPayload - published when citizen upvotes a report
type ReportUpvotedPayload struct {
	ReportID    string    `json:"report_id"`
	VoterUserID string    `json:"voter_user_id"`
	CreatedAt   time.Time `json:"created_at"`
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

// ParsePayload parses the payload into the specified type
func (e *Event) ParsePayload(v interface{}) error {
	return json.Unmarshal(e.Payload, v)
}
