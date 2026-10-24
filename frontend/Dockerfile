# ── Build stage ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Vite env vars are baked into the static bundle at build time.
# VITE_API_URL defaults to the same-origin "/api" path — nginx proxies it
# to the backend, so the backend address stays runtime-configurable
# through the BACKEND_URL env var instead of being baked into the JS.
ARG VITE_API_URL=/api
ARG VITE_BACKEND_URL
ARG VITE_APP_NAME
ARG VITE_APP_VERSION
ENV VITE_API_URL=$VITE_API_URL \
    VITE_BACKEND_URL=$VITE_BACKEND_URL \
    VITE_APP_NAME=$VITE_APP_NAME \
    VITE_APP_VERSION=$VITE_APP_VERSION

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Backend upstream for the /api proxy. The nginx entrypoint runs envsubst
# on /etc/nginx/templates/*.template at container start, so this is
# overridable at runtime:  docker run -e BACKEND_URL=http://host:8088 ...
# Must be scheme://host[:port] with no trailing slash or path.
ENV BACKEND_URL=http://backend:8088

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
