import React, { useCallback, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Upload, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import type { Task } from '../types';
import { differenceInCalendarDays } from 'date-fns';

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

                // Define parseFlexibleDate helper
                const parseFlexibleDate = (val: any): Date | undefined => {
                    if (val instanceof Date && !isNaN(val.getTime())) return val;
                    if (val === undefined || val === null || val === '') return undefined;

                    if (typeof val === 'number') {
                        const d = new Date(Math.round((val - 25569) * 864e5));
                        if (!isNaN(d.getTime())) return d;
                        return undefined;
                    }

                    const str = String(val).trim();
                    if (!str) return undefined;

                    const months: Record<string, number> = {
                        'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
                        'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
                    };

                    const parts = str.split(/[-\/\s]+/);
                    if (parts.length === 3) {
                        const day = parseInt(parts[0], 10);
                        const monthStr = parts[1] ? parts[1].toLowerCase().substring(0, 3) : '';
                        let year = parseInt(parts[2], 10);

                        if (!isNaN(day) && months[monthStr] !== undefined && !isNaN(year)) {
                            if (year < 100) year += 2000;
                            const d = new Date(year, months[monthStr], day);
                            if (!isNaN(d.getTime())) return d;
                        }
                    }

                    const d = new Date(str);
                    return !isNaN(d.getTime()) ? d : undefined;
                };

                // Collect tasks from all sheets
                const allParsedTasks: Task[] = [];
                let totalSheetsProcessed = 0;
                let firstProjectStartDate: Date | undefined = undefined;
                let firstProjectEndDate: Date | undefined = undefined;

                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                    if (jsonData.length === 0) continue;

                    // Smart Header Detection
                    let headerRowIndex = 0;
                    let detectedHeaders: string[] = [];

                    for (let i = 0; i < Math.min(jsonData.length, 30); i++) {
                        const row = jsonData[i] as any[];
                        if (!row) continue;
                        const rowValues = row.map(cell => String(cell || '').toUpperCase());

                        const hasTask = rowValues.some(v => v.includes('TAREA') || v.includes('TASK') || v.includes('DESCRIPCION') || v.includes('ACTIVIDAD') || v.includes('NOMBRE'));
                        const hasDate = rowValues.some(v => v.includes('FECHA') || v.includes('DATE') || v.includes('INICIO') || v.includes('START'));

                        if (hasTask && hasDate) {
                            headerRowIndex = i;
                            detectedHeaders = (jsonData[i] as any[]).map(h => String(h || ''));
                            break;
                        }
                    }

                    if (detectedHeaders.length === 0) {
                        detectedHeaders = (jsonData[0] as any[]).map(h => String(h || ''));
                    }

                    const headers = detectedHeaders;
                    let currentSheetProjectStartDate: Date | undefined = undefined;
                    let currentSheetProjectEndDate: Date | undefined = undefined;

                    // Parse Dates for this sheet
                    for (let i = 0; i < Math.min(jsonData.length, 50); i++) {
                        const row = jsonData[i] as any[];
                        if (!row) continue;
                        for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
                            const cellStr = String(row[cellIdx] || '').toLowerCase().trim();
                            const isStartLabel = cellStr.includes('inicio') && (cellStr.includes('proyecto') || cellStr.includes('fecha') || cellStr.includes('obra'));
                            const isEndLabel = (cellStr.includes('fin') || cellStr.includes('termino') || cellStr.includes('final')) && (cellStr.includes('proyecto') || cellStr.includes('fecha') || cellStr.includes('obra'));

                            if (isStartLabel && !currentSheetProjectStartDate) {
                                for (let k = 1; k <= 15; k++) {
                                    const d = parseFlexibleDate(row[cellIdx + k]);
                                    if (d) { currentSheetProjectStartDate = d; break; }
                                }
                            }
                            if (isEndLabel && !currentSheetProjectEndDate) {
                                for (let k = 1; k <= 15; k++) {
                                    const d = parseFlexibleDate(row[cellIdx + k]);
                                    if (d) { currentSheetProjectEndDate = d; break; }
                                }
                            }
                        }
                    }

                    if (!firstProjectStartDate) firstProjectStartDate = currentSheetProjectStartDate;
                    if (!firstProjectEndDate) firstProjectEndDate = currentSheetProjectEndDate;

                    if (!columnMapping) {
                        setRawHeaders(headers);
                        setMappingModalOpen(true);
                        setPendingFiles(prev => [...prev, { file, blobUrl }]);
                        setSyncStatus('idle');
                        return; // Wait for mapping
                    }

                    // Parse tasks for this sheet
                    const sheetTasks: Task[] = [];
                    const dataRows = jsonData.slice(headerRowIndex + 1);

                    // Determine Project Name for this sheet
                    const genericNames = ['sheet1', 'sheet 1', 'hoja1', 'hoja 1', 'tasks', 'tareas', 'gantt'];
                    const isGeneric = genericNames.includes(String(sheetName || '').toLowerCase().trim());
                    const filenameBase = file.name.replace(/\.[^/.]+$/, "");
                    const projectName = isGeneric ? filenameBase : sheetName;

                    dataRows.forEach((row: any) => {
                        const obj: any = {};
                        headers.forEach((h, idx) => { obj[h] = row[idx]; });

                        const taskName = obj[columnMapping.taskCol];
                        const startDate = parseFlexibleDate(obj[columnMapping.startCol]);
                        const endDate = parseFlexibleDate(obj[columnMapping.endCol]);

                        if (!startDate || !endDate || !taskName) return;

                        const normalizedTaskName = String(taskName).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                        const IGNORED_KEYWORDS = ['gestion de residuos', 'seguridad y salud', 'contenedores', 'epp'];
                        if (IGNORED_KEYWORDS.some(k => normalizedTaskName.includes(k))) return;

                        const wbs = columnMapping.wbsCol ? obj[columnMapping.wbsCol] : undefined;
                        const slack = columnMapping.slackCol ? parseFloat(obj[columnMapping.slackCol]) : undefined;
                        let progress = 0;

                        const progressKeywords = ['% completado', '% avance', '% complete', 'avance', 'progreso', 'completado', 'complete', '% trabajo'];
                        for (const h of headers) {
                            if (progressKeywords.some(k => String(h || '').toLowerCase().includes(k))) {
                                const raw = obj[h];
                                if (raw !== undefined && raw !== null) {
                                    let val = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
                                    if (!isNaN(val) && val <= 1) val *= 100;
                                    if (!isNaN(val)) progress = Math.round(val);
                                }
                                break;
                            }
                        }

                        sheetTasks.push({
                            id: Math.random().toString(36).substr(2, 9),
                            projectId: projectName,
                            projectName: projectName,
                            name: String(taskName),
                            startDate,
                            endDate,
                            isCritical: (columnMapping.criticalCol && !!obj[columnMapping.criticalCol]) || (slack !== undefined && slack <= 0),
                            wbs: wbs ? String(wbs) : undefined,
                            type: 'T',
                            delayDays: (progress >= 100) ? 0 : differenceInCalendarDays(new Date(), endDate),
                            totalSlack: slack,
                            progress: progress
                        });
                    });

                    if (sheetTasks.length > 0) {
                        allParsedTasks.push(...sheetTasks);
                        totalSheetsProcessed++;
                    }
                }

                if (allParsedTasks.length > 0) {
                    addTasks(allParsedTasks, { startDate: firstProjectStartDate, endDate: firstProjectEndDate, blobUrl });
                    setSyncStatus('success');
                    setSyncMessage(`Cargadas ${allParsedTasks.length} tareas desde ${totalSheetsProcessed} hoja(s).`);
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
