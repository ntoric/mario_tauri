package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost             string
	DBPort             int
	DBName             string
	DBUser             string
	DBPassword         string
	RedisAddr          string
	RedisPassword      string
	RedisDB            int
	JWTSecret          string
	Port               string
	SuperadminUsername string
	SuperadminPassword string
	SuperadminName     string
	AllowedOrigins     []string
}

var defaultAllowedOrigins = []string{
	"http://localhost:1420",
	"http://localhost:5173",
	"http://localhost:3000",
	"http://127.0.0.1:1420",
	"tauri://localhost",
}

func LoadConfig() (*Config, error) {
	// 1. Try walking up from the current working directory to find nearest .env
	wd, err := os.Getwd()
	if err == nil {
		dir := wd
		for i := 0; i < 5; i++ {
			envPath := filepath.Join(dir, ".env")
			if _, err := os.Stat(envPath); err == nil {
				_ = godotenv.Load(envPath)
				break
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	// 2. Try walking up from the executable path to find nearest .env (covers compiled binary runs)
	execPath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(execPath)
		for i := 0; i < 5; i++ {
			envPath := filepath.Join(dir, ".env")
			if _, err := os.Stat(envPath); err == nil {
				_ = godotenv.Load(envPath)
				break
			}
			parent := filepath.Dir(dir)
			if parent == dir {
				break
			}
			dir = parent
		}
	}

	// Fallback to local files if any
	_ = godotenv.Load(".env")
	_ = godotenv.Load("../.env")

	port := getEnv("PORT", "8088")
	dbHost := getEnv("DB_HOST", "localhost")
	dbPortStr := getEnv("DB_PORT", "5432")
	dbPort, err := strconv.Atoi(dbPortStr)
	if err != nil {
		dbPort = 5432
	}
	dbName := getEnv("DB_NAME", "postgres")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")
	redisAddr := getEnv("REDIS_ADDR", "localhost:6379")
	redisPassword := getEnv("REDIS_PASSWORD", "")
	redisDBStr := getEnv("REDIS_DB", "0")
	redisDB, err := strconv.Atoi(redisDBStr)
	if err != nil {
		redisDB = 0
	}

	jwtSecret := getEnv("JWT_SECRET", "")
	if jwtSecret == "" || jwtSecret == "your-secret-key-change-in-production" || jwtSecret == "CHANGE_ME_TO_A_STRONG_RANDOM_SECRET" {
		if getEnv("NODE_ENV", "development") == "production" {
			return nil, fmt.Errorf("SECURITY: JWT_SECRET must be set to a strong, unique value in production. Refusing to start with a default/empty secret")
		}
		jwtSecret = generateRandomSecret(32)
		log.Println("WARNING: JWT_SECRET is not set. Generated a random ephemeral secret. Set JWT_SECRET in .env for persistent sessions.")
	}

	superadminUsername := getEnv("SUPERADMIN_USERNAME", "superadmin")
	superadminPassword := getEnv("SUPERADMIN_PASSWORD", "")
	if superadminPassword == "" || superadminPassword == "superadmin123" || superadminPassword == "CHANGE_ME_TO_A_STRONG_PASSWORD" {
		if getEnv("NODE_ENV", "development") == "production" {
			return nil, fmt.Errorf("SECURITY: SUPERADMIN_PASSWORD must be changed from the default in production. Set a strong password in .env")
		}
		if superadminPassword == "" {
			superadminPassword = "superadmin123"
		}
		log.Println("WARNING: Using default superadmin password. Set SUPERADMIN_PASSWORD in .env for production use.")
	}
	superadminName := getEnv("SUPERADMIN_NAME", "Super Administrator")

	allowedOrigins := append([]string{}, defaultAllowedOrigins...)
	if port != "" {
		allowedOrigins = append(allowedOrigins, "http://localhost:"+port)
	}
	if envOrigins := getEnv("CORS_ALLOWED_ORIGINS", ""); envOrigins != "" {
		allowedOrigins = strings.Split(envOrigins, ",")
	}

	return &Config{
		DBHost:             dbHost,
		DBPort:             dbPort,
		DBName:             dbName,
		DBUser:             dbUser,
		DBPassword:         dbPassword,
		RedisAddr:          redisAddr,
		RedisPassword:      redisPassword,
		RedisDB:            redisDB,
		JWTSecret:          jwtSecret,
		Port:               port,
		SuperadminUsername: superadminUsername,
		SuperadminPassword: superadminPassword,
		SuperadminName:     superadminName,
		AllowedOrigins:     allowedOrigins,
	}, nil
}

func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}

func generateRandomSecret(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		panic("failed to generate random secret: " + err.Error())
	}
	return hex.EncodeToString(bytes)
}
