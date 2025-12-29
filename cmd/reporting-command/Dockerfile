# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git for fetching dependencies
RUN apk add --no-cache git

# Copy internal packages first
COPY internal/ ./internal/

# Copy command service
COPY cmd/reporting-command/ ./cmd/reporting-command/

# Initialize and download dependencies for internal packages
WORKDIR /app/internal/domain
RUN go mod download || true
RUN go mod tidy || true

WORKDIR /app/internal/events
RUN go mod download || true
RUN go mod tidy || true

WORKDIR /app/internal/eventbus
RUN go mod download || true
RUN go mod tidy || true

# Download and tidy dependencies for command service
WORKDIR /app/cmd/reporting-command
RUN go mod download
RUN go mod tidy

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/reporting-command .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/reporting-command .

# Expose port
EXPOSE 8080

# Run the binary
CMD ["./reporting-command"]
