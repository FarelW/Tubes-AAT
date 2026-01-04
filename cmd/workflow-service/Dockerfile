FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY internal/events/go.mod internal/events/go.sum ./internal/events/
COPY internal/eventbus/go.mod internal/eventbus/go.sum ./internal/eventbus/
COPY internal/domain/go.mod internal/domain/go.sum ./internal/domain/
COPY internal/auth/go.mod ./internal/auth/
COPY cmd/workflow-service/go.mod cmd/workflow-service/go.sum ./cmd/workflow-service/

# Copy source
COPY internal/ ./internal/
COPY cmd/workflow-service/ ./cmd/workflow-service/

# Build
WORKDIR /app/cmd/workflow-service
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -o /workflow-service .

FROM alpine:3.18
RUN apk --no-cache add ca-certificates
COPY --from=builder /workflow-service /workflow-service
CMD ["/workflow-service"]
