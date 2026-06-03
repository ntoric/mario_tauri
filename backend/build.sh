#!/bin/bash

# Build script for cafe-backend (current platform only)
# Usage: ./build.sh

set -e

echo "Building cafe-backend for current platform..."

# Create build directory
mkdir -p build

# Detect current platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Convert architecture names
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
    ARCH="arm64"
elif [ "$ARCH" = "x86_64" ]; then
    ARCH="amd64"
fi

# Set binary name
BINARY_NAME="cafe-backend-${OS}-${ARCH}"
if [ "$OS" = "windows" ]; then
    BINARY_NAME="${BINARY_NAME}.exe"
fi

echo "Building for $OS $ARCH..."
go build -o "build/${BINARY_NAME}" ./cmd/server

echo "Build complete! Binary: build/${BINARY_NAME}"
