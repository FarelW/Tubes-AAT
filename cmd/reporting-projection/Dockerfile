# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git for fetching dependencies
RUN apk add --no-cache git

# Copy internal packages first
COPY internal/ ./internal/

# Copy projection service
COPY cmd/reporting-projection/ ./cmd/reporting-projection/

# Initialize and download dependencies for internal packages
WORKDIR /app/internal/events
RUN go mod download || true
RUN go mod tidy || true

WORKDIR /app/internal/eventbus
RUN go mod download || true
RUN go mod tidy || true

# Download and tidy dependencies for projection service
WORKDIR /app/cmd/reporting-projection
RUN go mod download
RUN go mod tidy

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/reporting-projection .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/reporting-projection .

# Run the binary
CMD ["./reporting-projection"]
