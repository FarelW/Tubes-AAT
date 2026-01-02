module reporting-service/cmd/operations-service

go 1.21

require (
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/google/uuid v1.4.0
	github.com/gorilla/mux v1.8.1
	github.com/lib/pq v1.10.9
	github.com/redis/go-redis/v9 v9.3.0
	reporting-service/internal/auth v0.0.0
	reporting-service/internal/eventbus v0.0.0
	reporting-service/internal/events v0.0.0
)

replace (
	reporting-service/internal/auth => ../../internal/auth
	reporting-service/internal/eventbus => ../../internal/eventbus
	reporting-service/internal/events => ../../internal/events
)
