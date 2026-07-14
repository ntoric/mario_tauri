package repository

import (
	"context"
	"log"
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
	if err := r.client.Set(ctx, key, value, ttl).Err(); err != nil {
		log.Printf("[Redis] Failed to SET key %q: %v", key, err)
	}
}

func (r *RedisCache) Delete(ctx context.Context, key string) {
	if err := r.client.Del(ctx, key).Err(); err != nil {
		log.Printf("[Redis] Failed to DEL key %q: %v", key, err)
	}
}

func (r *RedisCache) DeleteByPrefix(ctx context.Context, prefix string) {
	var cursor uint64
	for {
		keys, nextCursor, err := r.client.Scan(ctx, cursor, prefix+"*", 100).Result()
		if err != nil {
			log.Printf("[Redis] Failed to SCAN prefix %q: %v", prefix, err)
			return
		}
		if len(keys) > 0 {
			if err := r.client.Del(ctx, keys...).Err(); err != nil {
				log.Printf("[Redis] Failed to DEL keys with prefix %q: %v", prefix, err)
			}
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
