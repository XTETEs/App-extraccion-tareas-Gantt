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
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [uploadedBlobs, setUploadedBlobs] = useState<any[]>([]);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [syncMessage, setSyncMessage] = useState<string>('');

    const uploadFile = async (file: File) => {
        try {
            const response = await fetch(`/api/upload?filename=${file.name}`, {
                method: 'POST',
                body: file,
            });
            const newBlob = await response.json();
            setUploadedBlobs(prev => [...prev, newBlob]);
        } catch (error) {
            console.error('Error uploading file:', error);
        }
    };

    // Auto-process pending files when mapping is available
    useEffect(() => {
        if (columnMapping && pendingFiles.length > 0) {
            // Process all pending files
            pendingFiles.forEach(file => {
                processFile(file);
            });
            setPendingFiles([]);
        }
    }, [columnMapping, pendingFiles]);

    // Fetch and load remote files on mount
    useEffect(() => {
        const loadRemoteFiles = async () => {
            setSyncStatus('loading');
            setSyncMessage('Buscando archivos compartidos...');
            try {
                const res = await fetch('/api/list-gantt');
                if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);

                const data = await res.json();

                if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
                    setSyncMessage(`Encontrados ${data.urls.length} archivos. Descargando...`);
                    // Update list of uploaded blobs for display
                    setUploadedBlobs(data.urls.map((url: string) => ({ url, pathname: url })));

                    // Process each file
                    let successCount = 0;
                    for (const url of data.urls) {
                        try {
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
                            const loaded = processFile(file);
                            if (loaded) successCount++;
                        } catch (err) {
                            console.error(`Failed to load remote file ${url}:`, err);
                        }
                    }
                    if (successCount > 0) {
                        setSyncStatus('success');
                        setSyncMessage(`Sincronizados ${successCount} archivos desde la nube.`);
                        setTimeout(() => setSyncStatus('idle'), 5000);
                    } else {
                        setSyncStatus('idle'); // Should we show error if 0 loaded?
                    }
                } else {
                    setSyncStatus('idle');
                    setSyncMessage('No hay archivos compartidos recientes.');
                }
            } catch (error: any) {
                console.error("Error loading remote files:", error);
                setSyncStatus('error');
                setSyncMessage(`Error de sincronización: ${error.message}`);
            }
        };

        loadRemoteFiles();
    }, []); // Run once on mount

    const processFile = (file: File) => {
        // If we don't have a mapping yet, queue it.
        // CHECK: If we already have pending files, we just add to them?
        // Actually, we need to check columnMapping inside the function or before calling it.
        // But processFile is called by onDrop/onChange.

        // Let's modify the flow slightly: 
        // 1. Read the file to get headers. 
        // 2. If no mapping, set headers and queue THIS file (and any others).
        // The issue is reading is async.

        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true }); // cellDates true to get Date objects
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (jsonData.length === 0) return false;

            // Smart Header Detection
            // We scan the first 20 rows to find the one that looks like a header row
            // Criteria: Contains "Task", "Tarea", "Descripcion" OR "Fecha"
            let headerRowIndex = 0;
            let detectedHeaders: string[] = [];

            for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
                const row = jsonData[i] as any[];
                if (!row) continue;
                // Convert row to string array for checking
                const rowValues = row.map(cell => String(cell).toUpperCase());

                const hasTask = rowValues.some(v => v.includes('TAREA') || v.includes('TASK') || v.includes('DESCRIPCION') || v.includes('ACTIVIDAD') || v.includes('NOMBRE'));
                const hasDate = rowValues.some(v => v.includes('FECHA') || v.includes('DATE') || v.includes('INICIO') || v.includes('START'));

                if (hasTask && hasDate) {
                    headerRowIndex = i;
                    detectedHeaders = rowValues; // Use the uppercase normalized headers or original? Let's use original for display
                    // Actually, let's use the original values from row but strictly as strings
                    detectedHeaders = (jsonData[i] as any[]).map(String);
                    break;
                }
            }

            // If no smart header found, fallback to row 0
            if (detectedHeaders.length === 0) {
                detectedHeaders = (jsonData[0] as any[]).map(String);
                headerRowIndex = 0;
            }

            const headers = detectedHeaders;

            // --- GLOBAL PROJECT DATES EXTRACTION ---
            let projectStartDate: Date | undefined = undefined;
            let projectEndDate: Date | undefined = undefined;

            const parseFlexibleDate = (val: any): Date | undefined => {
                if (val instanceof Date && !isNaN(val.getTime())) return val;
                if (!val) return undefined;

                const str = String(val).trim();
                // Handle "03-nov-25" or "03-nov-2025"
                // This is a common format in Spanish Excel
                const months: Record<string, number> = {
                    'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
                    'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
                };

                const parts = str.split(/[-\/\s]+/);
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const monthStr = parts[1].toLowerCase().substring(0, 3);
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

            for (let i = 0; i < Math.min(jsonData.length, 30); i++) {
                const row = jsonData[i] as any[];
                if (!row) continue;

                for (let cellIdx = 0; cellIdx < row.length; cellIdx++) {
                    const cellVal = row[cellIdx];
                    if (!cellVal) continue;

                    const cellStr = String(cellVal).toLowerCase().trim();

                    // Match labels: "inicio de proyecto", "fecha inicio", "obra inicio", etc.
                    const isStartLabel = cellStr.includes('inicio') && (cellStr.includes('proyecto') || cellStr.includes('fecha') || cellStr.includes('obra'));
                    const isEndLabel = (cellStr.includes('fin') || cellStr.includes('termino') || cellStr.includes('final')) && (cellStr.includes('proyecto') || cellStr.includes('fecha') || cellStr.includes('obra'));

                    if (isStartLabel && !projectStartDate) {
                        // Search next 15 cells in the same row for a date
                        for (let k = 1; k <= 15; k++) {
                            const candidate = row[cellIdx + k];
                            const d = parseFlexibleDate(candidate);
                            if (d) {
                                projectStartDate = d;
                                break;
                            }
                        }
                    }
                    if (isEndLabel && !projectEndDate) {
                        // Search next 15 cells in the same row for a date
                        for (let k = 1; k <= 15; k++) {
                            const candidate = row[cellIdx + k];
                            const d = parseFlexibleDate(candidate);
                            if (d) {
                                projectEndDate = d;
                                break;
                            }
                        }
                    }
                }
                if (projectStartDate && projectEndDate) break;
            }

            // GLOBAL STORE CHECK: Do we have a mapping?
            if (!columnMapping) {
                setRawHeaders(headers);
                setMappingModalOpen(true);
                setPendingFiles(prev => [...prev, file]);
                console.log("Headers detected at row " + headerRowIndex);
                return true;
            }

            // If we DO have a mapping, parse the data
            const parsedTasks: Task[] = [];
            const dataRows = jsonData.slice(headerRowIndex + 1);

            const jsonDataObjects = dataRows.map((row: any) => {
                const obj: any = {};
                headers.forEach((header, index) => {
                    obj[header] = row[index];
                });
                return obj;
            });

            jsonDataObjects.forEach((row: any) => {
                const projectName = sheetName;
                const taskName = row[columnMapping.taskCol];
                const startDate = new Date(row[columnMapping.startCol]);
                const endDate = new Date(row[columnMapping.endCol]);

                if (projectName && taskName) {
                    const normalizeString = (str: string) =>
                        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

                    const normalizedTaskName = normalizeString(String(taskName));
                    const IGNORED_KEYWORDS = [
                        'gestion de residuos',
                        'seguridad y salud',
                        'contenedores',
                        'epp'
                    ];

                    if (IGNORED_KEYWORDS.some(keyword => normalizedTaskName.includes(keyword))) {
                        return;
                    }

                    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                        return;
                    }

                    const validStartDate = startDate;
                    const validEndDate = endDate;

                    const wbs = columnMapping.wbsCol ? row[columnMapping.wbsCol] : undefined;
                    const type = columnMapping.typeCol ? row[columnMapping.typeCol] : undefined;
                    const slack = columnMapping.slackCol ? parseFloat(row[columnMapping.slackCol]) : undefined;
                    const isMilestone = columnMapping.milestoneCol ? !!row[columnMapping.milestoneCol] : false;

                    let budget: number | undefined = undefined;
                    if (columnMapping.budgetCol && row[columnMapping.budgetCol]) {
                        const val = row[columnMapping.budgetCol];
                        if (typeof val === 'number') {
                            budget = val;
                        } else if (typeof val === 'string') {
                            let clean = val.replace(/\./g, '');
                            clean = clean.replace(',', '.');
                            clean = clean.replace(/[^0-9.-]/g, '');
                            const parsed = parseFloat(clean);
                            if (!isNaN(parsed)) budget = parsed;
                        }
                    }

                    const today = new Date();
                    const delayDays = differenceInCalendarDays(today, validEndDate);

                    const isCritical = (columnMapping.criticalCol && !!row[columnMapping.criticalCol]) ||
                        (slack !== undefined && slack <= 0) ||
                        isMilestone;

                    parsedTasks.push({
                        id: Math.random().toString(36).substr(2, 9),
                        projectId: projectName,
                        projectName: projectName,
                        name: taskName,
                        startDate: validStartDate,
                        endDate: validEndDate,
                        isCritical: isCritical,
                        wbs: wbs ? String(wbs) : undefined,
                        type: type ? String(type) : 'T',
                        delayDays: delayDays,
                        totalSlack: slack,
                        isMilestone: isMilestone,
                        budget: budget
                    });
                }
            });

            addTasks(parsedTasks, { startDate: projectStartDate, endDate: projectEndDate });
            return true;
        };
        reader.readAsArrayBuffer(file);
        return true;
    };
    const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(file => {
                processFile(file);
                uploadFile(file);
            });
            e.dataTransfer.clearData();
        }
    }, [columnMapping, addTasks]);

    const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    return (
        <div
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={onDragOver}
            className={cn(
                "border-2 border-dashed border-muted-foreground/25 rounded-xl p-10 text-center hover:bg-muted/50 transition-colors cursor-pointer flex flex-col items-center gap-4",
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
                        Array.from(e.target.files).forEach(file => {
                            processFile(file);
                            uploadFile(file);
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
                <p className="text-sm text-muted-foreground mt-2">Arrastra o haz clic para seleccionar</p>
                <p className="text-xs text-muted-foreground mt-1">Soporta .xlsx, .xls, .csv</p>
            </div>

            {tasks.length > 0 && (
                <div className="mt-4 flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full text-sm font-medium">
                    <CheckCircle className="h-4 w-4" />
                    {tasks.length} tareas cargadas exitosamente
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
