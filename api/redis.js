import { Redis } from '@upstash/redis';

// Initialize Redis
const redis = Redis.fromEnv();

export default async function handler(request, response) {
    try {
        // Si recibimos un POST, intentamos leer o escribir (en este ejemplo del usuario era solo leer)
        // El ejemplo del usuario era:
        // const result = await redis.get("item");
        // return new NextResponse(JSON.stringify({ result }), { status: 200 });

        if (request.method === 'POST' || request.method === 'GET') {
            // Para propósitos de demostración, permitimos GET también para probar fácil en el navegador
            const result = await redis.get("item");
            return response.status(200).json({ result });
        }

        return response.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: error.message });
    }
}
