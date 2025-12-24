package eventbus

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
	"reporting-service/internal/events"
)

const (
	StreamName    = "report-events"
	ConsumerGroup = "projection-service"
)

// RedisEventBus implements event bus using Redis Streams
type RedisEventBus struct {
	client *redis.Client
}

// NewRedisEventBus creates a new Redis event bus
func NewRedisEventBus(host string, port string) (*RedisEventBus, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", host, port),
		Password: "",
		DB:       0,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	return &RedisEventBus{client: client}, nil
}

// Publish publishes an event to the stream
func (r *RedisEventBus) Publish(ctx context.Context, event *events.Event) error {
	eventJSON, err := event.ToJSON()
	if err != nil {
		return fmt.Errorf("failed to serialize event: %w", err)
	}

	args := &redis.XAddArgs{
		Stream: StreamName,
		Values: map[string]interface{}{
			"event_id":   event.EventID,
			"event_type": event.EventType,
			"report_id":  event.ReportID,
			"payload":    string(eventJSON),
			"timestamp":  event.Timestamp.Format(time.RFC3339),
		},
	}

	_, err = r.client.XAdd(ctx, args).Result()
	if err != nil {
		return fmt.Errorf("failed to publish event: %w", err)
	}

	log.Printf("Published event: %s for report: %s", event.EventType, event.ReportID)
	return nil
}

// CreateConsumerGroup creates a consumer group if it doesn't exist
func (r *RedisEventBus) CreateConsumerGroup(ctx context.Context, consumerGroup string) error {
	// Try to create the stream and consumer group
	err := r.client.XGroupCreateMkStream(ctx, StreamName, consumerGroup, "0").Err()
	if err != nil {
		// Ignore error if group already exists
		if err.Error() != "BUSYGROUP Consumer Group name already exists" {
			return fmt.Errorf("failed to create consumer group: %w", err)
		}
	}
	return nil
}

// Consume consumes events from the stream
func (r *RedisEventBus) Consume(ctx context.Context, consumerGroup, consumerName string, handler func(*events.Event) error) error {
	// Create consumer group if not exists
	if err := r.CreateConsumerGroup(ctx, consumerGroup); err != nil {
		return err
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			// Read new messages - increased batch size and reduced block time for faster processing
			streams, err := r.client.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    consumerGroup,
				Consumer: consumerName,
				Streams:  []string{StreamName, ">"},
				Count:    50,  // Increased from 10 to 50 for better throughput
				Block:    1 * time.Second,  // Reduced from 5s to 1s for faster response
			}).Result()

			if err != nil {
				if err == redis.Nil {
					continue
				}
				log.Printf("Error reading from stream: %v", err)
				time.Sleep(1 * time.Second)
				continue
			}

			for _, stream := range streams {
				for _, message := range stream.Messages {
					event, err := r.parseMessage(message)
					if err != nil {
						log.Printf("Error parsing message: %v", err)
						continue
					}

					// Process the event
					if err := handler(event); err != nil {
						log.Printf("Error processing event %s: %v", event.EventID, err)
						continue
					}

					// Acknowledge the message
					if err := r.client.XAck(ctx, StreamName, consumerGroup, message.ID).Err(); err != nil {
						log.Printf("Error acknowledging message: %v", err)
					}
				}
			}
		}
	}
}

// parseMessage parses a Redis stream message into an Event
func (r *RedisEventBus) parseMessage(message redis.XMessage) (*events.Event, error) {
	payload, ok := message.Values["payload"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid payload in message")
	}

	var event events.Event
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return nil, fmt.Errorf("failed to unmarshal event: %w", err)
	}

	return &event, nil
}

// Close closes the Redis connection
func (r *RedisEventBus) Close() error {
	return r.client.Close()
}

// GetPendingCount returns the number of pending messages
func (r *RedisEventBus) GetPendingCount(ctx context.Context, consumerGroup string) (int64, error) {
	info, err := r.client.XPending(ctx, StreamName, consumerGroup).Result()
	if err != nil {
		return 0, err
	}
	return info.Count, nil
}

