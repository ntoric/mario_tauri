# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache gcc musl-dev linux-headers

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o server ./cmd/server/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -o migrate ./cmd/migrate/main.go

# Production stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies for USB support
RUN apk add --no-cache ca-certificates libusb

# Copy binary from builder
COPY --from=builder /app/server .
COPY --from=builder /app/migrate .

# Expose port
EXPOSE 8088

# Run the server
CMD ["./server"]
