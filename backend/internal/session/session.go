package session

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	keyPrefix   = "session:"
	indexPrefix = "user_sessions:"
	defaultTTL  = 24 * time.Hour
)

var ErrNotFound = errors.New("session not found")

// Data is the session payload stored server-side in Redis. Clients only ever
// hold the opaque token; all session state lives here so it can be revoked,
// expires independently of any client copy, and cannot be forged.
type Data struct {
	UserID    string `json:"user_id"`
	Username  string `json:"username"`
	Role      string `json:"role"`
	StoreID   string `json:"store_id"`
	CreatedAt int64  `json:"created_at"`
}

// Store manages sessions in Redis with a sliding TTL: every validated request
// extends the session, and sessions expire after ttl of inactivity.
type Store struct {
	client *redis.Client
	ttl    time.Duration
}

func New(client *redis.Client, ttl time.Duration) *Store {
	if ttl <= 0 {
		ttl = defaultTTL
	}
	return &Store{client: client, ttl: ttl}
}

func sessionKey(token string) string { return keyPrefix + token }
func indexKey(userID string) string  { return indexPrefix + userID }

// Create issues a new opaque session token and records it under the user's
// session index so all of a user's sessions can be revoked together.
func (s *Store) Create(ctx context.Context, d Data) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(buf)
	d.CreatedAt = time.Now().Unix()

	payload, err := json.Marshal(d)
	if err != nil {
		return "", err
	}

	pipe := s.client.TxPipeline()
	pipe.Set(ctx, sessionKey(token), payload, s.ttl)
	pipe.SAdd(ctx, indexKey(d.UserID), token)
	pipe.Expire(ctx, indexKey(d.UserID), s.ttl)
	if _, err := pipe.Exec(ctx); err != nil {
		return "", err
	}
	return token, nil
}

// Get validates a token and refreshes its TTL (sliding expiration).
func (s *Store) Get(ctx context.Context, token string) (*Data, error) {
	raw, err := s.client.Get(ctx, sessionKey(token)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	var d Data
	if err := json.Unmarshal(raw, &d); err != nil {
		return nil, err
	}
	_ = s.client.Expire(ctx, sessionKey(token), s.ttl).Err()
	return &d, nil
}

// Delete revokes a single session.
func (s *Store) Delete(ctx context.Context, token string) {
	_ = s.client.Del(ctx, sessionKey(token)).Err()
}

// DeleteUserSessions revokes every session belonging to a user (password
// reset, account deactivation, forced logout).
func (s *Store) DeleteUserSessions(ctx context.Context, userID string) {
	tokens, err := s.client.SMembers(ctx, indexKey(userID)).Result()
	if err == nil && len(tokens) > 0 {
		keys := make([]string, 0, len(tokens))
		for _, t := range tokens {
			keys = append(keys, sessionKey(t))
		}
		_ = s.client.Del(ctx, keys...).Err()
	}
	_ = s.client.Del(ctx, indexKey(userID)).Err()
}
