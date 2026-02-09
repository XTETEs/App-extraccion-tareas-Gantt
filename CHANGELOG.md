# Sincronización Multi-Dispositivo para Archivos Gantt

**Fecha:** 2026-02-09

## Resumen

Implementación completa de sincronización multi-dispositivo que permite subir archivos Excel desde cualquier dispositivo y acceder a ellos automáticamente desde otros dispositivos usando Vercel Blob y Redis.

## Funcionalidades Implementadas

### 1. Backend - API Endpoints

#### [api/upload.js](file:///c:/Users/usuar/OneDrive/Desktop/Antigravity%20Apps/Extraccion%20tareas%20Gantt/api/upload.js)

- Sube archivos a Vercel Blob con acceso público
- Registra URLs en Redis Set (`gantt_files_set`)
- Manejo robusto de errores con respuestas JSON
- Soporte para URLs relativas y absolutas en Vercel
- Logging detallado para debugging

**Características clave:**

```javascript
// Construcción de URL compatible con Vercel
const url = request.url.startsWith('http') 
  ? new URL(request.url)
  : new URL(request.url, `https://${request.headers.host || 'localhost'}`);

// Almacenamiento en Blob + Redis
const blob = await put(filename, request, { access: 'public' });
await redis.sadd('gantt_files_set', blob.url);
```

#### [api/list-gantt.js](file:///c:/Users/usuar/OneDrive/Desktop/Antigravity%20Apps/Extraccion%20tareas%20Gantt/api/list-gantt.js)

- Recupera lista de URLs desde Redis
- Devuelve array vacío como fallback en caso de error
- Logging para monitoreo

### 2. Frontend - Sincronización Automática

#### [src/components/FileUpload.tsx](file:///c:/Users/usuar/OneDrive/Desktop/Antigravity%20Apps/Extraccion%20tareas%20Gantt/src/components/FileUpload.tsx)

**Auto-carga al iniciar:**

- `useEffect` ejecuta `loadRemoteFiles()` al montar el componente
- Descarga todos los archivos desde Vercel Blob
- Procesa automáticamente cada archivo Excel
- Actualiza estado con archivos sincronizados

**Feedback visual:**

- Estado de sincronización: `loading`, `success`, `error`, `idle`
- Mensajes informativos:
  - ⌛ "Buscando archivos compartidos..."
  - ✅ "Sincronizados X archivos desde la nube"
  - ⚠️ "Error de sincronización: [detalles]"

**Logging detallado:**

```javascript
console.log('[FileUpload] useEffect ejecutándose');
console.log('[FileUpload] Llamando a /api/list-gantt');
console.log('[FileUpload] Datos recibidos:', data);
console.log('[FileUpload] Procesando archivo:', filename);
```

### 3. Infraestructura

**Vercel Blob:**

- Almacenamiento de archivos Excel
- URLs públicas para acceso desde cualquier dispositivo
- Variable: `BLOB_READ_WRITE_TOKEN`

**Redis (Vercel KV):**

- Estructura: Redis Set `gantt_files_set`
- Previene duplicados automáticamente
- Variables: `KV_REST_API_URL`, `KV_REST_API_TOKEN`

**Configuración de entornos:**

- ✅ Production
- ✅ Preview  
- ✅ Development

## Flujo de Trabajo

### Subida de Archivo

1. Usuario arrastra/selecciona archivo Excel
2. Frontend llama a `/api/upload?filename=...`
3. Backend sube a Vercel Blob
4. Backend registra URL en Redis
5. Frontend actualiza lista de archivos subidos

### Carga en Otro Dispositivo

1. Usuario abre la app
2. `useEffect` ejecuta automáticamente
3. Frontend llama a `/api/list-gantt`
4. Backend devuelve URLs desde Redis
5. Frontend descarga cada archivo desde Blob
6. Frontend procesa archivos automáticamente
7. Usuario ve datos sincronizados

## Problemas Resueltos

### Error: Invalid URL

**Causa:** Vercel pasa `request.url` como path relativo  
**Solución:** Construcción condicional de URL completa

### Error: 500 Internal Server Error

**Causa:** Falta de manejo de errores  
**Solución:** Try-catch con respuestas JSON estructuradas

### Arrays vacíos en sincronización

**Causa:** Archivos no se guardaban por errores en upload  
**Solución:** Debugging con logs + fix de URL parsing

## Verificación

✅ Archivos se suben correctamente desde PC  
✅ URLs se registran en Redis  
✅ Archivos se cargan automáticamente en móvil  
✅ Procesamiento de datos funciona en todos los dispositivos  
✅ Feedback visual muestra estado de sincronización  
✅ Logs permiten debugging efectivo

## Comandos de Deploy

```powershell
git add .
git commit -m "feat: Multi-device sync with Vercel Blob and Redis"
git push
```

Vercel despliega automáticamente al hacer push a `main`.
