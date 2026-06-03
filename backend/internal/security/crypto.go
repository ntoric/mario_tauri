package security

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/pbkdf2"
)

const (
	Iterations = 100000
	KeyLen     = 32
	SaltLen    = 16
)

// HashPassword hashes a password using PBKDF2-SHA256
func HashPassword(password string) (string, error) {
	salt := make([]byte, SaltLen)
	_, err := rand.Read(salt)
	if err != nil {
		return "", err
	}

	hash := pbkdf2.Key([]byte(password), salt, Iterations, KeyLen, sha256.New)
	
	saltHex := hex.EncodeToString(salt)
	hashHex := hex.EncodeToString(hash)

	return fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", Iterations, saltHex, hashHex), nil
}

// VerifyPassword checks a password against a PBKDF2 or legacy bcrypt hash
func VerifyPassword(storedHash, password string) (bool, error) {
	if !strings.HasPrefix(storedHash, "pbkdf2_sha256$") {
		// Legacy bcrypt verification
		err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(password))
		if err != nil {
			return false, nil
		}
		return true, nil
	}

	parts := strings.Split(storedHash, "$")
	if len(parts) != 4 {
		return false, fmt.Errorf("invalid stored hash format")
	}

	iterations, err := strconv.Atoi(parts[1])
	if err != nil {
		return false, fmt.Errorf("invalid iterations in hash: %w", err)
	}

	salt, err := hex.DecodeString(parts[2])
	if err != nil {
		return false, fmt.Errorf("invalid salt in hash: %w", err)
	}

	originalHash, err := hex.DecodeString(parts[3])
	if err != nil {
		return false, fmt.Errorf("invalid hash in hash: %w", err)
	}

	derivedHash := pbkdf2.Key([]byte(password), salt, iterations, KeyLen, sha256.New)

	return subtle.ConstantTimeCompare(originalHash, derivedHash) == 1, nil
}
