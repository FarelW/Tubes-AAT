FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY internal/events/go.mod internal/events/go.sum ./internal/events/
COPY internal/eventbus/go.mod internal/eventbus/go.sum ./internal/eventbus/
COPY internal/domain/go.mod internal/domain/go.sum ./internal/domain/
COPY internal/auth/go.mod ./internal/auth/
COPY cmd/reporting-service/go.mod cmd/reporting-service/go.sum ./cmd/reporting-service/

# Copy source
COPY internal/ ./internal/
COPY cmd/reporting-service/ ./cmd/reporting-service/

# Build
WORKDIR /app/cmd/reporting-service
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /reporting-service .

FROM alpine:3.18
RUN apk --no-cache add ca-certificates
COPY --from=builder /reporting-service /reporting-service
CMD ["/reporting-service"]
