package config

import (
	"os"
	"path/filepath"
	"strconv"

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

	jwtSecret := getEnv("JWT_SECRET", "your-secret-key-change-in-production")

	superadminUsername := getEnv("SUPERADMIN_USERNAME", "superadmin")
	superadminPassword := getEnv("SUPERADMIN_PASSWORD", "superadmin123")
	superadminName := getEnv("SUPERADMIN_NAME", "Super Administrator")

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
	}, nil
}

func getEnv(key, defaultVal string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultVal
}
