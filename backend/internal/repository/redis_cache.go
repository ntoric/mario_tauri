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
