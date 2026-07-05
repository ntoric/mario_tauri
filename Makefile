.PHONY: up down build logs ps clean set-version release migrate db-migrate

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
	docker-compose logs -f db

ps:
	docker-compose ps

clean:
	docker-compose down -v --rmi all

# Database commands
db-shell:
	docker-compose exec db psql -U $${DB_USER:-postgres} -d $${DB_NAME:-cafe}

# Run migrations locally (uses .env from project root or backend/)
migrate:
	cd backend && go run ./cmd/migrate

# Run migrations inside the Docker backend container
db-migrate:
	docker-compose exec backend ./migrate

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

# ── Version Management ─────────────────────────────────────────────────
# Usage: make set-version VERSION=1.3.1
set-version:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make set-version VERSION=1.3.1"; exit 1; fi
	@echo "Setting version to $(VERSION) ..."
	@sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' frontend/src-tauri/tauri.conf.json
	@sed -i '' 's/^version = ".*"/version = "$(VERSION)"/' frontend/src-tauri/Cargo.toml
	@sed -i '' 's/"version": "[^"]*"/"version": "$(VERSION)"/' frontend/package.json
	@sed -i '' 's/^VITE_APP_VERSION=.*/VITE_APP_VERSION=$(VERSION)/' frontend/.env.development
	@sed -i '' 's/^VITE_APP_VERSION=.*/VITE_APP_VERSION=$(VERSION)/' frontend/.env.example
	@echo "Version updated to $(VERSION) in all files."

# ── Release ────────────────────────────────────────────────────────────
# Usage: make release VERSION=1.3.1
# Bumps version, commits, pushes to main, creates and pushes a git tag.
release: set-version
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=1.3.1"; exit 1; fi
	@echo "Committing version bump ..."
	@git add frontend/src-tauri/tauri.conf.json frontend/src-tauri/Cargo.toml frontend/package.json frontend/.env.development frontend/.env.example
	@if git diff --cached --quiet; then \
		echo "No version changes to commit (already at $(VERSION))."; \
	else \
		git commit -m "Bump version to $(VERSION)"; \
	fi
	@echo "Pushing to main ..."
	@git push origin main
	@echo "Creating and pushing tag v$(VERSION) ..."
	@git tag -f v$(VERSION)
	@git push origin v$(VERSION) -f
	@echo "Release v$(VERSION) pushed. Monitor: https://github.com/ntoric/mario_tauri/actions"
