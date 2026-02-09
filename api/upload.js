import { put } from '@vercel/blob';
import { Redis } from '@upstash/redis';

// Inicializamos Redis soportando tanto variables de Vercel KV como Upstash nativo
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(request, response) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  // 1. Guardamos el archivo en Vercel Blob
  // NOTA: Esto requiere la variable BLOB_READ_WRITE_TOKEN en Vercel
  const blob = await put(filename, request, {
    access: 'public',
  });

  // 2. Añadimos la URL al SET de archivos en Redis
  await redis.sadd('gantt_files_set', blob.url);

  return response.status(200).json(blob);
}
