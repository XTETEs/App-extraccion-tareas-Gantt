import { del } from '@vercel/blob';
import { Redis } from '@upstash/redis';

// Inicializamos Redis soportando tanto variables de Vercel KV como Upstash nativo
const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.AUTH_TOKEN || request.headers.authorization !== `Bearer ${process.env.AUTH_TOKEN}`) {
        return response.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('[clear-files] Starting deletion process');

        // 1. Obtener todas las URLs de Redis
        const urls = await redis.smembers('gantt_files_set');
        console.log('[clear-files] URLs found in Redis:', urls);

        if (urls && urls.length > 0) {
            // 2. Eliminar de Vercel Blob
            console.log('[clear-files] Deleting blobs from Vercel');
            await del(urls);
            console.log('[clear-files] Blobs deleted successfully');
        }

        // 3. Eliminar el set en Redis
        await redis.del('gantt_files_set');
        console.log('[clear-files] Redis set deleted');

        return response.status(200).json({
            success: true,
            message: `Eliminados ${urls ? urls.length : 0} archivos de la nube.`
        });
    } catch (error) {
        console.error('[clear-files] Error clearing files:', error);
        return response.status(500).json({
            error: error.message || 'Failed to clear files',
            details: error.toString()
        });
    }
}
