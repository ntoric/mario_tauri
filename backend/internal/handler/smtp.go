package handler

import (
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/smtp"
	"strings"

	"cafe-backend/internal/middleware"
	"cafe-backend/internal/models"
	"cafe-backend/internal/security"
)

// generateResetToken generates a cryptographically secure random token
func generateResetToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// formatFromAddress builds a RFC 5322 From header value, optionally including a
// display name. If name is empty, the bare email address is returned.
func formatFromAddress(name, email string) string {
	if name == "" {
		return email
	}
	// Quote the display name if it contains characters that require quoting,
	// otherwise emit it as-is. This keeps the header valid for typical names.
	if strings.ContainsAny(name, `"()<>@,;:\\.[]`) {
		name = `"` + strings.ReplaceAll(name, `"`, `\"`) + `"`
	}
	return fmt.Sprintf("%s <%s>", name, email)
}

// sendPasswordResetEmail sends a password reset email via SMTP
func (h *Handler) sendPasswordResetEmail(smtpCfg *models.SMTPConfig, toEmail, toName, token string) error {
	if smtpCfg.Host == "" || smtpCfg.Port == 0 {
		return fmt.Errorf("SMTP is not configured")
	}

	from := smtpCfg.From
	if from == "" {
		from = smtpCfg.Username
	}

	subject := "Password Reset Request"
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", h.getFrontendURL(), token)

	body := fmt.Sprintf(`Hello %s,

You requested a password reset for your account. Click the link below to reset your password:

%s

This link will expire in 1 hour.

If you did not request this reset, please ignore this email.

Best regards,
The Team`, toName, resetURL)

	msg := strings.Join([]string{
		"From: " + formatFromAddress(smtpCfg.FromName, from),
		"To: " + toEmail,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%d", smtpCfg.Host, smtpCfg.Port)
	auth := smtp.PlainAuth("", smtpCfg.Username, smtpCfg.Password, smtpCfg.Host)

	if smtpCfg.UseTLS {
		tlsConfig := &tls.Config{
			ServerName: smtpCfg.Host,
			MinVersion: tls.VersionTLS12,
		}
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			return fmt.Errorf("failed to connect to SMTP server: %w", err)
		}
		defer conn.Close()

		c, err := smtp.NewClient(conn, smtpCfg.Host)
		if err != nil {
			return fmt.Errorf("failed to create SMTP client: %w", err)
		}
		defer c.Quit()

		if err = c.Auth(auth); err != nil {
			return fmt.Errorf("SMTP auth failed: %w", err)
		}
		if err = c.Mail(from); err != nil {
			return fmt.Errorf("SMTP MAIL FROM failed: %w", err)
		}
		if err = c.Rcpt(toEmail); err != nil {
			return fmt.Errorf("SMTP RCPT TO failed: %w", err)
		}
		w, err := c.Data()
		if err != nil {
			return fmt.Errorf("SMTP DATA failed: %w", err)
		}
		if _, err = w.Write([]byte(msg)); err != nil {
			return fmt.Errorf("failed to write email body: %w", err)
		}
		if err = w.Close(); err != nil {
			return fmt.Errorf("failed to close SMTP data: %w", err)
		}
		return nil
	}

	return smtp.SendMail(addr, auth, from, []string{toEmail}, []byte(msg))
}

// getFrontendURL returns the frontend URL for reset links
func (h *Handler) getFrontendURL() string {
	if h.Cfg.FrontendURL != "" {
		return h.Cfg.FrontendURL
	}
	return "http://localhost:5173"
}

// GetSmtpConfig handles GET /api/smtp-settings
func (h *Handler) GetSmtpConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	config, err := h.Repo.SmtpConfig.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Don't return the password in the response
	hasPassword := config.Password != ""
	response := models.SMTPConfig{
		Host:     config.Host,
		Port:     config.Port,
		Username: config.Username,
		From:     config.From,
		FromName: config.FromName,
		UseTLS:   config.UseTLS,
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"host":        response.Host,
		"port":        response.Port,
		"username":    response.Username,
		"from":        response.From,
		"fromName":    response.FromName,
		"useTLS":      response.UseTLS,
		"hasPassword": hasPassword,
	})
}

// UpdateSmtpConfig handles POST /api/smtp-settings
func (h *Handler) UpdateSmtpConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req models.SMTPConfigRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.Host == "" || req.Port == 0 {
		h.writeError(w, http.StatusBadRequest, "SMTP host and port are required")
		return
	}

	// If password is empty, keep the existing password
	existing, err := h.Repo.SmtpConfig.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if req.Password == "" && existing != nil {
		req.Password = existing.Password
	}

	if err := h.Repo.SmtpConfig.Save(r.Context(), req); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "SMTP configuration saved successfully",
		"config": map[string]interface{}{
			"host":     req.Host,
			"port":     req.Port,
			"username": req.Username,
			"from":     req.From,
			"fromName": req.FromName,
			"useTLS":   req.UseTLS,
		},
	})
}

// TestSmtpConfig handles POST /api/smtp-settings/test
func (h *Handler) TestSmtpConfig(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserFromContext(r.Context())
	if !ok {
		h.writeError(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if claims.Role != "superadmin" {
		h.writeError(w, http.StatusForbidden, "Access denied. Superadmin role required.")
		return
	}

	var req struct {
		ToEmail string `json:"toEmail"`
	}
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.ToEmail == "" {
		h.writeError(w, http.StatusBadRequest, "toEmail is required")
		return
	}

	smtpCfg, err := h.Repo.SmtpConfig.Get(r.Context())
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if smtpCfg.Host == "" {
		h.writeError(w, http.StatusBadRequest, "SMTP is not configured")
		return
	}

	// Send a test email
	from := smtpCfg.From
	if from == "" {
		from = smtpCfg.Username
	}

	subject := "SMTP Test Email"
	body := "This is a test email from your Mario Cafe system. If you received this, your SMTP settings are working correctly."

	msg := strings.Join([]string{
		"From: " + formatFromAddress(smtpCfg.FromName, from),
		"To: " + req.ToEmail,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%d", smtpCfg.Host, smtpCfg.Port)
	auth := smtp.PlainAuth("", smtpCfg.Username, smtpCfg.Password, smtpCfg.Host)

	if smtpCfg.UseTLS {
		tlsConfig := &tls.Config{
			ServerName: smtpCfg.Host,
			MinVersion: tls.VersionTLS12,
		}
		conn, err := tls.Dial("tcp", addr, tlsConfig)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, "Failed to connect to SMTP server: "+err.Error())
			return
		}
		defer conn.Close()

		c, err := smtp.NewClient(conn, smtpCfg.Host)
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, "Failed to create SMTP client: "+err.Error())
			return
		}
		defer c.Quit()

		if err = c.Auth(auth); err != nil {
			h.writeError(w, http.StatusInternalServerError, "SMTP auth failed: "+err.Error())
			return
		}
		if err = c.Mail(from); err != nil {
			h.writeError(w, http.StatusInternalServerError, "SMTP MAIL FROM failed: "+err.Error())
			return
		}
		if err = c.Rcpt(req.ToEmail); err != nil {
			h.writeError(w, http.StatusInternalServerError, "SMTP RCPT TO failed: "+err.Error())
			return
		}
		w2, err := c.Data()
		if err != nil {
			h.writeError(w, http.StatusInternalServerError, "SMTP DATA failed: "+err.Error())
			return
		}
		if _, err = w2.Write([]byte(msg)); err != nil {
			h.writeError(w, http.StatusInternalServerError, "Failed to write email body: "+err.Error())
			return
		}
		if err = w2.Close(); err != nil {
			h.writeError(w, http.StatusInternalServerError, "Failed to close SMTP data: "+err.Error())
			return
		}
	} else {
		if err := smtp.SendMail(addr, auth, from, []string{req.ToEmail}, []byte(msg)); err != nil {
			h.writeError(w, http.StatusInternalServerError, "Failed to send test email: "+err.Error())
			return
		}
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Test email sent successfully"})
}

// ForgotPassword handles POST /api/auth/forgot-password (Public)
func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req models.ForgotPasswordRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.Email == "" {
		h.writeError(w, http.StatusBadRequest, "Email is required")
		return
	}

	// Always return success to prevent email enumeration
	successResp := map[string]string{"message": "If an account with that email exists, a password reset link has been sent."}

	// Find user by email
	user, err := h.Repo.User.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		h.writeJSON(w, http.StatusOK, successResp)
		return
	}
	if user == nil {
		// Don't reveal that the email doesn't exist
		h.writeJSON(w, http.StatusOK, successResp)
		return
	}

	// Get SMTP config
	smtpCfg, err := h.Repo.SmtpConfig.Get(r.Context())
	if err != nil || smtpCfg.Host == "" {
		h.writeError(w, http.StatusServiceUnavailable, "Email service is not configured. Please contact your administrator.")
		return
	}

	// Generate reset token
	token, err := generateResetToken()
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to generate reset token")
		return
	}

	// Save token
	if err := h.Repo.User.SetPasswordResetToken(r.Context(), user.ID, token); err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to save reset token")
		return
	}

	// Send email
	if err := h.sendPasswordResetEmail(smtpCfg, user.Email, user.Name, token); err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to send password reset email: "+err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, successResp)
}

// ResetPasswordWithToken handles POST /api/auth/reset-password (Public)
func (h *Handler) ResetPasswordWithToken(w http.ResponseWriter, r *http.Request) {
	var req models.ResetPasswordWithTokenRequest
	if err := h.readJSON(r, &req); err != nil {
		h.writeError(w, http.StatusBadRequest, "Invalid JSON payload")
		return
	}

	if req.Token == "" || req.Password == "" {
		h.writeError(w, http.StatusBadRequest, "Token and password are required")
		return
	}

	if len(req.Password) < 6 {
		h.writeError(w, http.StatusBadRequest, "Password must be at least 6 characters")
		return
	}

	// Validate token and get user ID (token is consumed/deleted)
	userID, err := h.Repo.User.GetUserIDByResetToken(r.Context(), req.Token)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if userID == "" {
		h.writeError(w, http.StatusBadRequest, "Invalid or expired reset token")
		return
	}

	// Hash new password
	hashedPassword, err := security.HashPassword(req.Password)
	if err != nil {
		h.writeError(w, http.StatusInternalServerError, "Failed to hash new password")
		return
	}

	if err := h.Repo.User.UpdatePassword(r.Context(), userID, string(hashedPassword)); err != nil {
		h.writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.writeJSON(w, http.StatusOK, map[string]string{"message": "Password reset successfully"})
}
