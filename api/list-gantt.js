import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

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
