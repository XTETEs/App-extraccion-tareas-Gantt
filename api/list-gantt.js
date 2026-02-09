import { Redis } from '@upstash/redis';

// Inicializamos Redis soportando tanto variables de Vercel KV como Upstash nativo
const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(request, response) {
    try {
        console.log('[list-gantt] Fetching file list from Redis');
        // Obtenemos todos los miembros del set 'gantt_files_set'
        const urls = await redis.smembers('gantt_files_set');
        console.log('[list-gantt] Found URLs:', urls);

        return response.status(200).json({ urls: urls || [] });
    } catch (error) {
        console.error('[list-gantt] Error fetching file list:', error);
        return response.status(500).json({
            error: error.message || 'Failed to fetch file list',
            urls: [] // Return empty array as fallback
        });
    }
}
