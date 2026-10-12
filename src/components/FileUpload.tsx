import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Upload, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import type { Task, ColumnMapping } from '../types';
import { differenceInCalendarDays } from 'date-fns';

const normalizeStr = (s: any) =>
    String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

const parseFlexibleDate = (val: any): Date | undefined => {
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (val === undefined || val === null || val === '') return undefined;

    // Excel numeric serial
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 864e5));
        if (!isNaN(d.getTime())) return d;
        return undefined;
    }

    const str = String(val).trim();
    if (!str) return undefined;

    // Numeric serial as string (e.g. "45897" or "45897.5")
    if (/^\d{5}(\.\d+)?$/.test(str)) {
        const num = parseFloat(str);
        const d = new Date(Math.round((num - 25569) * 864e5));
        if (!isNaN(d.getTime())) return d;
    }

    const months: Record<string, number> = {
        'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11,
        'jan': 0, 'apr': 3, 'aug': 7, 'dec': 11
    };

    // Try matching ISO format YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = str.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (isoMatch) {
        const y = parseInt(isoMatch[1], 10);
        const m = parseInt(isoMatch[2], 10) - 1;
        const d = parseInt(isoMatch[3], 10);
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date;
    }

    // Try matching European/Spanish format DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const euroMatch = str.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
    if (euroMatch) {
        const d = parseInt(euroMatch[1], 10);
        const m = parseInt(euroMatch[2], 10) - 1;
        let y = parseInt(euroMatch[3], 10);
        if (y < 100) y += 2000;
        const date = new Date(y, m, d);
        if (!isNaN(date.getTime())) return date;
    }

    // Try matching text month DD-mes-YYYY (e.g. 15-abr-2024 or 15 abr 2024)
    const textParts = str.split(/[-\/\s]+/);
    if (textParts.length >= 3) {
        const day = parseInt(textParts[0], 10);
        const monthStr = textParts[1] ? textParts[1].toLowerCase().substring(0, 3) : '';
        let year = parseInt(textParts[2], 10);

        if (!isNaN(day) && months[monthStr] !== undefined && !isNaN(year)) {
            if (year < 100) year += 2000;
            const d = new Date(year, months[monthStr], day);
            if (!isNaN(d.getTime())) return d;
        }
    }

    const fallbackDate = new Date(str);
    return !isNaN(fallbackDate.getTime()) ? fallbackDate : undefined;
};

export function FileUpload() {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const {
        addTasks,
        columnMapping,
        setRawHeaders,
        setMappingModalOpen,
        tasks
    } = useStore();
    const [pendingFiles, setPendingFiles] = useState<{ file: File, blobUrl?: string }[]>([]);
    const [uploadedBlobs, setUploadedBlobs] = useState<any[]>([]);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [syncMessage, setSyncMessage] = useState<string>('');
    const [isDragging, setIsDragging] = useState<boolean>(false);

    const uploadFile = async (file: File) => {
        try {
            const response = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
                method: 'POST',
                body: file,
            });
            if (!response.ok) return undefined;
            const newBlob = await response.json();
            setUploadedBlobs(prev => [...prev, newBlob]);
            return newBlob.url;
        } catch (error) {
            console.warn('[FileUpload] Subida a la nube omitida (operando en modo local):', error);
            return undefined;
        }
    };

    // Auto-process pending files when mapping is set/saved
    useEffect(() => {
        if (columnMapping && pendingFiles.length > 0) {
            pendingFiles.forEach(item => {
                processFile(item.file, item.blobUrl);
            });
            setPendingFiles([]);
        }
    }, [columnMapping, pendingFiles]);

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
                            const loaded = processFile(file, url);
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

    const processJsonFile = (file: File, blobUrl?: string) => {
        setSyncStatus('loading');
        setSyncMessage(`Importando planificación JSON de ${file.name}...`);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result as string;
                const data = JSON.parse(text);

                const getCleanFileName = (fname: string) => fname.replace(/\.(json|xlsx|xls|csv)$/i, '').trim();
                const fallbackProjectName = getCleanFileName(file.name);

                const allParsedTasks: Task[] = [];
                let overallStartDate: Date | undefined;
                let overallEndDate: Date | undefined;

                // Case 1: Standard Mono-Obra structure
                // { project: { name, startDate, endDate }, tasks: [...] }
                // or { projectName, projectStartDate, projectEndDate, tasks: [...] }
                if (data && (Array.isArray(data.tasks) || data.project || data.projectName)) {
                    const projectName = String(data.project?.name || data.projectName || fallbackProjectName).trim();
                    const rawStartDate = data.project?.startDate || data.projectStartDate || data.startDate;
                    const rawEndDate = data.project?.endDate || data.projectEndDate || data.endDate;
                    overallStartDate = parseFlexibleDate(rawStartDate);
                    overallEndDate = parseFlexibleDate(rawEndDate);

                    const taskList = Array.isArray(data.tasks) ? data.tasks : [];
                    taskList.forEach((t: any) => {
                        const taskName = t.name || t.tarea || t.task || t.actividad;
                        const startDate = parseFlexibleDate(t.startDate || t.inicio || t.start || t.fechaInicio);
                        const endDate = parseFlexibleDate(t.endDate || t.fin || t.end || t.fechaFin);

                        if (!taskName || !startDate || !endDate) return;

                        const rawProgress = t.progress !== undefined ? t.progress : (t.avance !== undefined ? t.avance : 0);
                        let progress = typeof rawProgress === 'number' ? rawProgress : parseFloat(String(rawProgress).replace(',', '.'));
                        if (isNaN(progress)) progress = 0;
                        if (progress <= 1 && progress > 0) progress *= 100;
                        progress = Math.round(progress);

                        const rawBudget = t.budget !== undefined ? t.budget : (t.presupuesto !== undefined ? t.presupuesto : t.importe);
                        let budget: number | undefined;
                        if (typeof rawBudget === 'number') {
                            budget = rawBudget;
                        } else if (rawBudget !== undefined && rawBudget !== null) {
                            const clean = String(rawBudget).replace(/[^\d.,-]/g, '').replace(',', '.');
                            const parsed = parseFloat(clean);
                            if (!isNaN(parsed)) budget = parsed;
                        }

                        const rawSlack = t.totalSlack !== undefined ? t.totalSlack : (t.slack !== undefined ? t.slack : t.holgura);
                        let slack: number | undefined;
                        if (typeof rawSlack === 'number') {
                            slack = rawSlack;
                        } else if (rawSlack !== undefined && rawSlack !== null) {
                            const parsed = parseFloat(String(rawSlack).replace(',', '.'));
                            if (!isNaN(parsed)) slack = parsed;
                        }

                        let taskType = 'T';
                        const rawType = String(t.type || t.tipo || 'T').toUpperCase();
                        if (rawType.includes('P')) taskType = 'P';
                        else if (rawType.includes('S')) taskType = 'S';
                        else taskType = 'T';

                        const industrial = t.industrial || t.contratista || t.empresa || t.gremio || t.proveedor;
                        const isCritical = Boolean(t.isCritical || t.critica || (slack !== undefined && slack <= 0));

                        allParsedTasks.push({
                            id: t.id ? String(t.id) : Math.random().toString(36).substr(2, 9),
                            projectId: projectName,
                            projectName: projectName,
                            name: String(taskName),
                            startDate,
                            endDate,
                            isCritical,
                            wbs: t.wbs !== undefined ? String(t.wbs) : undefined,
                            type: taskType,
                            delayDays: (progress >= 100) ? 0 : differenceInCalendarDays(new Date(), endDate),
                            totalSlack: slack,
                            progress,
                            industrial: industrial ? String(industrial).trim() : undefined,
                            budget
                        });
                    });
                }
                // Case 2: Multi-project array { projects: [ ... ] }
                else if (data && Array.isArray(data.projects)) {
                    data.projects.forEach((proj: any) => {
                        const projName = String(proj.name || proj.projectName || fallbackProjectName).trim();
                        const pStart = parseFlexibleDate(proj.startDate || proj.projectStartDate);
                        const pEnd = parseFlexibleDate(proj.endDate || proj.projectEndDate);
                        if (!overallStartDate && pStart) overallStartDate = pStart;
                        if (!overallEndDate && pEnd) overallEndDate = pEnd;

                        const taskList = Array.isArray(proj.tasks) ? proj.tasks : [];
                        taskList.forEach((t: any) => {
                            const taskName = t.name || t.tarea || t.task;
                            const startDate = parseFlexibleDate(t.startDate || t.inicio);
                            const endDate = parseFlexibleDate(t.endDate || t.fin);
                            if (!taskName || !startDate || !endDate) return;

                            let progress = typeof t.progress === 'number' ? t.progress : 0;
                            if (progress <= 1 && progress > 0) progress *= 100;
                            progress = Math.round(progress);

                            const budget = typeof t.budget === 'number' ? t.budget : (parseFloat(t.budget) || undefined);
                            const slack = typeof t.totalSlack === 'number' ? t.totalSlack : (parseFloat(t.totalSlack) || undefined);
                            const isCritical = Boolean(t.isCritical || (slack !== undefined && slack <= 0));

                            let taskType = 'T';
                            const rawType = String(t.type || 'T').toUpperCase();
                            if (rawType.includes('P')) taskType = 'P';
                            else if (rawType.includes('S')) taskType = 'S';

                            allParsedTasks.push({
                                id: Math.random().toString(36).substr(2, 9),
                                projectId: projName,
                                projectName: projName,
                                name: String(taskName),
                                startDate,
                                endDate,
                                isCritical,
                                wbs: t.wbs ? String(t.wbs) : undefined,
                                type: taskType,
                                delayDays: (progress >= 100) ? 0 : differenceInCalendarDays(new Date(), endDate),
                                totalSlack: slack,
                                progress,
                                industrial: t.industrial ? String(t.industrial).trim() : undefined,
                                budget
                            });
                        });
                    });
                }
                // Case 3: Flat array of tasks [ ... ]
                else if (Array.isArray(data)) {
                    data.forEach((t: any) => {
                        const projName = String(t.projectName || t.proyecto || t.obra || fallbackProjectName).trim();
                        const taskName = t.name || t.tarea || t.task;
                        const startDate = parseFlexibleDate(t.startDate || t.inicio);
                        const endDate = parseFlexibleDate(t.endDate || t.fin);
                        if (!taskName || !startDate || !endDate) return;

                        let progress = typeof t.progress === 'number' ? t.progress : 0;
                        if (progress <= 1 && progress > 0) progress *= 100;
                        progress = Math.round(progress);

                        const budget = typeof t.budget === 'number' ? t.budget : (parseFloat(t.budget) || undefined);
                        const slack = typeof t.totalSlack === 'number' ? t.totalSlack : (parseFloat(t.totalSlack) || undefined);
                        const isCritical = Boolean(t.isCritical || (slack !== undefined && slack <= 0));

                        let taskType = 'T';
                        const rawType = String(t.type || 'T').toUpperCase();
                        if (rawType.includes('P')) taskType = 'P';
                        else if (rawType.includes('S')) taskType = 'S';

                        allParsedTasks.push({
                            id: Math.random().toString(36).substr(2, 9),
                            projectId: projName,
                            projectName: projName,
                            name: String(taskName),
                            startDate,
                            endDate,
                            isCritical,
                            wbs: t.wbs ? String(t.wbs) : undefined,
                            type: taskType,
                            delayDays: (progress >= 100) ? 0 : differenceInCalendarDays(new Date(), endDate),
                            totalSlack: slack,
                            progress,
                            industrial: t.industrial ? String(t.industrial).trim() : undefined,
                            budget
                        });
                    });
                }

                if (allParsedTasks.length > 0) {
                    if (!overallStartDate) {
                        overallStartDate = allParsedTasks.reduce((min, t) => t.startDate < min ? t.startDate : min, allParsedTasks[0].startDate);
                    }
                    if (!overallEndDate) {
                        overallEndDate = allParsedTasks.reduce((max, t) => t.endDate > max ? t.endDate : max, allParsedTasks[0].endDate);
                    }

                    addTasks(allParsedTasks, { startDate: overallStartDate, endDate: overallEndDate, blobUrl });
                    const uniqueNames = Array.from(new Set(allParsedTasks.map(t => t.projectName)));
                    setSyncStatus('success');
                    setSyncMessage(`Cargadas ${allParsedTasks.length} tareas de ${uniqueNames.join(', ')} desde archivo JSON.`);
                    setTimeout(() => { setSyncStatus('idle'); }, 4000);
                } else {
                    setSyncStatus('error');
                    setSyncMessage('El archivo JSON no contiene tareas con fechas válidas.');
                }
            } catch (err: any) {
                console.error("Error al procesar JSON:", err);
                setSyncStatus('error');
                setSyncMessage(`Error en formato JSON: ${err.message}`);
            }
        };

        reader.onerror = () => {
            setSyncStatus('error');
            setSyncMessage('Error al leer el archivo JSON.');
        };
        reader.readAsText(file);
        return true;
    };

    const processFile = (file: File, blobUrl?: string) => {
        if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
            return processJsonFile(file, blobUrl);
        }

        setSyncStatus('loading');
        setSyncMessage(`Extrayendo tareas y analizando ${file.name}...`);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });

                // Analyze all sheets
                let globalStartDate: Date | undefined;
                let globalEndDate: Date | undefined;

                interface SheetCandidate {
                    sheetName: string;
                    isTaskSheet: boolean;
                    headerRowIndex: number;
                    headers: string[];
                    jsonData: any[][];
                    sheetStartDate?: Date;
                    sheetEndDate?: Date;
                }

                const sheetCandidates: SheetCandidate[] = [];

                for (const sheetName of workbook.SheetNames) {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                    if (!jsonData || jsonData.length === 0) continue;

                    let sheetStartDate: Date | undefined;
                    let sheetEndDate: Date | undefined;

                    // Scan first 40 rows for project-level milestone/contract dates
                    for (let r = 0; r < Math.min(jsonData.length, 40); r++) {
                        const row = jsonData[r];
                        if (!row || !Array.isArray(row)) continue;
                        for (let c = 0; c < row.length; c++) {
                            const cellStr = normalizeStr(row[c]);
                            const isStartLabel = cellStr.includes('inicio') && (cellStr.includes('obra') || cellStr.includes('proyecto') || cellStr.includes('contractual') || cellStr.includes('fecha'));
                            const isEndLabel = (cellStr.includes('fin') || cellStr.includes('termino') || cellStr.includes('final')) && (cellStr.includes('obra') || cellStr.includes('proyecto') || cellStr.includes('contractual') || cellStr.includes('fecha'));

                            if (isStartLabel && !sheetStartDate) {
                                for (let k = 1; k <= 10; k++) {
                                    const d = parseFlexibleDate(row[c + k]);
                                    if (d) { sheetStartDate = d; break; }
                                }
                            }
                            if (isEndLabel && !sheetEndDate) {
                                for (let k = 1; k <= 10; k++) {
                                    const d = parseFlexibleDate(row[c + k]);
                                    if (d) { sheetEndDate = d; break; }
                                }
                            }
                        }
                    }

                    if (sheetStartDate && !globalStartDate) globalStartDate = sheetStartDate;
                    if (sheetEndDate && !globalEndDate) globalEndDate = sheetEndDate;

                    // Smart Header Detection for this sheet
                    let headerRowIndex = -1;
                    let detectedHeaders: string[] = [];

                    for (let i = 0; i < Math.min(jsonData.length, 35); i++) {
                        const row = jsonData[i];
                        if (!row || !Array.isArray(row)) continue;
                        const rowValues = row.map(cell => normalizeStr(cell));

                        const hasTask = rowValues.some(v =>
                            v.includes('tarea') || v.includes('task') || v.includes('descripcion') || v.includes('actividad') || v.includes('nombre')
                        );
                        const hasDate = rowValues.some(v =>
                            v.includes('fecha') || v.includes('date') || v.includes('inicio') || v.includes('start') || v.includes('comienzo') || v.includes('fin') || v.includes('end')
                        );

                        if (hasTask && hasDate && jsonData.length > i + 1) {
                            headerRowIndex = i;
                            detectedHeaders = row.map(h => String(h || '').trim());
                            break;
                        }
                    }

                    const isTaskSheet = headerRowIndex !== -1 && detectedHeaders.length > 0;
                    sheetCandidates.push({
                        sheetName,
                        isTaskSheet,
                        headerRowIndex,
                        headers: detectedHeaders,
                        jsonData,
                        sheetStartDate,
                        sheetEndDate
                    });
                }

                // Filter sheets that actually contain tasks
                let taskSheets = sheetCandidates.filter(s => s.isTaskSheet);

                // If multiple task sheets exist, prioritize main operational sheets over secondary summary sheets (e.g. CLIENTE, OBRA, RESUMEN)
                if (taskSheets.length > 1) {
                    const SECONDARY_NAMES = ['cliente', 'obra', 'resumen', 'summary', 'revision', 'datos', 'data', 'portada', 'info'];
                    const primarySheets = taskSheets.filter(s => !SECONDARY_NAMES.includes(normalizeStr(s.sheetName)));
                    if (primarySheets.length > 0) {
                        taskSheets = primarySheets;
                    }
                }

                // Fallback: If no sheet matched task+date criteria, pick the sheet with most rows
                if (taskSheets.length === 0 && sheetCandidates.length > 0) {
                    const largestSheet = [...sheetCandidates].sort((a, b) => b.jsonData.length - a.jsonData.length)[0];
                    largestSheet.headerRowIndex = 0;
                    largestSheet.headers = (largestSheet.jsonData[0] || []).map(h => String(h || '').trim());
                    taskSheets = [largestSheet];
                }

                if (taskSheets.length === 0) {
                    setSyncStatus('error');
                    setSyncMessage('No se encontraron hojas con datos en el archivo.');
                    return;
                }

                // Determine active mapping
                let activeMapping = columnMapping;
                const primaryTaskSheet = taskSheets[0];

                if (!activeMapping) {
                    const autoMap: Partial<ColumnMapping> = {};
                    primaryTaskSheet.headers.forEach(header => {
                        const lower = normalizeStr(header);
                        if (!autoMap.taskCol && (lower.includes('tarea') || lower.includes('actividad') || lower.includes('descripcion') || lower.includes('task'))) autoMap.taskCol = header;
                        if (!autoMap.startCol && (lower.includes('inicio') || lower.includes('comienzo') || lower.includes('start'))) autoMap.startCol = header;
                        if (!autoMap.endCol && (lower.includes('fin') || lower.includes('termino') || lower.includes('final') || lower.includes('end'))) autoMap.endCol = header;
                        if (!autoMap.wbsCol && (lower.includes('wbs') || lower === 'id' || lower.includes('codigo') || lower.includes('code'))) autoMap.wbsCol = header;
                        if (!autoMap.typeCol && (lower.includes('tipo') || lower.includes('type'))) autoMap.typeCol = header;
                        if (!autoMap.slackCol && (lower.includes('holgura') || lower.includes('slack') || lower.includes('margen'))) autoMap.slackCol = header;
                        if (!autoMap.milestoneCol && (lower.includes('hito') || lower.includes('milestone'))) autoMap.milestoneCol = header;
                        if (!autoMap.budgetCol && (lower.includes('presupuesto') || lower.includes('importe') || lower.includes('coste') || lower.includes('budget') || lower.includes('amount'))) autoMap.budgetCol = header;
                    });

                    if (autoMap.taskCol && autoMap.startCol && autoMap.endCol) {
                        activeMapping = autoMap as ColumnMapping;
                        useStore.getState().setColumnMapping(activeMapping);
                    } else {
                        // Open mapping modal for user clarification
                        setRawHeaders(primaryTaskSheet.headers);
                        setMappingModalOpen(true);
                        setPendingFiles(prev => [...prev, { file, blobUrl }]);
                        setSyncStatus('idle');
                        return;
                    }
                }

                // Parse tasks across valid sheets
                const allParsedTasks: Task[] = [];
                let totalSheetsProcessed = 0;
                const getCleanFileName = (fname: string) => fname.replace(/\.(xlsx|xls|csv)$/i, '').trim();
                const cleanFileName = getCleanFileName(file.name);

                const GENERIC_NAMES = ['sheet1', 'sheet 1', 'hoja 1', 'hoja1', 'tareas', 'tasks', 'gantt', 'planning', 'cronograma', 'revision', 'datos'];

                let overallProjectStart: Date | undefined = globalStartDate;
                let overallProjectEnd: Date | undefined = globalEndDate;

                for (const taskSheet of taskSheets) {
                    const { sheetName, headers, headerRowIndex, jsonData, sheetStartDate, sheetEndDate } = taskSheet;
                    const isGenericSheet = GENERIC_NAMES.includes(normalizeStr(sheetName));
                    const projectName = isGenericSheet ? cleanFileName : sheetName;

                    const dataRows = jsonData.slice(headerRowIndex + 1);
                    const sheetTasks: Task[] = [];

                    dataRows.forEach((row: any) => {
                        const obj: any = {};
                        headers.forEach((h, idx) => { obj[h] = row[idx]; });

                        const taskName = obj[activeMapping.taskCol];
                        const startDate = parseFlexibleDate(obj[activeMapping.startCol]);
                        const endDate = parseFlexibleDate(obj[activeMapping.endCol]);

                        if (!startDate || !endDate || !taskName) return;

                        const normalizedTaskName = normalizeStr(taskName);
                        const IGNORED_KEYWORDS = ['gestion de residuos', 'seguridad y salud', 'contenedores', 'epp'];
                        if (IGNORED_KEYWORDS.some(k => normalizedTaskName.includes(k))) return;

                        // WBS
                        const wbsColToUse = activeMapping.wbsCol || headers.find(h => {
                            const l = normalizeStr(h);
                            return l === 'id' || l.includes('wbs') || l.includes('codigo');
                        });
                        const wbs = wbsColToUse ? obj[wbsColToUse] : undefined;

                        // Slack / Holgura
                        const slackColToUse = activeMapping.slackCol || headers.find(h => {
                            const l = normalizeStr(h);
                            return l.includes('holgura') || l.includes('slack');
                        });
                        const slack = slackColToUse ? parseFloat(String(obj[slackColToUse]).replace(',', '.')) : undefined;

                        // Progress %
                        let progress = 0;
                        const progressKeywords = ['% completado', '% avance', '% complete', 'avance', 'progreso', 'completado', 'complete', '% trabajo'];
                        for (const h of headers) {
                            if (progressKeywords.some(k => normalizeStr(h).includes(k))) {
                                const raw = obj[h];
                                if (raw !== undefined && raw !== null) {
                                    let val = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
                                    if (!isNaN(val) && val <= 1) val *= 100;
                                    if (!isNaN(val)) progress = Math.round(val);
                                }
                                break;
                            }
                        }

                        // Industrial / Contratista
                        const industrialKeywords = ['industrial', 'contratista', 'empresa', 'gremio', 'asignado', 'proveedor', 'recursos'];
                        const industrialHeader = headers.find(h => {
                            const norm = normalizeStr(h);
                            return industrialKeywords.some(key => norm.includes(key));
                        });
                        const industrial = industrialHeader && obj[industrialHeader]
                            ? String(obj[industrialHeader]).trim()
                            : undefined;

                        // Task Type: S > T > P
                        let taskType = 'P';
                        const typeColToUse = activeMapping.typeCol || headers.find(h => {
                            const l = normalizeStr(h);
                            return l === 'tipo' || l === 'type' || l.includes('tipo');
                        });
                        if (typeColToUse && obj[typeColToUse] !== undefined) {
                            const rawType = String(obj[typeColToUse]).toUpperCase().trim();
                            if (rawType.includes('S')) {
                                taskType = 'S';
                            } else if (rawType.includes('T')) {
                                taskType = 'T';
                            } else if (rawType.includes('P')) {
                                taskType = 'P';
                            }
                        }

                        // Budget
                        let parsedBudget: number | undefined = undefined;
                        const budgetColToUse = activeMapping.budgetCol || headers.find(h => {
                            const l = normalizeStr(h);
                            return l.includes('presupuesto') || l.includes('importe') || l.includes('coste') || l.includes('budget');
                        });
                        if (budgetColToUse && obj[budgetColToUse] !== undefined) {
                            const rawBudget = obj[budgetColToUse];
                            if (typeof rawBudget === 'number') {
                                parsedBudget = rawBudget;
                            } else {
                                let str = String(rawBudget).trim().replace(/[^\d.,-]/g, '');
                                const lastComma = str.lastIndexOf(',');
                                const lastDot = str.lastIndexOf('.');

                                if (lastComma > -1 && lastDot > -1) {
                                    if (lastComma > lastDot) {
                                        str = str.replace(/\./g, '').replace(',', '.');
                                    } else {
                                        str = str.replace(/,/g, '');
                                    }
                                } else if (lastComma > -1) {
                                    str = str.replace(',', '.');
                                } else {
                                    if (str.split('.').length > 2) {
                                        str = str.replace(/\./g, '');
                                    } else if (lastDot > -1 && str.length - lastDot === 4) {
                                        str = str.replace(/\./g, '');
                                    }
                                }

                                const parsed = parseFloat(str);
                                if (!isNaN(parsed)) parsedBudget = parsed;
                            }
                        }

                        sheetTasks.push({
                            id: Math.random().toString(36).substr(2, 9),
                            projectId: projectName,
                            projectName: projectName,
                            name: String(taskName),
                            startDate,
                            endDate,
                            isCritical: (activeMapping.criticalCol && !!obj[activeMapping.criticalCol]) || (slack !== undefined && slack <= 0),
                            wbs: wbs ? String(wbs) : undefined,
                            type: taskType,
                            delayDays: (progress >= 100) ? 0 : differenceInCalendarDays(new Date(), endDate),
                            totalSlack: isNaN(slack as number) ? undefined : slack,
                            progress: progress,
                            industrial: industrial || undefined,
                            budget: parsedBudget
                        });
                    });

                    if (sheetTasks.length > 0) {
                        allParsedTasks.push(...sheetTasks);
                        totalSheetsProcessed++;

                        if (!overallProjectStart) {
                            const minDate = sheetTasks.reduce((min, t) => t.startDate < min ? t.startDate : min, sheetTasks[0].startDate);
                            overallProjectStart = sheetStartDate || minDate;
                        }
                        if (!overallProjectEnd) {
                            const maxDate = sheetTasks.reduce((max, t) => t.endDate > max ? t.endDate : max, sheetTasks[0].endDate);
                            overallProjectEnd = sheetEndDate || maxDate;
                        }
                    }
                }

                if (allParsedTasks.length > 0) {
                    addTasks(allParsedTasks, { startDate: overallProjectStart, endDate: overallProjectEnd, blobUrl });
                    setSyncStatus('success');
                    setSyncMessage(`Cargadas ${allParsedTasks.length} tareas desde ${totalSheetsProcessed} hoja(s).`);
                    setTimeout(() => { setSyncStatus('idle'); }, 4000);
                } else {
                    setSyncStatus('error');
                    setSyncMessage('No se encontraron tareas con fechas válidas en el archivo.');
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

    const handleFiles = (files: File[]) => {
        files.forEach(file => {
            // Process locally immediately
            processFile(file);

            // Upload in background to remote storage if available
            uploadFile(file).then(blobUrl => {
                if (blobUrl) {
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
                        href="data:text/json;charset=utf-8,%7B%22project%22%3A%7B%22name%22%3A%22B167%20-%20Edificio%20Ejemplo%22%2C%22startDate%22%3A%222025-09-01%22%2C%22endDate%22%3A%222026-06-30%22%7D%2C%22tasks%22%3A%5B%7B%22wbs%22%3A%22100%22%2C%22type%22%3A%22P%22%2C%22name%22%3A%22Actuaciones%20Previas%22%2C%22startDate%22%3A%222025-09-01%22%2C%22endDate%22%3A%222025-09-30%22%2C%22budget%22%3A15000%2C%22progress%22%3A100%7D%2C%7B%22wbs%22%3A%22101%22%2C%22type%22%3A%22T%22%2C%22name%22%3A%22Demoliciones%20y%20Derribos%22%2C%22startDate%22%3A%222025-09-05%22%2C%22endDate%22%3A%222025-09-25%22%2C%22industrial%22%3A%22Derribos%20Levante%20SL%22%2C%22budget%22%3A9500%2C%22progress%22%3A80%2C%22isCritical%22%3Atrue%2C%22totalSlack%22%3A0%7D%2C%7B%22wbs%22%3A%22102%22%2C%22type%22%3A%22T%22%2C%22name%22%3A%22Saneamiento%20Horizontal%22%2C%22startDate%22%3A%222025-09-26%22%2C%22endDate%22%3A%222025-10-20%22%2C%22industrial%22%3A%22Fontaneria%20Redes%20SA%22%2C%22budget%22%3A14200%2C%22progress%22%3A0%2C%22isCritical%22%3Afalse%2C%22totalSlack%22%3A5%7D%5D%7D"
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
