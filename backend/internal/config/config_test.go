package config

import (
	"os"
	"testing"
)

func TestGetEnv_ReturnsValue(t *testing.T) {
	os.Setenv("TEST_CONFIG_KEY", "hello")
	defer os.Unsetenv("TEST_CONFIG_KEY")

	got := getEnv("TEST_CONFIG_KEY", "default")
	if got != "hello" {
		t.Errorf("getEnv() = %q, want %q", got, "hello")
	}
}

func TestGetEnv_ReturnsDefault(t *testing.T) {
	os.Unsetenv("TEST_CONFIG_MISSING_KEY")

	got := getEnv("TEST_CONFIG_MISSING_KEY", "fallback")
	if got != "fallback" {
		t.Errorf("getEnv() = %q, want %q", got, "fallback")
	}
}

func TestGetEnv_EmptyValueReturnsEmpty(t *testing.T) {
	os.Setenv("TEST_CONFIG_EMPTY", "")
	defer os.Unsetenv("TEST_CONFIG_EMPTY")

	got := getEnv("TEST_CONFIG_EMPTY", "default")
	if got != "" {
		t.Errorf("getEnv() = %q, want empty string", got)
	}
}

func TestLoadConfig_Defaults(t *testing.T) {
	// Unset all env vars to test defaults
	envVars := []string{
		"PORT", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD",
		"REDIS_ADDR", "REDIS_PASSWORD", "REDIS_DB",
		"JWT_SECRET", "SUPERADMIN_USERNAME", "SUPERADMIN_PASSWORD", "SUPERADMIN_NAME",
	}
	for _, v := range envVars {
		os.Unsetenv(v)
	}

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.Port != "8088" {
		t.Errorf("Port = %q, want %q", cfg.Port, "8088")
	}
	if cfg.DBHost != "localhost" {
		t.Errorf("DBHost = %q, want %q", cfg.DBHost, "localhost")
	}
	if cfg.DBPort != 5432 {
		t.Errorf("DBPort = %d, want %d", cfg.DBPort, 5432)
	}
	if cfg.DBName != "postgres" {
		t.Errorf("DBName = %q, want %q", cfg.DBName, "postgres")
	}
	if cfg.DBUser != "postgres" {
		t.Errorf("DBUser = %q, want %q", cfg.DBUser, "postgres")
	}
	if cfg.DBPassword != "postgres" {
		t.Errorf("DBPassword = %q, want %q", cfg.DBPassword, "postgres")
	}
	if cfg.RedisAddr != "localhost:6379" {
		t.Errorf("RedisAddr = %q, want %q", cfg.RedisAddr, "localhost:6379")
	}
	if cfg.RedisPassword != "" {
		t.Errorf("RedisPassword = %q, want empty", cfg.RedisPassword)
	}
	if cfg.RedisDB != 0 {
		t.Errorf("RedisDB = %d, want %d", cfg.RedisDB, 0)
	}
	if cfg.JWTSecret != "your-secret-key-change-in-production" {
		t.Errorf("JWTSecret = %q, want default", cfg.JWTSecret)
	}
	if cfg.SuperadminUsername != "superadmin" {
		t.Errorf("SuperadminUsername = %q, want %q", cfg.SuperadminUsername, "superadmin")
	}
	if cfg.SuperadminPassword != "superadmin123" {
		t.Errorf("SuperadminPassword = %q, want %q", cfg.SuperadminPassword, "superadmin123")
	}
	if cfg.SuperadminName != "Super Administrator" {
		t.Errorf("SuperadminName = %q, want %q", cfg.SuperadminName, "Super Administrator")
	}
}

func TestLoadConfig_CustomValues(t *testing.T) {
	os.Setenv("PORT", "9090")
	os.Setenv("DB_HOST", "dbhost.example.com")
	os.Setenv("DB_PORT", "5433")
	os.Setenv("DB_NAME", "mydb")
	os.Setenv("DB_USER", "myuser")
	os.Setenv("DB_PASSWORD", "mypass")
	os.Setenv("REDIS_ADDR", "redis.example.com:6380")
	os.Setenv("REDIS_PASSWORD", "redispass")
	os.Setenv("REDIS_DB", "3")
	os.Setenv("JWT_SECRET", "supersecret")
	os.Setenv("SUPERADMIN_USERNAME", "admin")
	os.Setenv("SUPERADMIN_PASSWORD", "admin123")
	os.Setenv("SUPERADMIN_NAME", "Admin")

	defer func() {
		for _, v := range []string{
			"PORT", "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD",
			"REDIS_ADDR", "REDIS_PASSWORD", "REDIS_DB",
			"JWT_SECRET", "SUPERADMIN_USERNAME", "SUPERADMIN_PASSWORD", "SUPERADMIN_NAME",
		} {
			os.Unsetenv(v)
		}
	}()

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.Port != "9090" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9090")
	}
	if cfg.DBHost != "dbhost.example.com" {
		t.Errorf("DBHost = %q, want %q", cfg.DBHost, "dbhost.example.com")
	}
	if cfg.DBPort != 5433 {
		t.Errorf("DBPort = %d, want %d", cfg.DBPort, 5433)
	}
	if cfg.DBName != "mydb" {
		t.Errorf("DBName = %q, want %q", cfg.DBName, "mydb")
	}
	if cfg.RedisAddr != "redis.example.com:6380" {
		t.Errorf("RedisAddr = %q, want %q", cfg.RedisAddr, "redis.example.com:6380")
	}
	if cfg.RedisPassword != "redispass" {
		t.Errorf("RedisPassword = %q, want %q", cfg.RedisPassword, "redispass")
	}
	if cfg.RedisDB != 3 {
		t.Errorf("RedisDB = %d, want %d", cfg.RedisDB, 3)
	}
	if cfg.JWTSecret != "supersecret" {
		t.Errorf("JWTSecret = %q, want %q", cfg.JWTSecret, "supersecret")
	}
	if cfg.SuperadminUsername != "admin" {
		t.Errorf("SuperadminUsername = %q, want %q", cfg.SuperadminUsername, "admin")
	}
}

func TestLoadConfig_InvalidDBPort(t *testing.T) {
	os.Setenv("DB_PORT", "notanumber")
	defer os.Unsetenv("DB_PORT")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.DBPort != 5432 {
		t.Errorf("DBPort = %d, want %d (default on invalid)", cfg.DBPort, 5432)
	}
}

func TestLoadConfig_InvalidRedisDB(t *testing.T) {
	os.Setenv("REDIS_DB", "invalid")
	defer os.Unsetenv("REDIS_DB")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if cfg.RedisDB != 0 {
		t.Errorf("RedisDB = %d, want %d (default on invalid)", cfg.RedisDB, 0)
	}
}
