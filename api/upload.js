import { put } from '@vercel/blob';
import { Redis } from '@upstash/redis';

// Inicializamos Redis soportando tanto variables de Vercel KV como Upstash nativo
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(request, response) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get('filename');

    if (!filename) {
      return response.status(400).json({ error: 'Filename is required' });
    }

    // 1. Guardamos el archivo en Vercel Blob
    console.log('[upload] Uploading file to Vercel Blob:', filename);
    const blob = await put(filename, request, {
      access: 'public',
    });
    console.log('[upload] File uploaded successfully:', blob.url);

    // 2. Añadimos la URL al SET de archivos en Redis
    console.log('[upload] Adding URL to Redis set');
    await redis.sadd('gantt_files_set', blob.url);
    console.log('[upload] URL added to Redis successfully');

    return response.status(200).json(blob);
  } catch (error) {
    console.error('[upload] Error:', error);
    return response.status(500).json({
      error: error.message || 'Upload failed',
      details: error.toString()
    });
  }
}
