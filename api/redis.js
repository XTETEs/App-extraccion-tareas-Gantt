import { Redis } from '@upstash/redis';

// Initialize Redis with support for Vercel KV variables
const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(request, response) {
    try {
        const result = await redis.get("item");
        return response.status(200).json({ result });
    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}
