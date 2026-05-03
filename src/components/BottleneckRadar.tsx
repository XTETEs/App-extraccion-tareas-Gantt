import { useMemo, useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Calendar, Info, Search, Eye, Printer, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { stringToColor } from '../lib/utils';
import { Button } from './ui/button';
import { buildTimeScale, toUtcDay, getISOWeek } from '../lib/timeScale';

// Fixed pixel width of the project-name left column
const LEFT_COL_PX = 192;

export function BottleneckRadar() {
    const { tasks, projects, radarSelectedTask, setRadarSelectedTask, toggleProjectVisibility } = useStore();

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // 1. Extract unique task names for the dropdown (Normalized for selection)
    const uniqueTaskNames = useMemo(() => {
        // Use a map to keep original casing but group by normalized name
        const nameMap = new Map<string, { name: string, isP: boolean }>();
        tasks.forEach(t => {
            const normalized = t.name.trim().toLowerCase();
            if (!nameMap.has(normalized)) {
                nameMap.set(normalized, { name: t.name.trim(), isP: t.type === 'P' });
            } else if (t.type === 'P') {
                nameMap.get(normalized)!.isP = true;
            }
        });
        return Array.from(nameMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [tasks]);

    // 2. Filter tasks by selected name (Case-insensitive & trimmed matching)
    const relevantTasks = useMemo(() => {
        if (!radarSelectedTask) return [];
        const normalizedSelected = radarSelectedTask.trim().toLowerCase();
        return tasks.filter(t => t.name.trim().toLowerCase() === normalizedSelected);
    }, [tasks, radarSelectedTask]);

    const filteredOptions = useMemo(() => {
        if (!searchQuery.trim()) return uniqueTaskNames;
        const lowerQuery = searchQuery.toLowerCase();
        return uniqueTaskNames.filter(t => t.name.toLowerCase().includes(lowerQuery));
    }, [uniqueTaskNames, searchQuery]);

    // 3. Build the unified time scale — single source of truth for ALL positions
    const scale = useMemo(() => buildTimeScale(relevantTasks), [relevantTasks]);

    // 4. Group by project for the rows
    const projectRows = useMemo(() => {
        if (!radarSelectedTask) return [];
        const grouped = new Map<string, typeof relevantTasks>();
        relevantTasks.forEach(t => {
            const existing = grouped.get(t.projectName) || [];
            grouped.set(t.projectName, [...existing, t]);
        });

        return Array.from(grouped.entries())
            .map(([name, projectTasks]) => ({
                name,
                tasks: projectTasks,
                order: projects.find(p => p.name === name)?.order ?? 999
            }))
            // NOTE: We don't filter out hiddenProjects here because Radar is for cross-project analysis
            .sort((a, b) => a.order - b.order);
    }, [relevantTasks, radarSelectedTask, projects]);

    if (tasks.length === 0) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Selector */}
            <div className="relative z-50 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Radar de Cuellos de Botella</h3>
                            <p className="text-sm text-muted-foreground">Analiza solapes de una misma partida en todas las obras</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.print()}
                            className="flex items-center gap-2 no-print"
                        >
                            <Printer className="h-4 w-4" />
                            Imprimir Radar
                        </Button>
                        <div className="relative w-full md:w-80" ref={dropdownRef}>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                            
                            <div 
                                className="relative flex items-center w-full bg-background border border-border rounded-xl text-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all cursor-text overflow-hidden"
                                onClick={() => setIsDropdownOpen(true)}
                            >
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-10 py-2 bg-transparent outline-none placeholder:text-muted-foreground/70"
                                    placeholder={radarSelectedTask || "Selecciona o busca una tarea..."}
                                    value={isDropdownOpen ? searchQuery : (radarSelectedTask || '')}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setIsDropdownOpen(true);
                                    }}
                                    onFocus={() => setIsDropdownOpen(true)}
                                />
                                {radarSelectedTask && !isDropdownOpen && (
                                    <div className="absolute inset-y-0 left-10 right-10 flex items-center pointer-events-none bg-background">
                                        <span className="truncate block w-full text-foreground">
                                            {uniqueTaskNames.find(t => t.name === radarSelectedTask)?.isP ? (
                                                <span className="font-bold">[P] {radarSelectedTask}</span>
                                            ) : radarSelectedTask}
                                        </span>
                                    </div>
                                )}
                                <ChevronDown className="absolute right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>

                            {isDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto bg-card border border-border rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-top-2 custom-scrollbar p-1">
                                    {filteredOptions.length === 0 ? (
                                        <div className="p-3 text-sm text-center text-muted-foreground">
                                            No se encontraron tareas
                                        </div>
                                    ) : (
                                        filteredOptions.map(item => (
                                            <button
                                                key={item.name}
                                                className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors ${
                                                    radarSelectedTask === item.name ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
                                                }`}
                                                onClick={() => {
                                                    setRadarSelectedTask(item.name);
                                                    setSearchQuery('');
                                                    setIsDropdownOpen(false);
                                                }}
                                            >
                                                {item.isP ? (
                                                    <span className="font-bold text-foreground">[P] {item.name}</span>
                                                ) : item.name}
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {radarSelectedTask ? (
                relevantTasks.length > 0 && scale ? (
                    <div className="bg-card/50 backdrop-blur-sm print:bg-white print:backdrop-blur-none border border-border/50 print:border-none rounded-2xl overflow-hidden print:overflow-visible shadow-sm print:shadow-none flex flex-col print:block print:w-max min-w-full" id="print-radar-area">
                        {/* Timeline Toolbar */}
                        <div className="p-4 bg-muted/30 print:bg-transparent border-b border-border/40 print:border-b-2 print:border-black flex items-center justify-between text-xs font-semibold text-muted-foreground print:text-black uppercase tracking-wider">
                            <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                <span>
                                    Vista Semanal:{' '}
                                    {format(new Date(scale.startMs), 'dd MMM yyyy', { locale: es })}
                                    {' '}–{' '}
                                    {format(new Date(scale.endMs), 'dd MMM yyyy', { locale: es })}
                                </span>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-3 h-3 rounded-sm bg-primary print:bg-black" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                                    <span>Programado</span>
                                </div>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 cursor-help no-print" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-xs">Las barras muestran el intervalo desde el inicio hasta el fin de la tarea en cada obra. Los solapes verticales indican posibles saturación de recursos.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>

                        {/* ── Timeline Grid ────────────────────────────────────────────────────── */}
                        <div className="overflow-x-auto custom-scrollbar print:overflow-visible print:w-max">
                            <div style={{ width: LEFT_COL_PX + scale.totalPx }} className="relative print:w-max">
                                <div className="absolute top-0 bottom-0 pointer-events-none z-[5]" style={{ left: LEFT_COL_PX, width: scale.totalPx }}>
                                    {Array.from(new Set(relevantTasks.map(t => toUtcDay(t.startDate)))).map(startMs => (
                                        <div
                                            key={startMs}
                                            className="absolute top-0 bottom-0 border-l border-primary/20 print:border-black/20"
                                            style={{ left: scale.toPx(startMs) }}
                                        />
                                    ))}
                                </div>

                                {/* ── Date Header ── */}
                                <div className="flex border-b border-border/20 print:border-black/50 bg-muted/5 print:bg-transparent print:w-max">
                                    {/* Name column */}
                                    <div
                                        className="shrink-0 p-3 bg-muted/10 print:bg-transparent border-r border-border/40 print:border-black/50 font-bold text-[10px] uppercase flex items-end print:text-black"
                                        style={{ width: LEFT_COL_PX }}
                                    >
                                        Obra
                                    </div>

                                    {/* Tick area */}
                                    <div
                                        className="relative shrink-0"
                                        style={{ width: scale.totalPx, height: 44 }}
                                    >
                                        {scale.weekTicks.map(tick => {
                                            const x = scale.toPx(tick.ms);
                                            return (
                                                <div
                                                    key={tick.ms}
                                                    className="absolute top-0 h-full flex flex-col justify-end pb-1 select-none"
                                                    style={{ left: x, width: 68 }}
                                                >
                                                    <div className="absolute top-0 bottom-0 left-0 border-l border-border/20 print:border-black/30" />
                                                    <div className="pl-1 text-[9px] text-muted-foreground print:text-black font-bold leading-tight">{tick.label}</div>
                                                    <div className="pl-1 text-[8px] text-muted-foreground print:text-black opacity-50 leading-tight">{tick.year}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ── Project Rows ── */}
                                {projectRows.map((row) => (
                                    <div key={row.name} className="flex border-b border-border/10 print:border-black/20 group hover:bg-muted/10 transition-colors print:break-inside-avoid print:w-max">
                                        {/* Name column */}
                                        <div
                                            className="shrink-0 p-3 border-r border-border/40 print:border-black/50 flex items-center justify-between gap-1 overflow-hidden transition-colors"
                                            style={{
                                                width: LEFT_COL_PX,
                                                backgroundColor: `${stringToColor(row.name)}15`,
                                                borderLeft: `4px solid ${stringToColor(row.name)}`,
                                                WebkitPrintColorAdjust: 'exact',
                                                printColorAdjust: 'exact'
                                            }}
                                        >
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="h-2.5 w-2.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: stringToColor(row.name), WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }} />
                                                <span className="text-xs font-bold truncate print:text-black print:whitespace-normal" title={row.name}>{row.name}</span>
                                            </div>
                                            <button
                                                onClick={() => toggleProjectVisibility(row.name)}
                                                className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground shrink-0 no-print"
                                                title="Ocultar obra"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        {/* Bar area */}
                                        <div
                                            className="relative shrink-0"
                                            style={{ width: scale.totalPx, height: 64 }}
                                        >
                                            {/* Vertical grid lines */}
                                            {scale.weekTicks.map(tick => (
                                                <div
                                                    key={tick.ms}
                                                    className="absolute top-0 bottom-0 border-l border-border/5 print:border-black/10"
                                                    style={{ left: scale.toPx(tick.ms) }}
                                                />
                                            ))}

                                            {/* Task bars */}
                                            {row.tasks.map((task) => {
                                                const taskStartMs = toUtcDay(task.startDate);
                                                const taskEndMs = toUtcDay(task.endDate);
                                                const MS_DAY = 86_400_000;

                                                const leftPx = scale.toPx(taskStartMs);
                                                const widthPx = scale.toPx(taskEndMs + MS_DAY) - leftPx;

                                                const clampedLeft = Math.max(0, leftPx);
                                                const clampedWidth = Math.max(2, Math.min(scale.totalPx - clampedLeft, widthPx));

                                                const isoWeek = getISOWeek(task.startDate);
                                                const durationDays = Math.round((taskEndMs - taskStartMs) / MS_DAY) + 1;
                                                const projectColor = stringToColor(row.name);

                                                return (
                                                    <TooltipProvider key={task.id}>
                                                        <Tooltip delayDuration={100}>
                                                            <TooltipTrigger asChild>
                                                                <div
                                                                    className="absolute top-[14px] h-9 rounded shadow-sm border print:border-black/20 cursor-pointer transition-all hover:scale-y-105 flex items-center justify-between px-2 overflow-hidden gap-1 z-10"
                                                                    style={{
                                                                        left: clampedLeft,
                                                                        width: clampedWidth,
                                                                        backgroundColor: projectColor,
                                                                        color: '#ffffff',
                                                                        WebkitPrintColorAdjust: 'exact',
                                                                        printColorAdjust: 'exact'
                                                                    }}
                                                                >
                                                                    <span className="text-[10px] font-black opacity-90 shrink-0">S{isoWeek}</span>
                                                                    {task.industrial && clampedWidth > 80 && (
                                                                        <span className="text-[10px] font-semibold truncate flex-1 text-center opacity-95 px-1">
                                                                            {task.industrial}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[10px] font-bold truncate shrink-0">{durationDays}d</span>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top" className="bg-popover border-border animate-in zoom-in-95 duration-150 z-[100] no-print">
                                                                <div className="space-y-1">
                                                                    <p className="font-bold text-sm">{row.name}</p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {format(task.startDate, 'dd/MM/yyyy')} – {format(task.endDate, 'dd/MM/yyyy')}
                                                                    </p>
                                                                    <p className="text-xs font-semibold text-primary">Semana inicio: S{isoWeek}</p>
                                                                    <p className="text-xs font-semibold text-orange-500">{durationDays} días naturales</p>
                                                                    {task.industrial && (
                                                                        <p className="text-xs font-semibold text-emerald-500">🔧 {task.industrial}</p>
                                                                    )}
                                                                </div>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary Footer */}
                        <div className="p-4 bg-muted/20 print:bg-transparent border-t border-border/40 print:border-black/50 text-[11px] text-muted-foreground print:text-black flex justify-between">
                            <span>Total de obras involucradas: {projectRows.length}</span>
                            <span className="italic">Visualización basada en la duración total de la partida por obra</span>
                        </div>
                    </div>
                ) : (
                    <div className="py-20 text-center bg-card/30 rounded-2xl border border-dashed border-border/50">
                        <p className="text-muted-foreground">No se han encontrado tareas con ese nombre.</p>
                    </div>
                )
            ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center bg-card/30 rounded-2xl border border-dashed border-border/50">
                    <Search className="h-10 w-10 text-muted-foreground opacity-20 mb-4" />
                    <h4 className="text-lg font-semibold text-muted-foreground">Selecciona una tarea para comenzar</h4>
                    <p className="max-w-xs text-sm text-muted-foreground mt-2">
                        Elige una partida del desplegable superior para analizar su carga de trabajo en todas las obras activas.
                    </p>
                </div>
            )}
        </div>
    );
}
