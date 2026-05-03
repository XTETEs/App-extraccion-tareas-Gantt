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

                        <div className={cn(
                            "overflow-auto max-h-[600px] print:max-h-none print:overflow-visible animate-in slide-in-from-top-2 duration-200",
                            isCollapsed ? "hidden print:block" : "block"
                        )}>
                            <table className="w-full text-sm text-left relative border-collapse [border-spacing:0] [print-color-adjust:exact] [-webkit-print-color-adjust:exact]">
                                <thead className="bg-muted/90 text-muted-foreground text-xs font-semibold uppercase tracking-wider backdrop-blur-md sticky top-0 print:static print:table-header-group z-10 shadow-sm border-b border-border/50">
                                    <thead>
                                        <tr className="divide-x divide-border/20">
                                            <th className="px-4 py-4 font-bold w-16 text-center">Tipo</th>
                                            <th className="px-4 py-4 font-bold w-24">WBS</th>
                                            <th className="px-6 py-4 font-bold">Actividad / Tarea</th>
                                            <th className="px-4 py-4 font-bold w-full min-w-[300px]">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50 w-full text-left">
                                                            Cronograma & Progreso
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="max-w-xs bg-popover/95 backdrop-blur-sm border-border p-3 shadow-xl">
                                                            <div className="space-y-2">
                                                                <p className="font-bold border-b pb-1 text-primary">Guía Visual GANTT</p>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-4 h-2 bg-primary/20 rounded-sm"></div>
                                                                    <span>Duración total</span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-4 h-2 bg-gradient-to-r from-primary/40 to-primary/70 rounded-sm"></div>
                                                                    <span>Progreso esperado (hoy)</span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-0.5 h-3 bg-red-500 shadow-[0_0_8px_red]"></div>
                                                                    <span>Marcador de "Hoy"</span>
                                                                </div>
                                                                <p className="text-[10px] italic text-muted-foreground pt-1">El relleno indica el avance previsto a fecha de hoy.</p>
                                                            </div>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </th>
                                            <th className="px-6 py-4 font-bold text-right w-40">Valoración Periodo</th>
                                        </tr>
                                    </thead>
                                    </thead>
                                    <tbody className="divide-y divide-border/40 bg-card/20">
                                        {tasksByProject[projectName].map((task, idx) => {
                                            const isVisible = idx < getVisibleCount(projectName);
                                            const isDelayed = (task.delayDays || 0) > 0;
                                            const delayText = isDelayed ? `+ ${task.delayDays} días` : `${Math.abs(task.delayDays || 0)} días`;

                                            // Progress Bar Logic is handled inside the Gantt cell below

                                            return (
                                                <tr
                                                    key={task.id + idx}
                                                    className={cn(
                                                        "hover:bg-muted/30 transition-colors group",
                                                        !isVisible && "hidden print:table-row"
                                                    )}
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
                                                        <div className="flex flex-col">
                                                            <span className="leading-tight">{task.name}</span>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/30 font-mono">
                                                                    {format(task.startDate, 'dd/MM/yy', { locale: es })} - {format(task.endDate, 'dd/MM/yy', { locale: es })}
                                                                </span>
                                                                {isDelayed && (
                                                                    <span className="text-[9px] font-bold text-red-500 uppercase tracking-tighter flex items-center gap-0.5">
                                                                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                                                        Retraso {delayText}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 min-w-[300px]">
                                                        {(() => {
                                                            const rangeStart = (dateRange.from || projectStartDate).getTime();
                                                            const rangeEnd = (dateRange.to || projectEndDate).getTime();
                                                            const totalRangeMs = Math.max(rangeEnd - rangeStart, 1);
                                                            
                                                            const taskStart = task.startDate.getTime();
                                                            const taskEnd = task.endDate.getTime();
                                                            
                                                            // Task Position and Width
                                                            const left = ((taskStart - rangeStart) / totalRangeMs) * 100;
                                                            const width = ((taskEnd - taskStart) / totalRangeMs) * 100;
                                                            
                                                            // Today Line
                                                            const today = new Date().getTime();
                                                            const todayPos = ((today - rangeStart) / totalRangeMs) * 100;
                                                            const showToday = today >= rangeStart && today <= rangeEnd;

                                                            // Expected Progress % (from task start to today)
                                                            let expectedPercent = 0;
                                                            if (today > taskStart) {
                                                                if (today >= taskEnd) {
                                                                    expectedPercent = 100;
                                                                } else {
                                                                    const totalDuration = taskEnd - taskStart;
                                                                    const elapsed = today - taskStart;
                                                                    expectedPercent = (elapsed / totalDuration) * 100;
                                                                }
                                                            }

                                                            const isPast = taskEnd < today;
                                                            const isFuture = taskStart > today;
                                                            
                                                            const visualLeft = Math.max(-5, Math.min(105, left));
                                                            const visualWidth = Math.max(1, Math.min(110 - left, width));

                                                            return (
                                                                <div className="relative w-full h-10 flex items-center group/gantt">
                                                                    {/* Full Range Track - subtle background */}
                                                                    <div className="absolute w-full h-1 bg-muted/20 rounded-full" />
                                                                    
                                                                    {/* Task Duration Bar Container */}
                                                                    <div 
                                                                        className={cn(
                                                                            "absolute h-5 rounded-lg transition-all shadow-md flex items-center overflow-hidden border border-border/30 backdrop-blur-[2px]",
                                                                            isPast ? "bg-muted/40 border-muted-foreground/20" : "bg-primary/5 border-primary/20",
                                                                            isFuture && "opacity-60 grayscale-[0.3]",
                                                                            isDelayed && !isPast && "border-red-500/40 ring-1 ring-red-500/20",
                                                                            left < 0 && "rounded-l-none border-l-0",
                                                                            left + width > 100 && "rounded-r-none border-r-0"
                                                                        )}
                                                                        style={{ 
                                                                            left: `${visualLeft}%`, 
                                                                            width: `${visualWidth}%`,
                                                                            maskImage: left < -1 || (left + width > 101) 
                                                                                ? `linear-gradient(to right, ${left < -1 ? 'transparent' : 'black'} 0%, black 10%, black 90%, ${left + width > 101 ? 'transparent' : 'black'} 100%)` 
                                                                                : 'none',
                                                                            WebkitMaskImage: left < -1 || (left + width > 101) 
                                                                                ? `linear-gradient(to right, ${left < -1 ? 'transparent' : 'black'} 0%, black 10%, black 90%, ${left + width > 101 ? 'transparent' : 'black'} 100%)` 
                                                                                : 'none',
                                                                            animationDelay: `${idx * 0.03}s`
                                                                        }}
                                                                    >
                                                                        {/* Progress Fill with Gradient */}
                                                                        <div 
                                                                            className={cn(
                                                                                "h-full transition-all duration-700 ease-in-out relative animate-fill-progress",
                                                                                isPast ? "bg-muted-foreground/30" : "bg-gradient-to-r from-primary/40 via-primary/60 to-primary/80",
                                                                                isDelayed && !isPast && "from-red-500/40 via-red-500/50 to-red-500/60"
                                                                            )}
                                                                            style={{ 
                                                                                width: `${expectedPercent}%`,
                                                                                animationDelay: `${idx * 0.05}s`
                                                                            }}
                                                                        >
                                                                            {/* Subtle glass effect */}
                                                                            <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                                                                        </div>
                                                                        
                                                                        {/* Label inside if wide enough */}
                                                                        {visualWidth > 12 && (
                                                                            <span className="absolute right-2 text-[9px] font-black text-foreground/80 pointer-events-none tracking-tighter">
                                                                                {Math.round(expectedPercent)}%
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    
                                                                    {/* Tooltip Overlay (Invisible trigger) */}
                                                                    <div className="absolute inset-0 z-10 cursor-help" title={`Progreso esperado: ${Math.round(expectedPercent)}% | Inicio: ${format(task.startDate, 'dd/MM')} | Fin: ${format(task.endDate, 'dd/MM')}`} />

                                                                    {/* Today Marker Line - Pulse effect */}
                                                                    {showToday && (
                                                                        <div 
                                                                            className="absolute h-[160%] w-[3px] bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)] z-20 pointer-events-none animate-today-pulse"
                                                                            style={{ left: `${todayPos}%` }}
                                                                        >
                                                                            {/* Marker Head */}
                                                                            <div className="absolute top-0 -translate-x-1/2 -translate-y-full flex flex-col items-center no-print">
                                                                                <div className="bg-red-600 text-[8px] text-white px-1.5 py-0.5 rounded-sm font-black shadow-lg animate-bounce-slow">
                                                                                    {format(new Date(), 'dd/MM')}
                                                                                </div>
                                                                                <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-red-600"></div>
                                                                            </div>
                                                                            
                                                                            {/* Glow trace */}
                                                                            <div className="absolute inset-0 bg-red-400/20 blur-sm w-[6px] -left-[1.5px]" />
                                                                            
                                                                            {/* Line continuation for print */}
                                                                            <div className="hidden print:block absolute inset-0 bg-red-600 w-[1px]" />
                                                                        </div>
                                                                    )}
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
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot className="bg-muted/50 font-bold text-xs uppercase text-muted-foreground border-t border-border/50">
                                        {tasksByProject[projectName].length > getVisibleCount(projectName) && (
                                            <tr className="no-print">
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
                                            <td colSpan={3} className="px-6 py-4 text-right">
                                                Total Proyecto:
                                            </td>
                                            <td colSpan={2} className="px-6 py-4 text-right font-mono text-foreground pr-10">
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
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
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
            
            {/* Styles for Animations */}
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes fill-progress {
                    from { width: 0; }
                }
                .animate-fill-progress {
                    animation: fill-progress 1.5s cubic-bezier(0.22, 1, 0.36, 1) both;
                }
                @keyframes bounce-slow {
                    0%, 100% { transform: translateY(0) translateX(-50%); }
                    50% { transform: translateY(-3px) translateX(-50%); }
                }
                .animate-bounce-slow {
                    animation: bounce-slow 2s ease-in-out infinite;
                }
                @keyframes row-reveal {
                    from { opacity: 0; transform: translateY(15px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes today-pulse {
                    0%, 100% { opacity: 1; transform: scaleY(1); }
                    50% { opacity: 0.8; transform: scaleY(1.05); }
                }
                .animate-today-pulse {
                    animation: today-pulse 3s ease-in-out infinite;
                }
                tbody tr {
                    animation: row-reveal 0.6s cubic-bezier(0.22, 1, 0.36, 1) both;
                }
                /* Staggered row animations */
                ${Array.from({ length: 50 }).map((_, i) => `
                    tbody tr:nth-child(${i + 1}) { animation-delay: ${i * 0.05}s; }
                `).join('\n')}
            `}} />
        </div>
    );
}
