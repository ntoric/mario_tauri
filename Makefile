.PHONY: up down build logs ps clean

# Docker Compose commands
up:
	docker-compose up -d

up-build:
	docker-compose up -d --build

down:
	docker-compose down

down-volumes:
	docker-compose down -v

build:
	docker-compose build

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-db:
	docker-compose logs -f postgres

ps:
	docker-compose ps

clean:
	docker-compose down -v --rmi all

# Database commands
db-shell:
	docker-compose exec postgres psql -U postgres -d cafe

db-migrate:
	docker-compose exec backend ./server migrate

# Health checks
health:
	@curl -s http://localhost:8088/api/health | jq .

# Development
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production
prod:
	docker-compose up -d

# Restart
restart: down up

restart-backend:
	docker-compose restart backend

# ── Tauri Desktop App ──────────────────────────────────────────────────
# Build using the native Rust printer (default)
tauri-dev:
	cd frontend && npm run tauri dev

tauri-build:
	cd frontend && npm run tauri build

# Build using the Go printer sidecar
tauri-go-printer: go-printer-build
	cd frontend/src-tauri && cargo build --features go-printer

# Build the Go printer sidecar binary (place next to Tauri binary)
go-printer-build:
	cd frontend/src-tauri/mario-printer && go build -o ../target/debug/mario-printer .

go-printer-build-windows:
	cd frontend/src-tauri/mario-printer && GOOS=windows GOARCH=amd64 go build -o ../target/release/mario-printer.exe .
