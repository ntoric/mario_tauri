package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
)

const geminiBaseURL = "https://generativelanguage.googleapis.com/v1beta"

// defaultGeminiModel is used when no model has been configured yet.
const defaultGeminiModel = "gemini-2.0-flash"

// menuParsePrompt is sent to Gemini alongside the menu image/PDF. It asks for
// a strict, standardized JSON structure that the backend can parse directly.
const menuParsePrompt = `You are a menu parser. Analyze the provided menu image or PDF and extract every category, item and price exactly as printed.

Return ONLY a JSON object with this exact structure and nothing else (no markdown, no code fences, no commentary):
{
  "categories": [
    {
      "name": "<category name as printed, or 'Uncategorized' if none>",
      "description": "<short category description if present, otherwise empty string>",
      "items": [
        {
          "name": "<item name as printed>",
          "description": "<item description/subtitle if present, otherwise empty string>",
          "price": <numeric price as a number, 0 if not priced>,
          "hsnCode": "<HSN/SAC code if present, otherwise empty string>",
          "taxPercent": <tax percent as a number if present, otherwise 0>
        }
      ]
    }
  ]
}

Rules:
- Always include the "categories" array even if there is only one category.
- If the menu has no explicit categories, put all items under a single category named "Uncategorized".
- Prices must be numbers (e.g. 120, 99.5), never strings. Strip currency symbols.
- Group items under the category they belong to. Do not duplicate items.
- Preserve original spelling and casing of names.
- Do not invent data that is not in the menu.`

// ==========================================
// GEMINI CONFIG HANDLERS
// ==========================================

// GetGeminiConfig handles GET /api/system/gemini-config (superadmin only)
func (h *Handler) GetGeminiConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	apiKey, model, err := h.Repo.Gemini.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if model == "" {
		model = defaultGeminiModel
	}

	h.writeJSON(w, http.StatusOK, models.GeminiConfig{
		APIKey: apiKey,
		Model:  model,
	})
}

// UpdateGeminiConfig handles POST /api/system/gemini-config (superadmin only)
func (h *Handler) UpdateGeminiConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.GeminiConfigRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	apiKey := strings.TrimSpace(req.APIKey)
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = defaultGeminiModel
	}

	if err := h.Repo.Gemini.Save(r.Context(), apiKey, model); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Gemini configuration saved successfully",
		"config": models.GeminiConfig{
			APIKey: apiKey,
			Model:  model,
		},
	})
}

// ListGeminiModels handles GET /api/system/gemini-models (superadmin only)
// It calls the Gemini "list models" endpoint using the stored API key so the
// frontend model dropdown can be refreshed with currently available models.
func (h *Handler) ListGeminiModels(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	apiKey, _, err := h.Repo.Gemini.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if apiKey == "" {
		h.writeError(w, http.StatusBadRequest, "Gemini API key is not configured. Save an API key first.")
		return
	}

	url := geminiBaseURL + "/models?key=" + apiKey
	client := &http.Client{Timeout: 20 * time.Second}
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to create models request")
		return
	}
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, "Failed to contact Gemini API: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		h.writeError(w, http.StatusBadGateway, fmt.Sprintf("Gemini API returned %s: %s", resp.Status, strings.TrimSpace(string(body))))
		return
	}

	var listResp struct {
		Models []models.GeminiModel `json:"models"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&listResp); err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to parse Gemini models response")
		return
	}

	// Keep only models that support generateContent (the method we use for parsing).
	var filtered []models.GeminiModel
	for _, m := range listResp.Models {
		for _, method := range m.SupportedGenerationMethods {
			if method == "generateContent" {
				filtered = append(filtered, m)
				break
			}
		}
	}
	if filtered == nil {
		filtered = []models.GeminiModel{}
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"models": filtered,
	})
}

// ==========================================
// MENU PARSE HANDLER
// ==========================================

// ParseMenuImage handles POST /api/menu/parse (superadmin only)
// It forwards the uploaded menu image/PDF (as base64) to Gemini with a strict
// JSON prompt, parses the standardized response and returns both the structured
// menu and the raw model output for debugging.
func (h *Handler) ParseMenuImage(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.MenuParseRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if strings.TrimSpace(req.StoreID) == "" {
		h.writeError(w, http.StatusBadRequest, "storeId is required")
		return
	}
	if req.ImageBase64 == "" {
		h.writeError(w, http.StatusBadRequest, "imageBase64 is required")
		return
	}

	mimeType := strings.TrimSpace(req.MimeType)
	cleanBase64 := req.ImageBase64
	// Allow callers to pass a full data URL; strip the prefix if present.
	if strings.HasPrefix(cleanBase64, "data:") {
		if idx := strings.Index(cleanBase64, ";base64,"); idx != -1 {
			if mimeType == "" {
				mimeType = cleanBase64[len("data:"):idx]
			}
			cleanBase64 = cleanBase64[idx+len(";base64,"):]
		}
	}
	if mimeType == "" {
		mimeType = "image/jpeg"
	}

	apiKey, model, err := h.Repo.Gemini.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if apiKey == "" {
		h.writeError(w, http.StatusBadRequest, "Gemini API key is not configured. Set it in Developer Settings first.")
		return
	}
	if model == "" {
		model = defaultGeminiModel
	}

	raw, err := callGeminiGenerateContent(r.Context(), apiKey, model, mimeType, cleanBase64, menuParsePrompt)
	if err != nil {
		h.writeError(w, http.StatusBadGateway, "Gemini request failed: "+err.Error())
		return
	}

	menu, parseErr := parseMenuFromGeminiText(raw)
	if parseErr != nil {
		// Return the raw response so the admin can inspect what Gemini produced.
		h.writeJSON(w, http.StatusOK, models.MenuParseResponse{
			Menu:        models.ParsedMenu{Categories: []models.ParsedMenuCategory{}},
			RawResponse: raw,
			Model:       model,
		})
		return
	}

	h.writeJSON(w, http.StatusOK, models.MenuParseResponse{
		Menu:        *menu,
		RawResponse: raw,
		Model:       model,
	})
}

// callGeminiGenerateContent calls the Gemini generateContent endpoint with an
// inline_data part (image/PDF) plus a text prompt, requesting JSON output.
func callGeminiGenerateContent(ctx context.Context, apiKey, model, mimeType, base64Data, prompt string) (string, error) {
	url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", geminiBaseURL, model, apiKey)

	payload := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
					{"inline_data": map[string]interface{}{
						"mime_type": mimeType,
						"data":      base64Data,
					}},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"responseMimeType": "application/json",
			"temperature":      0,
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	client := &http.Client{Timeout: 90 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Gemini returned %s: %s", resp.Status, strings.TrimSpace(string(respBody)))
	}

	// Extract the text from candidates[0].content.parts[*].text
	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
	}
	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return string(respBody), nil // return raw so the admin can inspect
	}

	if len(geminiResp.Candidates) == 0 {
		if geminiResp.PromptFeedback.BlockReason != "" {
			return "", fmt.Errorf("request blocked by Gemini: %s", geminiResp.PromptFeedback.BlockReason)
		}
		return "", fmt.Errorf("Gemini returned no candidates")
	}

	var texts []string
	for _, p := range geminiResp.Candidates[0].Content.Parts {
		if p.Text != "" {
			texts = append(texts, p.Text)
		}
	}
	raw := strings.Join(texts, "\n")
	if strings.TrimSpace(raw) == "" {
		return "", fmt.Errorf("Gemini returned an empty response")
	}
	return raw, nil
}

// parseMenuFromGeminiText parses the standardized JSON menu returned by Gemini.
// It tolerates surrounding markdown fences and extracts the first JSON object.
func parseMenuFromGeminiText(raw string) (*models.ParsedMenu, error) {
	cleaned := extractJSONObject(raw)
	if cleaned == "" {
		return nil, fmt.Errorf("no JSON object found in response")
	}

	var menu models.ParsedMenu
	if err := json.Unmarshal([]byte(cleaned), &menu); err != nil {
		return nil, err
	}
	if menu.Categories == nil {
		menu.Categories = []models.ParsedMenuCategory{}
	}
	for i := range menu.Categories {
		if menu.Categories[i].Items == nil {
			menu.Categories[i].Items = []models.ParsedMenuItem{}
		}
	}
	return &menu, nil
}

// extractJSONObject finds the first '{' ... '}' balanced JSON object in the
// string, stripping any markdown code fences Gemini might still add.
func extractJSONObject(s string) string {
	s = strings.TrimSpace(s)
	// Strip ```json or ``` fences if present.
	if strings.HasPrefix(s, "```") {
		// Remove opening fence line.
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = strings.TrimSpace(s[idx+1:])
		}
		s = strings.TrimSuffix(s, "```")
		s = strings.TrimSpace(s)
	}

	start := strings.Index(s, "{")
	if start == -1 {
		return ""
	}
	depth := 0
	inStr := false
	escape := false
	for i := start; i < len(s); i++ {
		c := s[i]
		if inStr {
			if escape {
				escape = false
				continue
			}
			if c == '\\' {
				escape = true
				continue
			}
			if c == '"' {
				inStr = false
			}
			continue
		}
		switch c {
		case '"':
			inStr = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}
	return ""
}

// ==========================================
// BULK MENU CREATE HANDLER
// ==========================================

// BulkCreateMenu handles POST /api/menu/bulk (superadmin only)
// It inserts the provided categories and items for a store in a single
// transaction. When replaceExisting is true, all existing categories and items
// for the store are soft-deleted first.
func (h *Handler) BulkCreateMenu(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.BulkMenuRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	storeID := strings.TrimSpace(req.StoreID)
	if storeID == "" {
		h.writeError(w, http.StatusBadRequest, "storeId is required")
		return
	}
	if req.Categories == nil {
		req.Categories = []models.ParsedMenuCategory{}
	}

	catsAdded, itemsAdded, err := h.Repo.Menu.BulkCreate(r.Context(), storeID, req.ReplaceExisting, req.Categories)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, models.BulkMenuResponse{
		Message:         "Menu imported successfully",
		CategoriesAdded: catsAdded,
		ItemsAdded:      itemsAdded,
	})
}
