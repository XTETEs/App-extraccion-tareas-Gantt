import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Calendar, Info, Search, Eye, Printer } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { stringToColor } from '../lib/utils';
import { Button } from './ui/button';
import { buildTimeScale, toUtcDay, getISOWeek } from '../lib/timeScale';

// Fixed pixel width of the project-name left column
const LEFT_COL_PX = 192;

export function BottleneckRadar() {
    const { tasks, projects, radarSelectedTask, setRadarSelectedTask, toggleProjectVisibility } = useStore();

    // 1. Extract unique task names for the dropdown (Normalized for selection)
    const uniqueTaskNames = useMemo(() => {
        // Use a map to keep original casing but group by normalized name
        const nameMap = new Map<string, string>();
        tasks.forEach(t => {
            const normalized = t.name.trim().toLowerCase();
            if (!nameMap.has(normalized)) {
                nameMap.set(normalized, t.name.trim());
            }
        });
        return Array.from(nameMap.values()).sort((a, b) => a.localeCompare(b));
    }, [tasks]);

    // 2. Filter tasks by selected name (Case-insensitive & trimmed matching)
    const relevantTasks = useMemo(() => {
        if (!radarSelectedTask) return [];
        const normalizedSelected = radarSelectedTask.trim().toLowerCase();
        return tasks.filter(t => t.name.trim().toLowerCase() === normalizedSelected);
    }, [tasks, radarSelectedTask]);

    // 3. Build the unified time scale — single source of truth for ALL positions
    const scale = useMemo(() => buildTimeScale(relevantTasks), [relevantTasks]);

    const projectOrderMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of projects) {
            map.set(p.name, p.order ?? 999);
        }
        return map;
    }, [projects]);

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
                order: projectOrderMap.get(name) ?? 999
            }))
            // NOTE: We don't filter out hiddenProjects here because Radar is for cross-project analysis
            .sort((a, b) => a.order - b.order);
    }, [relevantTasks, radarSelectedTask, projectOrderMap]);

    if (tasks.length === 0) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Selector */}
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-sm">
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
                        <div className="relative w-full md:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <select
                                value={radarSelectedTask}
                                onChange={(e) => setRadarSelectedTask(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer"
                            >
                                <option value="">Selecciona una tarea...</option>
                                {uniqueTaskNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {radarSelectedTask ? (
                relevantTasks.length > 0 && scale ? (
                    <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl overflow-hidden shadow-sm flex flex-col" id="print-area">
                        {/* Timeline Toolbar */}
                        <div className="p-4 bg-muted/30 border-b border-border/40 flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                                    <div className="w-3 h-3 rounded-sm bg-primary" />
                                    <span>Programado</span>
                                </div>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-xs">Las barras muestran el intervalo desde el inicio hasta el fin de la tarea en cada obra. Los solapes verticales indican posibles saturación de recursos.</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                        </div>

                        {/* ── Timeline Grid ──────────────────────────────────────────────────────
                            ARCHITECTURE:
                            • The scrollable container holds ONE fixed-width div (LEFT_COL_PX + scale.totalPx).
                            • Both the week-tick header AND every task row use this same explicit px width.
                            • Tick marks and bar positions are computed via the SAME formula:
                                X_px = (T_target - T_start) / T_total × totalPx
                            • This guarantees mathematical alignment — no flex-min-width drift possible.
                        ─────────────────────────────────────────────────────────────────────── */}
                        <div className="overflow-x-auto custom-scrollbar">
                            <div style={{ width: LEFT_COL_PX + scale.totalPx }} className="relative">
                                <div className="absolute top-0 bottom-0 pointer-events-none z-[5]" style={{ left: LEFT_COL_PX, width: scale.totalPx }}>
                                    {Array.from(new Set(relevantTasks.map(t => toUtcDay(t.startDate)))).map(startMs => (
                                        <div
                                            key={startMs}
                                            className="absolute top-0 bottom-0 border-l border-primary/20 shadow-[0_0_1px_rgba(255,255,255,0.3)]"
                                            style={{ left: scale.toPx(startMs) }}
                                        />
                                    ))}
                                </div>

                                {/* ── Date Header ── */}
                                <div className="flex border-b border-border/20 bg-muted/5">
                                    {/* Name column */}
                                    <div
                                        className="shrink-0 p-3 bg-muted/10 border-r border-border/40 font-bold text-[10px] uppercase flex items-end"
                                        style={{ width: LEFT_COL_PX }}
                                    >
                                        Obra
                                    </div>

                                    {/* Tick area — same explicit width as bar areas below */}
                                    <div
                                        className="relative"
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
                                                    {/* Vertical separator */}
                                                    <div className="absolute top-0 bottom-0 left-0 border-l border-border/20" />
                                                    <div className="pl-1 text-[9px] text-muted-foreground font-bold leading-tight">{tick.label}</div>
                                                    <div className="pl-1 text-[8px] text-muted-foreground opacity-50 leading-tight">{tick.year}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* ── Project Rows ── */}
                                {projectRows.map((row) => (
                                    <div key={row.name} className="flex border-b border-border/10 group hover:bg-muted/10 transition-colors">
                                        {/* Name column */}
                                        <div
                                            className="shrink-0 p-3 border-r border-border/40 flex items-center justify-between gap-1 overflow-hidden transition-colors"
                                            style={{
                                                width: LEFT_COL_PX,
                                                backgroundColor: `${stringToColor(row.name)}15`,
                                                borderLeft: `4px solid ${stringToColor(row.name)}`
                                            }}
                                        >
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="h-2.5 w-2.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: stringToColor(row.name) }} />
                                                <span className="text-xs font-bold truncate" title={row.name}>{row.name}</span>
                                            </div>
                                            <button
                                                onClick={() => toggleProjectVisibility(row.name)}
                                                className="p-1 hover:bg-muted rounded transition-colors text-muted-foreground hover:text-foreground shrink-0"
                                                title="Ocultar obra"
                                            >
                                                <Eye className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        {/* Bar area — exact same width as tick area in header */}
                                        <div
                                            className="relative"
                                            style={{ width: scale.totalPx, height: 64 }}
                                        >
                                            {/* Vertical grid lines — SAME toPx() as header ticks */}
                                            {scale.weekTicks.map(tick => (
                                                <div
                                                    key={tick.ms}
                                                    className="absolute top-0 bottom-0 border-l border-border/5"
                                                    style={{ left: scale.toPx(tick.ms) }}
                                                />
                                            ))}

                                            {/* Task bars
                                                X_px = toPx(taskStartMs)
                                                W_px = toPx(taskEndMs + MS_DAY) – X_px  (inclusive of end day)
                                            */}
                                            {row.tasks.map((task) => {
                                                const taskStartMs = toUtcDay(task.startDate);
                                                const taskEndMs = toUtcDay(task.endDate);
                                                const MS_DAY = 86_400_000;

                                                const leftPx = scale.toPx(taskStartMs);
                                                // Width represents inclusive duration (end day counts fully)
                                                const widthPx = scale.toPx(taskEndMs + MS_DAY) - leftPx;

                                                // Clamp to visible area
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
                                                                    className="absolute top-1/2 -translate-y-1/2 h-9 rounded shadow-sm border cursor-pointer transition-all hover:scale-y-105 flex items-center justify-between px-2 overflow-hidden gap-1 z-10"
                                                                    style={{
                                                                        left: clampedLeft,
                                                                        width: clampedWidth,
                                                                        backgroundColor: projectColor,
                                                                        borderColor: projectColor,
                                                                        color: '#fff',
                                                                        textShadow: '0px 1px 2px rgba(0,0,0,0.5)'
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
                                                            <TooltipContent side="top" className="bg-popover border-border animate-in zoom-in-95 duration-150 z-[100]">
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
                        <div className="p-4 bg-muted/20 border-t border-border/40 text-[11px] text-muted-foreground flex justify-between">
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
