import React, { useCallback, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Upload, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { parseExcelWorkbook } from '../lib/excelParser';

export function FileUpload() {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const {
        addTasks,
        columnMapping,
        setRawHeaders,
        setMappingModalOpen,
        tasks
    } = useStore();
    const [pendingFiles, setPendingFiles] = useState<{file: File, blobUrl?: string}[]>([]);
    const [uploadedBlobs, setUploadedBlobs] = useState<any[]>([]);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [syncMessage, setSyncMessage] = useState<string>('');
    const [isDragging, setIsDragging] = useState<boolean>(false);

    const uploadFile = async (file: File) => {
        try {
            const response = await fetch(`/api/upload?filename=${file.name}`, {
                method: 'POST',
                body: file,
            });
            const newBlob = await response.json();
            setUploadedBlobs(prev => [...prev, newBlob]);
            return newBlob.url;
        } catch (error) {
            console.error('Error uploading file:', error);
            return undefined;
        }
    };

    // Auto-process pending files when mapping is available
    useEffect(() => {
        if (columnMapping && pendingFiles.length > 0) {
            // Process all pending files
            pendingFiles.forEach(item => {
                processFile(item.file, item.blobUrl);
            });
            setPendingFiles([]);
        }
    }, [columnMapping, pendingFiles]);

    // Fetch and load remote files on mount
    useEffect(() => {
        console.log('[FileUpload] useEffect ejecutándose - iniciando carga remota');
        const loadRemoteFiles = async () => {
            console.log('[FileUpload] loadRemoteFiles iniciado');
            setSyncStatus('loading');
            setSyncMessage('Buscando archivos compartidos...');
            try {
                console.log('[FileUpload] Llamando a /api/list-gantt');
                const res = await fetch('/api/list-gantt');
                console.log('[FileUpload] Respuesta recibida:', res.status, res.statusText);
                if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);

                const text = await res.text();
                if (text.trim().startsWith('import') || text.trim().startsWith('export')) {
                    console.error('[FileUpload] API list-gantt ha devuelto código fuente en lugar de JSON. ¿Está usando vercel dev?');
                    setSyncStatus('error');
                    setSyncMessage('Error de API: Servidor no configurado correctamente');
                    return;
                }
                const data = JSON.parse(text);
                console.log('[FileUpload] Datos recibidos:', data);

                if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
                    console.log(`[FileUpload] Encontrados ${data.urls.length} archivos`);
                    setSyncMessage(`Encontrados ${data.urls.length} archivos. Descargando...`);
                    // Update list of uploaded blobs for display
                    setUploadedBlobs(data.urls.map((url: string) => ({ url, pathname: url })));

                    // Process each file
                    let successCount = 0;
                    for (const url of data.urls) {
                        try {
                            console.log(`[FileUpload] Descargando archivo: ${url}`);
                            const fileRes = await fetch(url);
                            const blob = await fileRes.blob();
                            // Try to extract filename, fallback to generic
                            let filename = 'remote-gantt.xlsx';
                            try {
                                const urlObj = new URL(url);
                                const pathParts = urlObj.pathname.split('/');
                                filename = pathParts[pathParts.length - 1] || filename;
                                filename = decodeURIComponent(filename);
                            } catch (e) { }

                            const file = new File([blob], filename, { type: blob.type });
                            console.log(`[FileUpload] Procesando archivo: ${filename}`);
                            const loaded = processFile(file, url); // pass blobUrl for remote tracking
                            if (loaded) successCount++;
                        } catch (err) {
                            console.error(`Failed to load remote file ${url}:`, err);
                        }
                    }
                    console.log(`[FileUpload] Archivos procesados exitosamente: ${successCount}`);
                    if (successCount > 0) {
                        setSyncStatus('success');
                        setSyncMessage(`Sincronizados ${successCount} archivos desde la nube.`);
                        setTimeout(() => setSyncStatus('idle'), 5000);
                    } else {
                        setSyncStatus('error');
                        setSyncMessage('No se pudieron procesar los archivos.');
                    }
                } else {
                    console.log('[FileUpload] No hay archivos en la respuesta');
                    setSyncStatus('idle');
                    setSyncMessage('No hay archivos compartidos recientes.');
                }
            } catch (error: any) {
                console.error("[FileUpload] Error loading remote files:", error);
                setSyncStatus('error');
                setSyncMessage(`Error de sincronización: ${error.message}`);
            }
        };

        loadRemoteFiles();
    }, []); // Run once on mount

    const processFile = (file: File, blobUrl?: string) => {
        setSyncStatus('loading');
        setSyncMessage(`Procesando ${file.name}...`);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });

                const result = parseExcelWorkbook(workbook, columnMapping);

                if (result.type === 'needs_mapping' && result.headers) {
                    setRawHeaders(result.headers);
                    setMappingModalOpen(true);
                    setPendingFiles(prev => [...prev, { file, blobUrl }]);
                    setSyncStatus('idle');
                    return; // Wait for mapping
                }

                if (result.type === 'success' && result.tasks && result.tasks.length > 0) {
                    addTasks(result.tasks, { startDate: result.startDate, endDate: result.endDate, blobUrl });
                    setSyncStatus('success');
                    setSyncMessage(`Cargadas ${result.tasks.length} tareas desde ${result.totalSheetsProcessed} hoja(s).`);
                    setTimeout(() => { if (syncStatus === 'success') setSyncStatus('idle'); }, 5000);
                } else {
                    setSyncStatus('error');
                    setSyncMessage('No se encontraron tareas válidas en el archivo.');
                }

            } catch (err: any) {
                console.error("Error processing file:", err);
                setSyncStatus('error');
                setSyncMessage(`Error: ${err.message}`);
            }
        };
        reader.onerror = () => {
            setSyncStatus('error');
            setSyncMessage('Error al leer el archivo.');
        };
        reader.readAsArrayBuffer(file);
        return true;
    };

    const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        // Only set to false if we're leaving the main container
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    };

    const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(async file => {
                setSyncStatus('loading');
                setSyncMessage(`Subiendo archivo a la nube...`);
                const blobUrl = await uploadFile(file);
                processFile(file, blobUrl);
            });
            e.dataTransfer.clearData();
        }
    }, [columnMapping, addTasks]);

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer flex flex-col items-center gap-4",
                isDragging
                    ? "border-primary border-4 bg-primary/10 scale-[1.02]"
                    : "border-muted-foreground/25 hover:bg-muted/50"
            )}
        >
            <input
                type="file"
                className="hidden"
                ref={inputRef}
                multiple
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        Array.from(e.target.files).forEach(async file => {
                            setSyncStatus('loading');
                            setSyncMessage(`Subiendo archivo a la nube...`);
                            const blobUrl = await uploadFile(file);
                            processFile(file, blobUrl);
                        });
                        // Reset input so same file can be selected again if needed
                        e.target.value = '';
                    }
                }}
            />
            <div className="bg-primary/10 p-4 rounded-full">
                <Upload className="h-8 w-8 text-primary" />
            </div>
            <div>
                <h3 className="text-lg font-semibold">Cargar archivos Excel</h3>
                <p className={cn(
                    "text-sm mt-2 transition-colors",
                    isDragging ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                    {isDragging ? "¡Suelta los archivos aquí!" : "Arrastra archivos aquí o haz clic para seleccionar"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Soporta .xlsx, .xls, .csv</p>
            </div>

            {tasks.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full text-sm font-medium">
                        <CheckCircle className="h-4 w-4" />
                        {tasks.length} tareas cargadas exitosamente
                    </div>
                </div>
            )}

            {uploadedBlobs.length > 0 && (
                <div className="mt-2 text-center">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('¿Deseas eliminar todos los archivos de la nube? Esto no borrará tus datos locales actuales, pero los archivos no se restaurarán automáticamente al reiniciar.')) {
                                useStore.getState().clearRemoteFiles();
                                setUploadedBlobs([]);
                            }
                        }}
                        className="text-xs text-destructive hover:underline font-medium"
                    >
                        Limpiar archivos compartidos en la nube
                    </button>
                </div>
            )}

            {/* Sync Status Feedback */}
            {syncStatus !== 'idle' && (
                <div className={cn(
                    "mt-4 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2",
                    syncStatus === 'loading' && "bg-blue-50 text-blue-600",
                    syncStatus === 'success' && "bg-green-50 text-green-600",
                    syncStatus === 'error' && "bg-red-50 text-red-600"
                )}>
                    {syncStatus === 'loading' && <span className="animate-spin">⌛</span>}
                    {syncStatus === 'error' && <span>⚠️</span>}
                    {syncMessage}
                </div>
            )}

            {uploadedBlobs.length > 0 && (
                <div
                    className="mt-6 w-full max-w-2xl cursor-default"
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 className="text-sm font-medium mb-2">Archivos subidos:</h3>
                    <div className="space-y-2">
                        {uploadedBlobs.map((blob, index) => (
                            <div key={index} className="bg-muted/50 p-3 rounded-md flex items-center justify-between text-sm">
                                <span className="truncate max-w-[300px]">{blob.url}</span>
                                <a
                                    href={blob.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline ml-4 flex-shrink-0"
                                >
                                    Abrir enlace
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
