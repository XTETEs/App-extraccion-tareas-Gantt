import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Upload, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { processAnyFile, uploadFileToBlob } from '../lib/fileProcessor';

export function FileUpload() {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const { tasks } = useStore();
    const [uploadedBlobs, setUploadedBlobs] = useState<any[]>([]);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [syncMessage, setSyncMessage] = useState<string>('');
    const [isDragging, setIsDragging] = useState<boolean>(false);

    const onStatus = (status: 'loading' | 'success' | 'error', message: string) => {
        setSyncStatus(status);
        setSyncMessage(message);
        if (status === 'success') {
            setTimeout(() => setSyncStatus('idle'), 4000);
        }
    };

    const processSingleFile = async (file: File, blobUrl?: string) => {
        return processAnyFile(file, {
            blobUrl,
            onStatus
        });
    };

    // Fetch and load remote files on mount (graceful local fallback)
    useEffect(() => {
        const loadRemoteFiles = async () => {
            try {
                const res = await fetch('/api/list-gantt');
                if (!res.ok) {
                    console.log('[FileUpload] API remota no disponible (modo local activo)');
                    return;
                }

                const text = await res.text();
                if (text.trim().startsWith('<') || text.trim().startsWith('import') || text.trim().startsWith('export')) {
                    console.log('[FileUpload] Servidor devolvió código o HTML (modo local activo)');
                    return;
                }

                let data: any;
                try {
                    data = JSON.parse(text);
                } catch {
                    return;
                }

                if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
                    setSyncStatus('loading');
                    setSyncMessage(`Sincronizando ${data.urls.length} archivo(s) de la nube...`);
                    setUploadedBlobs(data.urls.map((url: string) => ({ url, pathname: url })));

                    let successCount = 0;
                    for (const url of data.urls) {
                        try {
                            const fileRes = await fetch(url);
                            const blob = await fileRes.blob();
                            let filename = 'remote-gantt.xlsx';
                            try {
                                const urlObj = new URL(url);
                                const pathParts = urlObj.pathname.split('/');
                                filename = pathParts[pathParts.length - 1] || filename;
                                filename = decodeURIComponent(filename);
                            } catch (e) { }

                            const file = new File([blob], filename, { type: blob.type });
                            const loaded = await processSingleFile(file, url);
                            if (loaded) successCount++;
                        } catch (err) {
                            console.error(`Error al procesar archivo remoto ${url}:`, err);
                        }
                    }

                    if (successCount > 0) {
                        setSyncStatus('success');
                        setSyncMessage(`Sincronizados ${successCount} archivo(s) desde la nube.`);
                        setTimeout(() => setSyncStatus('idle'), 5000);
                    } else {
                        setSyncStatus('idle');
                    }
                }
            } catch (error: any) {
                console.log('[FileUpload] Modo local activo:', error.message);
                setSyncStatus('idle');
            }
        };

        loadRemoteFiles();
    }, []);

    const handleFiles = (files: File[]) => {
        files.forEach(async (file) => {
            // Process file immediately
            await processSingleFile(file);

            // Upload in background to remote storage if configured
            uploadFileToBlob(file).then(blobUrl => {
                if (blobUrl) {
                    setUploadedBlobs(prev => [...prev, { url: blobUrl, pathname: file.name }]);
                    console.log(`[FileUpload] Archivo sincronizado con la nube: ${blobUrl}`);
                }
            }).catch(err => {
                console.warn('[FileUpload] Subida remota no disponible en local:', err);
            });
        });
    };

    const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    };

    const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
            e.dataTransfer.clearData();
        }
    };

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
                accept=".xlsx,.xls,.csv,.json"
                onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                        handleFiles(Array.from(e.target.files));
                        e.target.value = '';
                    }
                }}
            />
            <div className="bg-primary/10 p-4 rounded-full">
                <Upload className="h-8 w-8 text-primary" />
            </div>
            <div>
                <h3 className="text-lg font-semibold">Cargar archivos Excel o JSON</h3>
                <p className={cn(
                    "text-sm mt-2 transition-colors",
                    isDragging ? "text-primary font-medium" : "text-muted-foreground"
                )}>
                    {isDragging ? "¡Suelta los archivos aquí!" : "Arrastra archivos aquí o haz clic para seleccionar"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Soporta .xlsx, .xls, .csv, .json</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <a
                        href="data:text/json;charset=utf-8,%7B%22project%22%3A%7B%22name%22%3A%22B167%20-%20Edificio%20Ejemplo%22%2C%22startDate%22%3A%222025-09-01%22%2C%22endDate%22%3A%222026-06-30%22%7D%2C%22tasks%22%3A%5B%7B%22wbs%22%3A%22100%22%2C%22type%22%3A%22T%22%2C%22name%22%3A%22Actuaciones%20Previas%22%2C%22startDate%22%3A%222025-09-01%22%2C%22endDate%22%3A%222025-09-30%22%2C%22industrial%22%3A%22Obras%20Previas%20SL%22%2C%22budget%22%3A15000%2C%22progress%22%3A100%7D%2C%7B%22wbs%22%3A%22101%22%2C%22type%22%3A%22T%22%2C%22name%22%3A%22Demoliciones%20y%20Derribos%22%2C%22startDate%22%3A%222025-09-05%22%2C%22endDate%22%3A%222025-09-25%22%2C%22industrial%22%3A%22Derribos%20Levante%20SL%22%2C%22budget%22%3A9500%2C%22progress%22%3A80%2C%22isCritical%22%3Atrue%2C%22totalSlack%22%3A0%7D%2C%7B%22wbs%22%3A%22102%22%2C%22type%22%3A%22T%22%2C%22name%22%3A%22Saneamiento%20Horizontal%22%2C%22startDate%22%3A%222025-09-26%22%2C%22endDate%22%3A%222025-10-20%22%2C%22industrial%22%3A%22Fontaneria%20Redes%20SA%22%2C%22budget%22%3A14200%2C%22progress%22%3A0%2C%22isCritical%22%3Afalse%2C%22totalSlack%22%3A5%7D%5D%7D"
                        download="plantilla_obra_gantt.json"
                        className="text-xs text-primary hover:underline font-medium flex items-center gap-1 justify-center bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20"
                    >
                        Descargar plantilla JSON
                    </a>
                    <a
                        href="data:text/csv;charset=utf-8,TAREA,INICIO,FIN,TIPO,PRESUPUESTO,%25%20AVANCE%0AExcavacion%20y%20cimientos,2024-01-01,2024-01-15,P,10000,100%0AEstructura,2024-01-16,2024-02-15,T,25000,50%0AInstalaciones,2024-02-16,2024-03-01,S,15000,0"
                        download="plantilla_gantt.csv"
                        className="text-xs text-muted-foreground hover:underline font-medium flex items-center gap-1 justify-center bg-muted/60 px-3 py-1.5 rounded-full border border-border/40"
                    >
                        Plantilla CSV
                    </a>
                </div>
            </div>

            {tasks.length > 0 && (
                <div className="mt-4 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2 text-green-600 bg-green-50 dark:bg-green-950/40 px-4 py-2 rounded-full text-sm font-medium border border-green-500/20">
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
                    syncStatus === 'loading' && "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-500/20",
                    syncStatus === 'success' && "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400 border border-green-500/20",
                    syncStatus === 'error' && "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-500/20"
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
