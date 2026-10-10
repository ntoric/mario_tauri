# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Cloud backend URL is baked into the bundle at build time.
# Override with: docker build --build-arg VITE_API_URL=https://your-backend/api .
ARG VITE_API_URL=https://mario-v2-backend.ntoric.com/api
ARG VITE_BACKEND_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BACKEND_URL=${VITE_BACKEND_URL:-$VITE_API_URL}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application (mode production loads .env.production; the env vars
# above take precedence over the file values)
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
