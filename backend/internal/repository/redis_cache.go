package repository

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisCache struct {
	client *redis.Client
}

func NewRedisCache(addr, password string, db int) *RedisCache {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
	return &RedisCache{client: client}
}

func (r *RedisCache) Ping(ctx context.Context) error {
	return r.client.Ping(ctx).Err()
}

// Client exposes the underlying Redis client for subsystems that need commands
// beyond the cache helpers (e.g. the session store).
func (r *RedisCache) Client() *redis.Client {
	return r.client
}

func (r *RedisCache) Get(ctx context.Context, key string) ([]byte, bool) {
	val, err := r.client.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	return val, true
}

func (r *RedisCache) Set(ctx context.Context, key string, value []byte, ttl time.Duration) {
	_ = r.client.Set(ctx, key, value, ttl).Err()
}

func (r *RedisCache) Delete(ctx context.Context, key string) {
	_ = r.client.Del(ctx, key).Err()
}

func (r *RedisCache) DeleteByPrefix(ctx context.Context, prefix string) {
	var cursor uint64
	for {
		keys, nextCursor, err := r.client.Scan(ctx, cursor, prefix+"*", 100).Result()
		if err != nil {
			return
		}
		if len(keys) > 0 {
			_ = r.client.Del(ctx, keys...).Err()
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
}

func (r *RedisCache) RPush(ctx context.Context, key string, value []byte) error {
	return r.client.RPush(ctx, key, value).Err()
}

func (r *RedisCache) LPop(ctx context.Context, key string) ([]byte, error) {
	return r.client.LPop(ctx, key).Bytes()
}

func (r *RedisCache) LRange(ctx context.Context, key string, start, stop int64) ([][]byte, error) {
	vals, err := r.client.LRange(ctx, key, start, stop).Result()
	if err != nil {
		return nil, err
	}
	out := make([][]byte, 0, len(vals))
	for _, v := range vals {
		out = append(out, []byte(v))
	}
	return out, nil
}

// LRem removes every list element equal to value (count = 0).
func (r *RedisCache) LRem(ctx context.Context, key string, value []byte) error {
	return r.client.LRem(ctx, key, 0, value).Err()
}

// SetNX sets key to value with the given TTL only when the key does not exist.
// Returns true when the key was set (i.e. the caller won the claim).
func (r *RedisCache) SetNX(ctx context.Context, key, value string, ttl time.Duration) (bool, error) {
	return r.client.SetNX(ctx, key, value, ttl).Result()
}

func (r *RedisCache) SetEX(ctx context.Context, key string, value []byte, ttl time.Duration) error {
	return r.client.Set(ctx, key, value, ttl).Err()
}

func (r *RedisCache) Del(ctx context.Context, keys ...string) error {
	return r.client.Del(ctx, keys...).Err()
}

func (r *RedisCache) ScanKeys(ctx context.Context, pattern string) ([]string, error) {
	var keys []string
	var cursor uint64
	for {
		batch, next, err := r.client.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, err
		}
		keys = append(keys, batch...)
		cursor = next
		if cursor == 0 {
			break
		}
	}
	return keys, nil
}
