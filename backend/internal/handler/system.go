package handler

import (
	"io"
	"net/http"
	"strconv"
	"strings"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/repository"
)

// SystemReset handles POST /api/system/reset
func (h *Handler) SystemReset(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Only superadmin can perform system reset")
		return
	}

	var req models.SystemResetRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	params := repository.ResetParams{
		Users:      req.Users,
		Stores:     req.Stores,
		Categories: req.Categories,
		Items:      req.Items,
		Orders:     req.Orders,
		Tables:     req.Tables,
		Bills:      req.Bills,
	}

	results, err := h.Repo.System.Reset(r.Context(), params)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "System reset completed successfully",
		"resetResults": results,
	})
}

// GetStats handles GET /api/system/stats
func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" && claims.Role != "business_owner" && claims.Role != "business_admin" {
		h.writeError(w, http.StatusForbidden, "Access denied")
		return
	}

	stats, err := h.Repo.System.GetStats(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, stats)
}

// GetSystemConfig handles GET /api/system/config
func (h *Handler) GetSystemConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	settings, err := h.Repo.System.GetConfig(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	enabled := settings["cleanup_enabled"] == "true"
	intervalMins, _ := strconv.Atoi(settings["cleanup_interval_mins"])
	if intervalMins <= 0 {
		intervalMins = 60
	}

	var lastRun *string
	if val, ok := settings["cleanup_last_run"]; ok && val != "" {
		lastRun = &val
	}

	h.writeJSON(w, http.StatusOK, models.SystemConfigResponse{
		CleanupEnabled:      enabled,
		CleanupIntervalMins: intervalMins,
		CleanupLastRun:      lastRun,
	})
}

// UpdateSystemConfig handles POST /api/system/config
func (h *Handler) UpdateSystemConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.SystemConfigRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.CleanupIntervalMins <= 0 {
		h.writeError(w, http.StatusBadRequest, "cleanupIntervalMins must be a positive integer greater than 0")
		return
	}

	err := h.Repo.System.SaveConfig(r.Context(), req.CleanupEnabled, req.CleanupIntervalMins)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "System configuration updated successfully",
		"config": map[string]interface{}{
			"cleanupEnabled":      req.CleanupEnabled,
			"cleanupIntervalMins": req.CleanupIntervalMins,
		},
	})
}

// GetAppUpdate handles GET /api/app-update
func (h *Handler) GetAppUpdate(w http.ResponseWriter, r *http.Request) {
	platform := r.URL.Query().Get("platform")
	if platform == "" {
		platform = "mobile" // default to mobile
	}

	update, err := h.Repo.AppUpdate.Get(r.Context(), platform)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if update == nil {
		h.writeJSON(w, http.StatusOK, map[string]interface{}{
			"enabled": false,
		})
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"id":           update.ID,
		"platform":     update.Platform,
		"enabled":      update.Enabled,
		"version":      update.Version,
		"downloadUrl":  update.DownloadURL,
		"releaseNotes": update.ReleaseNotes,
		"createdAt":    update.CreatedAt,
		"updatedAt":    update.UpdatedAt,
	})
}

// GetAllAppUpdates handles GET /api/app-updates
func (h *Handler) GetAllAppUpdates(w http.ResponseWriter, r *http.Request) {
	updates, err := h.Repo.AppUpdate.GetAll(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Ensure we return an empty array instead of null
	if updates == nil {
		updates = []repository.AppUpdate{}
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"updates": updates,
	})
}

// UpdateAppUpdate handles POST /api/app-update
func (h *Handler) UpdateAppUpdate(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.AppUpdateRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.Platform == "" {
		h.writeError(w, http.StatusBadRequest, "Platform is required (mobile or desktop)")
		return
	}

	if req.Platform != "mobile" && req.Platform != "desktop" {
		h.writeError(w, http.StatusBadRequest, "Platform must be either 'mobile' or 'desktop'")
		return
	}

	if req.Version == "" {
		h.writeError(w, http.StatusBadRequest, "Version is required")
		return
	}

	if req.DownloadURL == "" {
		h.writeError(w, http.StatusBadRequest, "Download URL is required")
		return
	}

	update := &repository.AppUpdate{
		Platform:     req.Platform,
		Enabled:      req.Enabled,
		Version:      req.Version,
		DownloadURL:  req.DownloadURL,
		ReleaseNotes: &req.ReleaseNotes,
	}

	err := h.Repo.AppUpdate.CreateOrUpdate(r.Context(), update)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "App update configuration updated successfully",
		"update": map[string]interface{}{
			"id":           update.ID,
			"platform":     update.Platform,
			"enabled":      update.Enabled,
			"version":      update.Version,
			"downloadUrl":  update.DownloadURL,
			"releaseNotes": update.ReleaseNotes,
		},
	})
}

// GetSupportConfig handles GET /api/support-config (Public)
func (h *Handler) GetSupportConfig(w http.ResponseWriter, r *http.Request) {
	config, err := h.Repo.SupportConfig.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, config)
}

// UpdateSupportConfig handles POST /api/support-config
func (h *Handler) UpdateSupportConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.SupportConfigRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if err := h.Repo.SupportConfig.Save(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Support configuration updated successfully",
		"config": models.SupportConfig{
			Email:        req.Email,
			Phone:        req.Phone,
			WhatsAppLink: req.WhatsAppLink,
		},
	})
}

// GetUpdateRepoConfig handles GET /api/system/update-config (superadmin only)
func (h *Handler) GetUpdateRepoConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	repo, err := h.Repo.UpdateRepo.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.UpdateRepoConfig{GitHubRepo: repo})
}

// UpdateUpdateRepoConfig handles POST /api/system/update-config (superadmin only)
func (h *Handler) UpdateUpdateRepoConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.UpdateRepoConfigRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	repo := strings.TrimSpace(req.GitHubRepo)
	if repo == "" {
		h.writeError(w, http.StatusBadRequest, "githubRepo is required")
		return
	}

	// Basic validation: must be in owner/repo format
	if strings.Count(repo, "/") != 1 || strings.HasPrefix(repo, "/") || strings.HasSuffix(repo, "/") {
		h.writeError(w, http.StatusBadRequest, "githubRepo must be in 'owner/repo' format (e.g. ntoric/mario_tauri)")
		return
	}

	if err := h.Repo.UpdateRepo.Save(r.Context(), repo); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Update repository configuration saved successfully",
		"config": models.UpdateRepoConfig{
			GitHubRepo: repo,
		},
	})
}

// GetUpdateManifest handles GET /api/update/manifest (public)
// It proxies the latest.json manifest from the superadmin-configured GitHub repository
// so the Tauri updater can dynamically check a configurable repo at runtime.
func (h *Handler) GetUpdateManifest(w http.ResponseWriter, r *http.Request) {
	repo, err := h.Repo.UpdateRepo.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to read update repository configuration")
		return
	}

	if repo == "" {
		h.writeError(w, http.StatusNotFound, "Update repository is not configured")
		return
	}

	manifestURL := "https://github.com/" + repo + "/releases/latest/download/latest.json"

	client := &http.Client{}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, manifestURL, nil)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to create manifest request")
		return
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, "Failed to fetch update manifest from GitHub")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		h.writeError(w, http.StatusNotFound, "No update manifest found for the configured repository")
		return
	}
	if resp.StatusCode != http.StatusOK {
		h.writeError(w, http.StatusBadGateway, "GitHub returned non-200 status: "+resp.Status)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, resp.Body); err != nil {
		// Best-effort copy; headers already written
		return
	}
}
