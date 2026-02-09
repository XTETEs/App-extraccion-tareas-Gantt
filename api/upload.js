import { put } from '@vercel/blob';
import { Redis } from '@upstash/redis';

// Inicializamos Redis
const redis = Redis.fromEnv();

export default async function handler(request, response) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('filename');

  // 1. Guardamos el archivo en Vercel Blob
  const blob = await put(filename, request, {
    access: 'public',
  });

  // 2. Añadimos la URL al SET de archivos en Redis
  // Usamos un SET para evitar duplicados exactos de URL
  await redis.sadd('gantt_files_set', blob.url);

  return response.status(200).json(blob);
}
