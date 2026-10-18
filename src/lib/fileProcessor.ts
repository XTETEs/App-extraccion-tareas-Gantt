import * as XLSX from 'xlsx';
import { differenceInCalendarDays } from 'date-fns';
import type { Task, ColumnMapping } from '../types';
import { useStore } from '../store/useStore';

export const normalizeStr = (s: any) =>
    String(s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

export const parseFlexibleDate = (val: any): Date | undefined => {
    if (val instanceof Date && !isNaN(val.getTime())) return val;
    if (val === undefined || val === null || val === '') return undefined;

    // Excel numeric serial or epoch timestamp
    if (typeof val === 'number') {
        if (val > 100_000_000_000) {
            // Milliseconds epoch timestamp (e.g. 1735689600000)
            const d = new Date(val);
            if (!isNaN(d.getTime())) return d;
        } else if (val > 100_000_000) {
            // Seconds epoch timestamp (e.g. 1735689600)
            const d = new Date(val * 1000);
            if (!isNaN(d.getTime())) return d;
        } else if (val > 0 && val < 100_000) {
            // Excel serial date (e.g. 45897)
            const d = new Date(Math.round((val - 25569) * 864e5));
            if (!isNaN(d.getTime())) return d;
        }
        return undefined;
    }

    const str = String(val).trim();
    if (!str) return undefined;

    // Epoch timestamp as string
    if (/^\d{10,13}$/.test(str)) {
        const num = parseInt(str, 10);
        const d = num > 100_000_000_000 ? new Date(num) : new Date(num * 1000);
        if (!isNaN(d.getTime())) return d;
    }

    // Numeric Excel serial as string (e.g. "45897" or "45897.5")
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

export const parseJsonTaskItem = (t: any, defaultProjectName: string): Task | null => {
    if (!t || typeof t !== 'object') return null;

    const taskName = t.name || t.tarea || t.task || t.actividad || t.descripcion || t.nombre || t.concepto;
    const startDate = parseFlexibleDate(t.startDate || t.inicio || t.start || t.fechaInicio || t.fecha_inicio || t.comienzo || t.fechaComienzo || t.fecha_comienzo);
    const endDate = parseFlexibleDate(t.endDate || t.fin || t.end || t.fechaFin || t.fecha_fin || t.termino || t.final || t.fechaTermino || t.fecha_termino);

    if (!taskName || !startDate || !endDate) return null;

    const projName = String(
        t.projectName || t.proyecto || t.obra || t.project || t.nombreObra || t.nombre_proyecto || defaultProjectName
    ).trim();

    // Progress %
    const rawProgress = t.progress !== undefined ? t.progress : (t.avance !== undefined ? t.avance : (t.progreso !== undefined ? t.progreso : (t.completado !== undefined ? t.completado : (t['% avance'] !== undefined ? t['% avance'] : (t['% completado'] !== undefined ? t['% completado'] : (t.porcentajeAvance !== undefined ? t.porcentajeAvance : 0))))));
    let progress = typeof rawProgress === 'number' ? rawProgress : parseFloat(String(rawProgress).replace(/[^\d.,-]/g, '').replace(',', '.'));
    if (isNaN(progress)) progress = 0;
    if (progress <= 1 && progress > 0) progress *= 100;
    progress = Math.round(progress);

    // Budget
    const rawBudget = 
        t.budget !== undefined ? t.budget :
        t.budgetNoVat !== undefined ? t.budgetNoVat :
        t.budget_no_vat !== undefined ? t.budget_no_vat :
        t.budgetNovat !== undefined ? t.budgetNovat :
        t.presupuesto !== undefined ? t.presupuesto :
        t.presupuestoNoVat !== undefined ? t.presupuestoNoVat :
        t.presupuestoSinIva !== undefined ? t.presupuestoSinIva :
        t.presupuesto_sin_iva !== undefined ? t.presupuesto_sin_iva :
        t.importe !== undefined ? t.importe :
        t.importeSinIva !== undefined ? t.importeSinIva :
        t.importe_sin_iva !== undefined ? t.importe_sin_iva :
        t.coste !== undefined ? t.coste :
        t.costo !== undefined ? t.costo :
        t.costeSinIva !== undefined ? t.costeSinIva :
        t.costoSinIva !== undefined ? t.costoSinIva :
        t.precio !== undefined ? t.precio :
        t.totalBudget !== undefined ? t.totalBudget :
        t.monto !== undefined ? t.monto :
        t.amount !== undefined ? t.amount :
        t.cost !== undefined ? t.cost : undefined;
    let budget: number | undefined;
    if (typeof rawBudget === 'number') {
        budget = rawBudget;
    } else if (rawBudget !== undefined && rawBudget !== null) {
        let clean = String(rawBudget).trim().replace(/[^\d.,-]/g, '');
        const lastComma = clean.lastIndexOf(',');
        const lastDot = clean.lastIndexOf('.');
        if (lastComma > -1 && lastDot > -1) {
            clean = lastComma > lastDot ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, '');
        } else if (lastComma > -1) {
            clean = clean.replace(',', '.');
        }
        const parsed = parseFloat(clean);
        if (!isNaN(parsed)) budget = parsed;
    }

    // Slack
    const rawSlack = t.totalSlack !== undefined ? t.totalSlack : (t.slack !== undefined ? t.slack : (t.holgura !== undefined ? t.holgura : (t.holguraTotal !== undefined ? t.holguraTotal : t.margen)));
    let slack: number | undefined;
    if (typeof rawSlack === 'number') {
        slack = rawSlack;
    } else if (rawSlack !== undefined && rawSlack !== null) {
        const parsed = parseFloat(String(rawSlack).replace(',', '.'));
        if (!isNaN(parsed)) slack = parsed;
    }

    // Task Type: S > T > P
    let taskType = 'T';
    const rawType = String(t.type || t.tipo || t.tipoTarea || 'T').toUpperCase().trim();
    if (rawType.includes('P')) taskType = 'P';
    else if (rawType.includes('S')) taskType = 'S';
    else taskType = 'T';

    // Industrial / Contratista
    const rawIndustrial = t.industrial || t.contratista || t.empresa || t.gremio || t.proveedor || t.asignado || t.recursos;
    const industrial = rawIndustrial ? String(rawIndustrial).trim() : undefined;

    // Critical
    const isCritical = Boolean(t.isCritical || t.critica || t.esCritica || t.critico || (slack !== undefined && slack <= 0));

    // WBS
    const rawWbs = t.wbs !== undefined ? t.wbs : (t.codigo !== undefined ? t.codigo : (t.code !== undefined ? t.code : undefined));
    const wbs = rawWbs !== undefined ? String(rawWbs).trim() : undefined;

    const id = t.id ? String(t.id) : Math.random().toString(36).substr(2, 9);

    return {
        id,
        projectId: projName,
        projectName: projName,
        name: String(taskName).trim(),
        startDate,
        endDate,
        isCritical,
        wbs,
        type: taskType,
        delayDays: (progress >= 100) ? 0 : differenceInCalendarDays(new Date(), endDate),
        totalSlack: isNaN(slack as number) ? undefined : slack,
        progress,
        industrial,
        budget
    };
};

export interface ProcessJsonResult {
    tasks: Task[];
    projectDatesMap: Map<string, { startDate?: Date; endDate?: Date; budget?: number; blobUrl?: string }>;
}

export const processJsonData = (rawText: string, fallbackName: string, blobUrl?: string): ProcessJsonResult => {
    let data = JSON.parse(rawText);

    // Unwrap envelopes if present
    if (data && typeof data === 'object') {
        if (data.data && typeof data.data === 'object') data = data.data;
        else if (data.cronograma && typeof data.cronograma === 'object') data = data.cronograma;
        else if (data.plan && typeof data.plan === 'object') data = data.plan;
        else if (data.schedule && typeof data.schedule === 'object') data = data.schedule;
    }

    const allParsedTasks: Task[] = [];
    const projectDatesMap = new Map<string, { startDate?: Date; endDate?: Date; budget?: number; blobUrl?: string }>();

    const recordProjectDates = (projName: string, start?: Date, end?: Date, budget?: number) => {
        if (!projName) return;
        const existing = projectDatesMap.get(projName) || {};
        projectDatesMap.set(projName, {
            startDate: start || existing.startDate,
            endDate: end || existing.endDate,
            budget: (typeof budget === 'number' && !isNaN(budget)) ? budget : existing.budget,
            blobUrl
        });
    };

    // Case A: Multi-project array
    const projectsArray = Array.isArray(data?.projects) ? data.projects :
        (Array.isArray(data?.obras) ? data.obras :
        (Array.isArray(data?.proyectos) ? data.proyectos : null));

    // Case B: Single project object
    const singleProjectObj = (data?.project && typeof data.project === 'object') ? data.project :
        ((data?.obra && typeof data.obra === 'object') ? data.obra :
        ((data?.proyecto && typeof data.proyecto === 'object') ? data.proyecto : null));

    // Case C: Array of tasks
    const tasksArray = Array.isArray(data?.tasks) ? data.tasks :
        (Array.isArray(data?.tareas) ? data.tareas :
        (Array.isArray(data?.actividades) ? data.actividades : null));

    if (projectsArray && projectsArray.length > 0) {
        // App Backup / Full Export format where projects and tasks are separate
        if (tasksArray && tasksArray.length > 0) {
            projectsArray.forEach((proj: any) => {
                const pName = String(proj.name || proj.nombre || proj.projectName || '').trim();
                const pBudget = typeof proj.budget === 'number' ? proj.budget :
                    (typeof proj.budgetNoVat === 'number' ? proj.budgetNoVat :
                    (typeof proj.totalBudget === 'number' ? proj.totalBudget :
                    (typeof proj.presupuesto === 'number' ? proj.presupuesto : undefined)));
                if (pName) {
                    recordProjectDates(
                        pName,
                        parseFlexibleDate(proj.startDate || proj.fechaInicio || proj.contractStartDate),
                        parseFlexibleDate(proj.endDate || proj.fechaFin || proj.contractEndDate || proj.calculatedEndDate),
                        pBudget
                    );
                }
            });

            tasksArray.forEach((t: any) => {
                const parsed = parseJsonTaskItem(t, fallbackName);
                if (parsed) allParsedTasks.push(parsed);
            });
        } else {
            // Each project in projectsArray contains its own tasks list
            projectsArray.forEach((proj: any) => {
                const projName = String(proj.name || proj.nombre || proj.projectName || fallbackName).trim();
                const pStart = parseFlexibleDate(proj.startDate || proj.fechaInicio || proj.contractStartDate || proj.projectStartDate);
                const pEnd = parseFlexibleDate(proj.endDate || proj.fechaFin || proj.contractEndDate || proj.calculatedEndDate || proj.projectEndDate);
                const pBudget = typeof proj.budget === 'number' ? proj.budget :
                    (typeof proj.budgetNoVat === 'number' ? proj.budgetNoVat :
                    (typeof proj.totalBudget === 'number' ? proj.totalBudget :
                    (typeof proj.presupuesto === 'number' ? proj.presupuesto : undefined)));
                recordProjectDates(projName, pStart, pEnd, pBudget);

                const innerTasks = Array.isArray(proj.tasks) ? proj.tasks :
                    (Array.isArray(proj.tareas) ? proj.tareas :
                    (Array.isArray(proj.actividades) ? proj.actividades : []));

                innerTasks.forEach((t: any) => {
                    const parsed = parseJsonTaskItem(t, projName);
                    if (parsed) allParsedTasks.push(parsed);
                });
            });
        }
    } else if (singleProjectObj || data?.projectName || data?.nombreObra || (typeof data?.obra === 'string') || (typeof data?.proyecto === 'string')) {
        const defaultProjName = String(
            singleProjectObj?.name || singleProjectObj?.nombre ||
            data?.projectName || data?.nombreObra ||
            (typeof data?.obra === 'string' ? data.obra : '') ||
            (typeof data?.proyecto === 'string' ? data.proyecto : '') ||
            fallbackName
        ).trim();

        const pStart = parseFlexibleDate(
            singleProjectObj?.startDate || singleProjectObj?.fechaInicio || singleProjectObj?.contractStartDate ||
            data?.startDate || data?.projectStartDate || data?.fechaInicio
        );
        const pEnd = parseFlexibleDate(
            singleProjectObj?.endDate || singleProjectObj?.fechaFin || singleProjectObj?.contractEndDate || singleProjectObj?.calculatedEndDate ||
            data?.endDate || data?.projectEndDate || data?.fechaFin
        );
        
        const pBudget = typeof singleProjectObj?.budget === 'number' ? singleProjectObj.budget :
            (typeof singleProjectObj?.budgetNoVat === 'number' ? singleProjectObj.budgetNoVat :
            (typeof data?.metrics?.totalBudget === 'number' ? data.metrics.totalBudget :
            (typeof data?.summary?.totalBudget === 'number' ? data.summary.totalBudget :
            (typeof data?.budget === 'number' ? data.budget : undefined))));

        recordProjectDates(defaultProjName, pStart, pEnd, pBudget);

        const targetTasks = tasksArray || [];
        targetTasks.forEach((t: any) => {
            const parsed = parseJsonTaskItem(t, defaultProjName);
            if (parsed) allParsedTasks.push(parsed);
        });
    } else if (tasksArray && tasksArray.length > 0) {
        tasksArray.forEach((t: any) => {
            const parsed = parseJsonTaskItem(t, fallbackName);
            if (parsed) allParsedTasks.push(parsed);
        });
    } else if (Array.isArray(data)) {
        data.forEach((t: any) => {
            const parsed = parseJsonTaskItem(t, fallbackName);
            if (parsed) allParsedTasks.push(parsed);
        });
    } else if (data && typeof data === 'object') {
        // Key-value dictionary where keys are project names
        Object.entries(data).forEach(([key, val]: [string, any]) => {
            if (Array.isArray(val)) {
                val.forEach((t: any) => {
                    const parsed = parseJsonTaskItem(t, key);
                    if (parsed) allParsedTasks.push(parsed);
                });
            } else if (val && typeof val === 'object') {
                const valTasks = Array.isArray(val.tasks) ? val.tasks :
                    (Array.isArray(val.tareas) ? val.tareas :
                    (Array.isArray(val.actividades) ? val.actividades : null));
                if (valTasks) {
                    const pStart = parseFlexibleDate(val.startDate || val.fechaInicio);
                    const pEnd = parseFlexibleDate(val.endDate || val.fechaFin);
                    recordProjectDates(key, pStart, pEnd);
                    valTasks.forEach((t: any) => {
                        const parsed = parseJsonTaskItem(t, key);
                        if (parsed) allParsedTasks.push(parsed);
                    });
                }
            }
        });
    }

    // Populate project dates from tasks bounds if not explicitly set
    const projectNames = Array.from(new Set(allParsedTasks.map(t => t.projectName)));
    projectNames.forEach(pName => {
        const pTasks = allParsedTasks.filter(t => t.projectName === pName);
        const existing = projectDatesMap.get(pName) || {};
        const minStart = existing.startDate || new Date(Math.min(...pTasks.map(t => t.startDate.getTime())));
        const maxEnd = existing.endDate || new Date(Math.max(...pTasks.map(t => t.endDate.getTime())));
        projectDatesMap.set(pName, {
            startDate: minStart,
            endDate: maxEnd,
            blobUrl
        });
    });

    return { tasks: allParsedTasks, projectDatesMap };
};

export const uploadFileToBlob = async (file: File): Promise<string | undefined> => {
    try {
        const response = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            body: file,
        });
        if (!response.ok) return undefined;
        const newBlob = await response.json();
        return newBlob.url;
    } catch (error) {
        console.warn('[uploadFileToBlob] Subida a la nube omitida (operando en modo local):', error);
        return undefined;
    }
};

export const isJsonFile = (file: File | string): boolean => {
    const name = typeof file === 'string' ? file : file.name;
    const type = typeof file === 'object' && file.type ? file.type : '';
    return name.toLowerCase().endsWith('.json') || type === 'application/json';
};

export const processAnyFile = async (
    file: File,
    options?: {
        blobUrl?: string;
        onStatus?: (status: 'loading' | 'success' | 'error', message: string) => void;
    }
): Promise<boolean> => {
    const { onStatus, blobUrl } = options || {};
    const store = useStore.getState();

    if (isJsonFile(file)) {
        onStatus?.('loading', `Importando planificación JSON de ${file.name}...`);
        try {
            const text = await file.text();
            const cleanName = file.name.replace(/\.(json|xlsx|xls|csv)$/i, '').trim();
            const { tasks, projectDatesMap } = processJsonData(text, cleanName, blobUrl);

            if (tasks.length > 0) {
                await store.addTasks(tasks, projectDatesMap);
                const uniqueNames = Array.from(new Set(tasks.map(t => t.projectName)));
                onStatus?.('success', `Cargadas ${tasks.length} tareas de ${uniqueNames.join(', ')} desde archivo JSON.`);
                return true;
            } else {
                onStatus?.('error', 'El archivo JSON no contiene tareas con fechas válidas.');
                return false;
            }
        } catch (err: any) {
            console.error("Error al procesar archivo JSON:", err);
            onStatus?.('error', `Error en formato JSON: ${err.message}`);
            return false;
        }
    }

    // Otherwise, process as Excel / CSV
    onStatus?.('loading', `Extrayendo tareas y analizando ${file.name}...`);
    try {
        const buffer = await file.arrayBuffer();
        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

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

            let headerRowIndex = -1;
            let detectedHeaders: string[] = [];

            for (let i = 0; i < Math.min(jsonData.length, 35); i++) {
                const row = jsonData[i];
                if (!row || !Array.isArray(row)) continue;
                const rowValues = row.map(cell => normalizeStr(cell));

                // Skip obvious metadata/title banner rows
                const isMetadataBanner = rowValues.some(v => 
                    v.startsWith('nombre del proyecto') || 
                    v.startsWith('nombre de obra') || 
                    v.startsWith('proyecto:') || 
                    v.startsWith('obra:') ||
                    v.startsWith('cliente:')
                );
                if (isMetadataBanner) continue;

                const hasTask = rowValues.some(v =>
                    v === 'tarea' || v === 'actividad' || v === 'descripcion' || v === 'task' || v === 'partida' ||
                    v.includes('tarea') || v.includes('actividad') || v.includes('descripcion') || (v.includes('nombre') && !v.includes('proyecto') && !v.includes('obra'))
                );
                const hasDate = rowValues.some(v =>
                    v.includes('inicio') || v.includes('start') || v.includes('comienzo') || v.includes('fin') || v.includes('end') || v.includes('termino') || v.includes('fecha')
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

        let taskSheets = sheetCandidates.filter(s => s.isTaskSheet);

        if (taskSheets.length > 1) {
            const SECONDARY_NAMES = ['cliente', 'obra', 'resumen', 'summary', 'revision', 'datos', 'data', 'portada', 'info'];
            const primarySheets = taskSheets.filter(s => !SECONDARY_NAMES.includes(normalizeStr(s.sheetName)));
            if (primarySheets.length > 0) {
                taskSheets = primarySheets;
            }
        }

        if (taskSheets.length === 0 && sheetCandidates.length > 0) {
            const largestSheet = [...sheetCandidates].sort((a, b) => b.jsonData.length - a.jsonData.length)[0];
            largestSheet.headerRowIndex = 0;
            largestSheet.headers = (largestSheet.jsonData[0] || []).map(h => String(h || '').trim());
            taskSheets = [largestSheet];
        }

        if (taskSheets.length === 0) {
            onStatus?.('error', 'No se encontraron hojas con datos en el archivo.');
            return false;
        }

        const primaryTaskSheet = taskSheets[0];
        const autoMap: Partial<ColumnMapping> = {};

        // 1. Try keyword matching on detected headers
        primaryTaskSheet.headers.forEach(header => {
            const lower = normalizeStr(header);
            if (!autoMap.taskCol && (
                lower === 'tarea' || lower === 'actividad' || lower === 'descripcion' || lower === 'task' || lower === 'partida' ||
                lower.includes('tarea') || lower.includes('actividad') || lower.includes('descripcion') || (lower.includes('nombre') && !lower.includes('proyecto') && !lower.includes('obra'))
            )) {
                autoMap.taskCol = header;
            }
            if (!autoMap.startCol && (lower.includes('inicio') || lower.includes('comienzo') || lower.includes('start') || lower.includes('desde'))) {
                autoMap.startCol = header;
            }
            if (!autoMap.endCol && (lower.includes('fin') || lower.includes('termino') || lower.includes('final') || lower.includes('end') || lower.includes('hasta'))) {
                autoMap.endCol = header;
            }
            if (!autoMap.wbsCol && (lower.includes('wbs') || lower === 'id' || lower.includes('codigo') || lower.includes('code'))) {
                autoMap.wbsCol = header;
            }
            if (!autoMap.typeCol && (lower.includes('tipo') || lower.includes('type'))) {
                autoMap.typeCol = header;
            }
            if (!autoMap.slackCol && (lower.includes('holgura') || lower.includes('slack') || lower.includes('margen'))) {
                autoMap.slackCol = header;
            }
            if (!autoMap.milestoneCol && (lower.includes('hito') || lower.includes('milestone'))) {
                autoMap.milestoneCol = header;
            }
            if (!autoMap.budgetCol && (
                lower.includes('presupuesto') || lower.includes('importe') || lower.includes('coste') || lower.includes('costo') ||
                lower.includes('budget') || lower.includes('amount') || lower.includes('monto')
            )) {
                autoMap.budgetCol = header;
            }
        });

        // 2. Content-based automatic fallback if headers did not match
        if (!autoMap.taskCol || !autoMap.startCol || !autoMap.endCol) {
            const sampleRows = primaryTaskSheet.jsonData.slice(primaryTaskSheet.headerRowIndex + 1, primaryTaskSheet.headerRowIndex + 40);
            const dateCols: { header: string; count: number }[] = [];
            const textCols: { header: string; count: number }[] = [];

            primaryTaskSheet.headers.forEach((header, colIdx) => {
                let dateCount = 0;
                let textCount = 0;

                sampleRows.forEach(row => {
                    if (!Array.isArray(row)) return;
                    const val = row[colIdx];
                    if (val === undefined || val === null || val === '') return;
                    if (parseFlexibleDate(val)) {
                        dateCount++;
                    } else if (typeof val === 'string' && val.trim().length > 2 && isNaN(Number(val))) {
                        textCount++;
                    }
                });

                if (dateCount > 0) dateCols.push({ header, count: dateCount });
                if (textCount > 0) textCols.push({ header, count: textCount });
            });

            dateCols.sort((a, b) => b.count - a.count);
            textCols.sort((a, b) => b.count - a.count);

            if (!autoMap.startCol && dateCols.length > 0) {
                autoMap.startCol = dateCols[0].header;
            }
            if (!autoMap.endCol && dateCols.length > 1) {
                autoMap.endCol = dateCols[1].header;
            } else if (!autoMap.endCol && autoMap.startCol) {
                autoMap.endCol = autoMap.startCol;
            }

            if (!autoMap.taskCol) {
                const bestText = textCols.find(c => c.header !== autoMap.startCol && c.header !== autoMap.endCol);
                if (bestText) autoMap.taskCol = bestText.header;
            }
        }

        const activeMapping: ColumnMapping = {
            taskCol: autoMap.taskCol || primaryTaskSheet.headers[0] || '',
            startCol: autoMap.startCol || primaryTaskSheet.headers[1] || '',
            endCol: autoMap.endCol || primaryTaskSheet.headers[2] || '',
            wbsCol: autoMap.wbsCol,
            typeCol: autoMap.typeCol,
            slackCol: autoMap.slackCol,
            milestoneCol: autoMap.milestoneCol,
            budgetCol: autoMap.budgetCol
        };

        const allParsedTasks: Task[] = [];
        let totalSheetsProcessed = 0;
        const cleanFileName = file.name.replace(/\.(xlsx|xls|csv)$/i, '').trim();
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

                const taskName = obj[activeMapping!.taskCol];
                const startDate = parseFlexibleDate(obj[activeMapping!.startCol]);
                const endDate = parseFlexibleDate(obj[activeMapping!.endCol]);

                if (!startDate || !endDate || !taskName) return;

                const normalizedTaskName = normalizeStr(taskName);
                const IGNORED_KEYWORDS = ['gestion de residuos', 'seguridad y salud', 'contenedores', 'epp'];
                if (IGNORED_KEYWORDS.some(k => normalizedTaskName.includes(k))) return;

                const wbsColToUse = activeMapping!.wbsCol || headers.find(h => {
                    const l = normalizeStr(h);
                    return l === 'id' || l.includes('wbs') || l.includes('codigo');
                });
                const wbs = wbsColToUse ? obj[wbsColToUse] : undefined;

                const slackColToUse = activeMapping!.slackCol || headers.find(h => {
                    const l = normalizeStr(h);
                    return l.includes('holgura') || l.includes('slack');
                });
                const slack = slackColToUse ? parseFloat(String(obj[slackColToUse]).replace(',', '.')) : undefined;

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

                const industrialKeywords = ['industrial', 'contratista', 'empresa', 'gremio', 'asignado', 'proveedor', 'recursos'];
                const industrialHeader = headers.find(h => {
                    const norm = normalizeStr(h);
                    return industrialKeywords.some(key => norm.includes(key));
                });
                const industrial = industrialHeader && obj[industrialHeader]
                    ? String(obj[industrialHeader]).trim()
                    : undefined;

                let taskType = 'P';
                const typeColToUse = activeMapping!.typeCol || headers.find(h => {
                    const l = normalizeStr(h);
                    return l === 'tipo' || l === 'type' || l.includes('tipo');
                });
                if (typeColToUse && obj[typeColToUse] !== undefined) {
                    const rawType = String(obj[typeColToUse]).toUpperCase().trim();
                    if (rawType.includes('S')) taskType = 'S';
                    else if (rawType.includes('T')) taskType = 'T';
                    else if (rawType.includes('P')) taskType = 'P';
                }

                let parsedBudget: number | undefined = undefined;
                const budgetColToUse = activeMapping!.budgetCol || headers.find(h => {
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
                            str = lastComma > lastDot ? str.replace(/\./g, '').replace(',', '.') : str.replace(/,/g, '');
                        } else if (lastComma > -1) {
                            str = str.replace(',', '.');
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
                    isCritical: (activeMapping!.criticalCol && !!obj[activeMapping!.criticalCol]) || (slack !== undefined && slack <= 0),
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
            await store.addTasks(allParsedTasks, { startDate: overallProjectStart, endDate: overallProjectEnd, blobUrl });
            onStatus?.('success', `Cargadas ${allParsedTasks.length} tareas desde ${totalSheetsProcessed} hoja(s).`);
            return true;
        } else {
            onStatus?.('error', 'No se encontraron tareas con fechas válidas en el archivo.');
            return false;
        }
    } catch (err: any) {
        console.error("Error al procesar archivo Excel:", err);
        onStatus?.('error', `Error: ${err.message}`);
        return false;
    }
};
