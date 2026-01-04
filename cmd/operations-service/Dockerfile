FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY internal/events/go.mod internal/events/go.sum ./internal/events/
COPY internal/eventbus/go.mod internal/eventbus/go.sum ./internal/eventbus/
COPY internal/domain/go.mod internal/domain/go.sum ./internal/domain/
COPY internal/auth/go.mod ./internal/auth/
COPY cmd/operations-service/go.mod cmd/operations-service/go.sum ./cmd/operations-service/

# Copy source
COPY internal/ ./internal/
COPY cmd/operations-service/ ./cmd/operations-service/

# Build
WORKDIR /app/cmd/operations-service
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /operations-service .

FROM alpine:3.18
RUN apk --no-cache add ca-certificates
COPY --from=builder /operations-service /operations-service
CMD ["/operations-service"]
