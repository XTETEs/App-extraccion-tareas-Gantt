import * as XLSX from 'xlsx';
import type { Task, ColumnMapping } from '../types';
import { differenceInCalendarDays } from 'date-fns';

export function parseFlexibleDate(val: any): Date | undefined {
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
}

export interface ParseExcelResult {
    type: 'success' | 'needs_mapping';
    tasks?: Task[];
    startDate?: Date;
    endDate?: Date;
    totalSheetsProcessed?: number;
    headers?: string[];
}

export function parseExcelWorkbook(workbook: XLSX.WorkBook, columnMapping: ColumnMapping | null): ParseExcelResult {
    const allParsedTasks: Task[] = [];
    let totalSheetsProcessed = 0;
    let firstProjectStartDate: Date | undefined = undefined;
    let firstProjectEndDate: Date | undefined = undefined;

    const firstSheetName = workbook.SheetNames[0];
    const SKIP_SHEET_NAMES = [
        'obra', 'cliente', 'actividad', 'actividades', 'tarea', 'descripcion',
        'nombre', 'datos', 'data', 'resumen', 'summary', 'info',
        'sheet1', 'sheet 1', 'hoja1', 'hoja 1', 'tasks', 'tareas', 'gantt',
        'proyecto', 'proyectos', 'lista', 'listado'
    ];

    for (const sheetName of workbook.SheetNames) {
        const isFirstSheet = sheetName === firstSheetName;
        const isSkipName = SKIP_SHEET_NAMES.includes(sheetName.toLowerCase().trim());
        if (!isFirstSheet && isSkipName) {
            console.log(`[excelParser] Ignorando hoja secundaria: "${sheetName}"`);
            continue;
        }
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (jsonData.length === 0) continue;

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
            return {
                type: 'needs_mapping',
                headers
            };
        }

        const sheetTasks: Task[] = [];
        const dataRows = jsonData.slice(headerRowIndex + 1);
        const projectName = firstSheetName;

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

            const industrialKeywords = ['industrial', 'contratista', 'empresa', 'gremio', 'asignado', 'proveedor'];
            const industrialHeader = headers.find(h => {
                const normalized = String(h || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                return industrialKeywords.some(key => normalized.includes(key));
            });
            const industrial = industrialHeader && obj[industrialHeader]
                ? String(obj[industrialHeader]).trim()
                : undefined;

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
                progress: progress,
                industrial: industrial || undefined
            });
        });

        if (sheetTasks.length > 0) {
            allParsedTasks.push(...sheetTasks);
            totalSheetsProcessed++;
        }
    }

    return {
        type: 'success',
        tasks: allParsedTasks,
        startDate: firstProjectStartDate,
        endDate: firstProjectEndDate,
        totalSheetsProcessed
    };
}
