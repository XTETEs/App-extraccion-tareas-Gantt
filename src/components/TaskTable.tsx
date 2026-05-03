import { useState } from 'react';
import type { Task } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn, stringToColor } from '../lib/utils';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";


interface TaskTableProps {
    tasks: Task[];
}

export function TaskTable({ tasks }: TaskTableProps) {
    const { dateRange, projects } = useStore();
    const [collapsedProjects, setCollapsedProjects] = useState<string[]>([]);

    // Filters
    const [filterDelayed, setFilterDelayed] = useState(false);
    const [filterCritical, setFilterCritical] = useState(false);
    const [filterTypeS, setFilterTypeS] = useState(false);

    // Pagination
    const ITEMS_PER_PAGE = 50;
    const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});

    const getVisibleCount = (project: string) => visibleCounts[project] || ITEMS_PER_PAGE;
    const loadMore = (project: string) => {
        setVisibleCounts(prev => ({ ...prev, [project]: getVisibleCount(project) + ITEMS_PER_PAGE }));
    };

    // Filter Tasks
    const filteredTasks = tasks.filter(task => {
        if (filterDelayed && !(task.delayDays && task.delayDays > 0)) return false;
        if (filterCritical && !(task.totalSlack === 0 || task.isCritical)) return false;
        if (filterTypeS && task.type !== 'S') return false;
        return true;
    });

    const exportToExcel = () => {
        if (filteredTasks.length === 0) return;

        const exportData = filteredTasks.map(task => {
            const isDelayed = (task.delayDays || 0) > 0;
            const delayText = isDelayed ? `Retraso: +${task.delayDays} días` : 'En fecha';

            return {
                'Proyecto': task.projectName || 'Sin Proyecto',
                'Tipo': task.type || 'P',
                'WBS': task.wbs || '',
                'Actividad / Tarea': task.name,
                'Inicio': format(task.startDate, 'dd/MM/yyyy', { locale: es }),
                'Fin': format(task.endDate, 'dd/MM/yyyy', { locale: es }),
                'Días de Retraso': task.delayDays || 0,
                'Estado': delayText,
                'Holgura Total': task.totalSlack !== undefined ? task.totalSlack : '',
                'Crítica': task.isCritical ? 'Sí' : 'No',
            };
        });

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tareas");

        // Ajustar anchos de columna
        ws['!cols'] = [
            { wch: 25 }, // Proyecto
            { wch: 6 },  // Tipo
            { wch: 15 }, // WBS
            { wch: 50 }, // Tarea
            { wch: 12 }, // Inicio
            { wch: 12 }, // Fin
            { wch: 16 }, // Retraso
            { wch: 20 }, // Estado
            { wch: 14 }, // Holgura
            { wch: 10 }, // Crítica
        ];

        const fileName = `Exportacion_Tareas_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // 1. Group by Project Name
    const tasksByProject: Record<string, Task[]> = {};
    filteredTasks.forEach(task => {
        const key = task.projectName || 'Sin Proyecto';
        if (!tasksByProject[key]) tasksByProject[key] = [];
        tasksByProject[key].push(task);
    });

    // 2. Sort Project Names based on Store Order
    const sortedProjectNames = Object.keys(tasksByProject).sort((a, b) => {
        const orderA = projects.find(p => p.name === a)?.order ?? 999;
        const orderB = projects.find(p => p.name === b)?.order ?? 999;
        return orderA - orderB;
    });

    // Toggle Handlers
    const toggleProject = (projectName: string) => {
        setCollapsedProjects(prev =>
            prev.includes(projectName)
                ? prev.filter(p => p !== projectName)
                : [...prev, projectName]
        );
    };

    const toggleAll = (collapse: boolean) => {
        if (collapse) {
            setCollapsedProjects(sortedProjectNames);
        } else {
            setCollapsedProjects([]);
        }
    };

    const allCollapsed = sortedProjectNames.length > 0 && collapsedProjects.length === sortedProjectNames.length;

    Object.keys(tasksByProject).forEach(key => {
        tasksByProject[key].sort((a, b) => {
            // Custom WBS Segment Sort
            const strA = a.wbs ? a.wbs.toString().trim() : '';
            const strB = b.wbs ? b.wbs.toString().trim() : '';

            if (strA && strB) {
                // Split by common separators (., -, space)
                const partsA = strA.split(/[\.\-\s]+/);
                const partsB = strB.split(/[\.\-\s]+/);

                const len = Math.min(partsA.length, partsB.length);
                for (let i = 0; i < len; i++) {
                    const numA = parseInt(partsA[i], 10);
                    const numB = parseInt(partsB[i], 10);

                    if (!isNaN(numA) && !isNaN(numB)) {
                        if (numA !== numB) return numA - numB;
                    } else {
                        // Fallback to string compare for non-numeric segments
                        const cmp = partsA[i].localeCompare(partsB[i], undefined, { numeric: true });
                        if (cmp !== 0) return cmp;
                    }
                }
                // If prefix matches, shorter length first (1.1 before 1.1.1)
                return partsA.length - partsB.length;
            }

            // Tasks with WBS come first
            if (strA && !strB) return -1;
            if (!strA && strB) return 1;

            // Tie-breaker: Date
            return a.startDate.getTime() - b.startDate.getTime();
        });
    });

    return (
        <div className="w-full space-y-4">
            {/* Global Controls & Filters */}
            {tasks.length > 0 && (
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4 bg-card/50 p-3 rounded-lg border border-border/50">
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant={filterDelayed ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilterDelayed(!filterDelayed)}
                            className={cn("rounded-full transition-all text-xs h-8", filterDelayed && "bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/20")}
                        >
                            <span className="mr-1">🔴</span> Solo Retrasadas
                        </Button>
                        <Button
                            variant={filterCritical ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilterCritical(!filterCritical)}
                            className={cn("rounded-full transition-all text-xs h-8", filterCritical && "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20 border-orange-500/20")}
                        >
                            <span className="mr-1">⚡</span> Críticas (Holgura 0)
                        </Button>
                        <Button
                            variant={filterTypeS ? "default" : "outline"}
                            size="sm"
                            onClick={() => setFilterTypeS(!filterTypeS)}
                            className={cn("rounded-full transition-all text-xs h-8", filterTypeS && "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/20")}
                        >
                            <span className="mr-1">🔷</span> Solo Tipo S
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        {sortedProjectNames.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleAll(!allCollapsed)}
                                className="text-muted-foreground hover:text-foreground no-print"
                            >
                                {allCollapsed ? (
                                    <>
                                        <ChevronsDown className="h-4 w-4 mr-2" />
                                        Desplegar Todo
                                    </>
                                ) : (
                                    <>
                                        <ChevronsUp className="h-4 w-4 mr-2" />
                                        Replegar Todo
                                    </>
                                )}
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={exportToExcel}
                            disabled={filteredTasks.length === 0}
                            className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/20 rounded-full h-8 px-4 font-semibold transition-all no-print"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Exportar Excel
                        </Button>
                    </div>
                </div>
            )}

            {sortedProjectNames.map(projectName => {
                const projectTasks = tasksByProject[projectName];
                const projectStore = projects.find(p => p.name === projectName);

                // Derived dates as fallback
                const taskStartDates = projectTasks.map(t => t.startDate.getTime());
                const taskEndDates = projectTasks.map(t => t.endDate.getTime());
                const minStart = new Date(Math.min(...taskStartDates));
                const maxEnd = new Date(Math.max(...taskEndDates));

                // Official Project Dates
                const projectStartDate = projectStore?.startDate || minStart;
                const projectEndDate = projectStore?.endDate || maxEnd;

                const isCollapsed = collapsedProjects.includes(projectName);

                const projectColor = stringToColor(projectName);

                return (
                    <div key={projectName} className="overflow-hidden rounded-xl border border-border/50 shadow-sm bg-card/30 backdrop-blur-sm transition-all duration-200">
                        {/* Project Header - Clickable */}
                        <div
                            onClick={() => toggleProject(projectName)}
                            className="px-6 py-3 border-b border-border/40 flex items-center gap-3 transition-colors cursor-pointer hover:bg-muted/40 select-none"
                            style={{ backgroundColor: `${projectColor}15`, borderLeft: `4px solid ${projectColor}` }}
                        >
                            <div className="mr-1 text-muted-foreground/70">
                                {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                            </div>

                            <div className="h-3 w-3 rounded-full shadow-sm blink-0" style={{ backgroundColor: projectColor }} />
                            <div className="flex flex-col">
                                <h3 className="font-bold text-sm uppercase tracking-wide text-foreground flex items-center gap-2">
                                    {projectName}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                        {format(projectStartDate, 'dd MMM yyyy', { locale: es })} - {format(projectEndDate, 'dd MMM yyyy', { locale: es })}
                                    </span>
                                </div>

                            </div>
                            <span className="text-xs text-muted-foreground ml-auto bg-background/50 px-2 py-1 rounded-md border border-border/20">
                                {tasksByProject[projectName].length} tareas
                            </span>
                        </div>

                        {!isCollapsed && (
                            <div className="overflow-auto max-h-[600px] print:max-h-none print:overflow-visible animate-in slide-in-from-top-2 duration-200">
                                <table className="w-full text-sm text-left relative">
                                    <thead className="bg-muted/90 text-muted-foreground text-xs font-semibold uppercase tracking-wider backdrop-blur-md sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-6 py-4 font-bold w-16 text-center">Tipo</th>
                                            <th className="px-6 py-4 font-bold w-24">WBS</th>
                                            <th className="px-6 py-4 font-bold">Actividad / Tarea</th>
                                            <th className="px-6 py-4 font-bold w-32">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                                                            Cronograma
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="max-w-xs">
                                                            <p>Muestra la posición de la tarea relativa al periodo seleccionado. La barra gris es el periodo total, la barra azul es la duración de la tarea.</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </th>
                                            <th className="px-6 py-4 font-bold">Inicio</th>
                                            <th className="px-6 py-4 font-bold">Fin</th>
                                            <th className="px-6 py-4 font-bold text-center w-24">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                                                            Progreso Esperado
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="max-w-xs">
                                                            <p>Porcentaje de la tarea que debería estar completado para la fecha de fin del periodo seleccionado.</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </th>

                                            <th className="px-6 py-4 font-bold text-right w-32">Valoración Periodo</th>
                                            <th className="px-6 py-4 font-bold text-center">Estado (Días)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/40 bg-card/20">
                                        {tasksByProject[projectName].slice(0, getVisibleCount(projectName)).map((task, idx) => {
                                            const isDelayed = (task.delayDays || 0) > 0;
                                            const delayText = isDelayed ? `+ ${task.delayDays} días` : `${Math.abs(task.delayDays || 0)} días`;

                                            // Progress Bar Logic
                                            let progressPercent = 0;
                                            let progressLeft = 0;
                                            let showBar = false;

                                            if (dateRange.from && dateRange.to) {
                                                const rangeStart = dateRange.from.getTime();
                                                const rangeEnd = dateRange.to.getTime();
                                                const totalRangeMs = rangeEnd - rangeStart;

                                                if (totalRangeMs > 0) {
                                                    const taskStart = task.startDate.getTime();
                                                    const taskEnd = task.endDate.getTime();

                                                    // Intersection
                                                    const start = Math.max(rangeStart, taskStart);
                                                    const end = Math.min(rangeEnd, taskEnd);

                                                    if (end >= start) {
                                                        const durationMs = end - start;
                                                        progressPercent = (durationMs / totalRangeMs) * 100;
                                                        progressLeft = ((start - rangeStart) / totalRangeMs) * 100;
                                                        showBar = true;
                                                    }
                                                }
                                            }

                                            return (
                                                <tr
                                                    key={task.id + idx}
                                                    className="hover:bg-muted/30 transition-colors group"
                                                >
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={cn(
                                                            "px-2 py-1 rounded text-xs font-bold ring-1 ring-inset",
                                                            task.type === 'P' ? "bg-purple-500/10 text-purple-600 ring-purple-500/20" :
                                                                task.type === 'S' ? "bg-blue-500/10 text-blue-600 ring-blue-500/20" :
                                                                    task.type === 'T' ? "bg-amber-500/10 text-amber-600 ring-amber-500/20" :
                                                                        "bg-gray-500/10 text-gray-600 ring-gray-500/20"
                                                        )}>
                                                            [{task.type || 'P'}]
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                                                        {task.wbs}
                                                    </td>
                                                    <td className="px-6 py-4 font-medium text-foreground relative">
                                                        {task.name}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {showBar ? (
                                                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden relative" title={`${Math.round(progressPercent)}% del periodo seleccionado`}>
                                                                <div
                                                                    className="h-full bg-primary/70 rounded-full"
                                                                    style={{
                                                                        width: `${Math.max(5, progressPercent)}%`,
                                                                        marginLeft: `${progressLeft}%`
                                                                    }}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs">
                                                        {format(task.startDate, 'dd MMM', { locale: es })}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs">
                                                        {format(task.endDate, 'dd MMM', { locale: es })}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {(() => {
                                                            if (!dateRange.to) return <span className="text-xs text-muted-foreground">-</span>;

                                                            const targetDate = dateRange.to;
                                                            const start = task.startDate;
                                                            const end = task.endDate;

                                                            if (targetDate < start) return <span className="text-xs text-muted-foreground">0%</span>;
                                                            if (targetDate >= end) return <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold border border-emerald-200">100%</span>;

                                                            const totalDuration = end.getTime() - start.getTime();
                                                            const elapsed = targetDate.getTime() - start.getTime();
                                                            const percent = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

                                                            // Dynamic color interpolation: Blue (220) -> Green (142)
                                                            // Hue calculation: 220 - (percent * 0.78)
                                                            const hue = 220 - (percent * 0.78);
                                                            const barColor = `hsl(${hue}, 85%, 60%)`;

                                                            return (
                                                                <div className="flex flex-col items-center gap-1.5 w-full">
                                                                    <span className="text-xs font-semibold" style={{ color: `hsl(${hue}, 70%, 45%)` }}>
                                                                        {Math.round(percent)}%
                                                                    </span>
                                                                    <div className="w-20 h-2 bg-muted/50 rounded-full overflow-hidden border border-border/50">
                                                                        <div
                                                                            className="h-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                                                                            style={{
                                                                                width: `${percent}%`,
                                                                                backgroundColor: barColor,
                                                                                boxShadow: `0 0 8px ${barColor}`
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-mono text-xs">
                                                        {(() => {
                                                            if (task.budget === undefined) return <span className="text-muted-foreground">-</span>;
                                                            if (!dateRange.from || !dateRange.to) {
                                                                return (
                                                                    <span className="font-medium text-foreground">
                                                                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(task.budget)}
                                                                    </span>
                                                                );
                                                            }

                                                            const rangeStart = dateRange.from.getTime();
                                                            const rangeEnd = dateRange.to.getTime();
                                                            const taskStart = task.startDate.getTime();
                                                            // Logic: If Start=End (0 duration), treat as ending next day for overlap check (1 day duration)
                                                            // This ensures 1-day tasks falling in the range are counted.
                                                            const rawTaskEnd = task.endDate.getTime();
                                                            const taskEnd = (rawTaskEnd === taskStart) ? rawTaskEnd + 86400000 : rawTaskEnd;

                                                            // Overlap
                                                            const overlapStart = Math.max(taskStart, rangeStart);
                                                            const overlapEnd = Math.min(taskEnd, rangeEnd);

                                                            if (overlapStart < overlapEnd) {
                                                                const overlapDuration = overlapEnd - overlapStart;
                                                                // Ensure denominator matches our "effective" duration logic
                                                                const taskDuration = Math.max(taskEnd - taskStart, 86400000);

                                                                const value = task.budget * (overlapDuration / taskDuration);

                                                                return (
                                                                    <span className="font-medium text-foreground">
                                                                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value)}
                                                                    </span>
                                                                );
                                                            }
                                                            return <span className="text-muted-foreground">-</span>;
                                                        })()}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {isDelayed ? (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20 shadow-sm animate-pulse">
                                                                🔴 {delayText}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                                🟢 En fecha
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot className="bg-muted/50 font-bold text-xs uppercase text-muted-foreground border-t border-border/50">
                                        {tasksByProject[projectName].length > getVisibleCount(projectName) && (
                                            <tr>
                                                <td colSpan={9} className="px-6 py-3 text-center bg-card">
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        onClick={() => loadMore(projectName)}
                                                        className="w-full max-w-xs rounded-full hover:bg-muted"
                                                    >
                                                        Cargar más tareas ({tasksByProject[projectName].length - getVisibleCount(projectName)} restantes)
                                                    </Button>
                                                </td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 text-right">
                                                Total Proyecto:
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-foreground">
                                                {(() => {
                                                    if (!dateRange.from || !dateRange.to) {
                                                        const total = projectTasks.reduce((acc, task) => {
                                                            if (task.budget === undefined) return acc;
                                                            return acc + task.budget;
                                                        }, 0);
                                                        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(total);
                                                    }

                                                    const rangeStart = dateRange.from.getTime();
                                                    const rangeEnd = dateRange.to.getTime();

                                                    const total = projectTasks.reduce((acc, task) => {
                                                        if (task.budget === undefined) return acc;

                                                        const taskStart = task.startDate.getTime();
                                                        const taskEnd = task.endDate.getTime();
                                                        const overlapStart = Math.max(taskStart, rangeStart);
                                                        const overlapEnd = Math.min(taskEnd, rangeEnd);

                                                        if (overlapStart < overlapEnd) {
                                                            const overlapDuration = overlapEnd - overlapStart;
                                                            const taskDuration = Math.max(taskEnd - taskStart, 86400000);
                                                            return acc + (task.budget * (overlapDuration / taskDuration));
                                                        }
                                                        return acc;
                                                    }, 0);

                                                    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(total);
                                                })()}
                                            </td>
                                            <td className="px-6 py-4"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                );
            })}

            {filteredTasks.length === 0 && (
                <div className="px-6 py-16 text-center text-muted-foreground flex flex-col items-center justify-center gap-2 border border-dashed rounded-xl border-border/50">
                    <div className="h-10 w-10 bg-muted rounded-full flex items-center justify-center text-muted-foreground/50">
                        <Calendar className="h-5 w-5" />
                    </div>
                    {tasks.length === 0 ? "No hay tareas que mostrar en este rango." : "No hay tareas que coincidan con los filtros aplicados."}
                </div>
            )}
        </div>
    );
}
