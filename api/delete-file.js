import { del } from '@vercel/blob';
import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * DELETE /api/delete-file
 * Body: { url: string }  — the Vercel Blob URL to remove
 *
 * Removes the specified file from both Vercel Blob storage and the Redis set.
 */
export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    if (!process.env.AUTH_TOKEN || request.headers.authorization !== `Bearer ${process.env.AUTH_TOKEN}`) {
        return response.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { url } = await new Promise((resolve, reject) => {
            let body = '';
            request.on('data', chunk => { body += chunk; });
            request.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(e); }
            });
            request.on('error', reject);
        });

        if (!url) {
            return response.status(400).json({ error: 'url is required in request body' });
        }

        console.log('[delete-file] Deleting blob:', url);
        await del(url);
        console.log('[delete-file] Blob deleted');

        console.log('[delete-file] Removing from Redis set');
        await redis.srem('gantt_files_set', url);
        console.log('[delete-file] Removed from Redis');

        return response.status(200).json({ success: true, url });
    } catch (error) {
        console.error('[delete-file] Error:', error);
        return response.status(500).json({
            error: error.message || 'Failed to delete file',
            details: error.toString()
        });
    }
}
