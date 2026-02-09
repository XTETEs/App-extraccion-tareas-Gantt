import { Redis } from '@upstash/redis';

// Inicializamos Redis soportando tanto variables de Vercel KV como Upstash nativo
const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(request, response) {
    try {
        // Obtenemos todos los miembros del set 'gantt_files_set'
        const urls = await redis.smembers('gantt_files_set');

        return response.status(200).json({ urls });
    } catch (error) {
        console.error('Error fetching file list:', error);
        return response.status(500).json({ error: error.message });
    }
}
