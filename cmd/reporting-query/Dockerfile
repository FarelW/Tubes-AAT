# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install git for fetching dependencies
RUN apk add --no-cache git

# Copy query service
COPY cmd/reporting-query/ ./cmd/reporting-query/

WORKDIR /app/cmd/reporting-query
RUN go mod download
RUN go mod tidy

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/reporting-query .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/reporting-query .

# Expose port
EXPOSE 8081

# Run the binary
CMD ["./reporting-query"]
