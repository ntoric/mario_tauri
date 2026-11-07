package security

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// secretPrefix marks values stored with Encrypt so Decrypt can distinguish
// ciphertext from legacy plaintext rows.
const secretPrefix = "enc:v1:"

// Encryptor encrypts small secrets (API keys, gateway credentials) for
// storage in global_settings using AES-256-GCM. The 32-byte key is derived
// from a passphrase via SHA-256.
type Encryptor struct {
	key []byte
}

// NewEncryptor derives an AES-256 key from the passphrase. An empty
// passphrase still produces a deterministic key, but callers should always
// supply a real secret (e.g. ENCRYPTION_KEY or JWT_SECRET).
func NewEncryptor(passphrase string) *Encryptor {
	sum := sha256.Sum256([]byte(passphrase))
	return &Encryptor{key: sum[:]}
}

func (e *Encryptor) gcm() (cipher.AEAD, error) {
	block, err := aes.NewCipher(e.key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// Encrypt returns "enc:v1:<base64(nonce|ciphertext)>". Empty input stays
// empty so blank settings round-trip cleanly.
func (e *Encryptor) Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	gcm, err := e.gcm()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return secretPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt. Values without the enc:v1: prefix are treated as
// legacy plaintext and returned unchanged.
func (e *Encryptor) Decrypt(value string) (string, error) {
	if value == "" || !strings.HasPrefix(value, secretPrefix) {
		return value, nil
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, secretPrefix))
	if err != nil {
		return "", fmt.Errorf("invalid encrypted value: %w", err)
	}
	gcm, err := e.gcm()
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("invalid encrypted value: too short")
	}
	plain, err := gcm.Open(nil, raw[:gcm.NonceSize()], raw[gcm.NonceSize():], nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}
	return string(plain), nil
}
