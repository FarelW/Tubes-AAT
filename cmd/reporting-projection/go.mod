module reporting-service/cmd/reporting-projection

go 1.21

require (
	github.com/lib/pq v1.10.9
	github.com/redis/go-redis/v9 v9.3.0
	reporting-service/internal/eventbus v0.0.0
	reporting-service/internal/events v0.0.0
)

replace reporting-service/internal/events => ../../internal/events

replace reporting-service/internal/eventbus => ../../internal/eventbus

