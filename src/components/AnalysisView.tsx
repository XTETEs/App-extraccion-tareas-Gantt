import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, CalendarDays, CheckCircle2, Flame } from 'lucide-react';
import { format, isBefore, addDays, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { stringToColor, getLeafTasks } from '../lib/utils';

export function AnalysisView() {
    const { tasks } = useStore();
    const today = new Date();

    // 1. COMPLETION CONCENTRATION (Projects by End Month)
    const completionDataEnhanced = useMemo(() => {
        const projectEndDates = new Map<string, Date>();
        tasks.forEach(t => {
            const currentMax = projectEndDates.get(t.projectName);
            if (!currentMax || t.endDate > currentMax) {
                projectEndDates.set(t.projectName, t.endDate);
            }
        });

        const grouped: Record<string, { name: string, count: number, sortTime: number, projects: string[] }> = {};

        projectEndDates.forEach((date, projectName) => {
            const monthKey = format(date, 'MMM yyyy', { locale: es });
            if (!grouped[monthKey]) {
                grouped[monthKey] = {
                    name: monthKey,
                    count: 0,
                    sortTime: date.getTime(), // Approximate sort by first encounter
                    projects: []
                };
            }
            grouped[monthKey].count++;
            grouped[monthKey].projects.push(projectName);
        });

        return Object.values(grouped).sort((a, b) => a.sortTime - b.sortTime);
    }, [tasks]);


    // 2. DELAYED PROJECTS / TASKS (Overdue relative to Today)
    const delayedTasks = useMemo(() => {
        // Find leaf tasks that ended before today
        // We assume "Delayed" means "Should be done but presumably isn't"
        // Since we don't have a "Status" field from Excel usually, we treat *all* past end dates as potential history
        // To make it useful, let's look for "Active" projects maybe?
        // Or simply "Tasks that ended in the last 30 days" to review?
        // USER REQUEST: "Que obras van retrasadas respecto a la fecha de hoy"
        // Interpretation: Project End Date < Today.Or Critical Tasks < Today.

        // Let's look for Projects whose calculated End Date is < Today 
        // This effectively means "The whole project should have finished"
        const projectEndDates = new Map<string, Date>();
        tasks.forEach(t => {
            const currentMax = projectEndDates.get(t.projectName);
            if (!currentMax || t.endDate > currentMax) {
                projectEndDates.set(t.projectName, t.endDate);
            }
        });

        const delayedProjects: { name: string, date: Date, daysLate: number }[] = [];
        projectEndDates.forEach((date, name) => {
            if (isBefore(date, today)) {
                const diffTime = Math.abs(today.getTime() - date.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                delayedProjects.push({ name, date, daysLate: diffDays });
            }
        });
        return delayedProjects.sort((a, b) => b.daysLate - a.daysLate); // Most delayed first
    }, [tasks, today]);


    // 3. CRITICAL TASKS SUMMARY (Selected Week / Next 7 Days)
    const criticalFocus = useMemo(() => {
        // "Next 7 Days" from Today
        const nextWeekStart = today;
        const nextWeekEnd = addDays(today, 7);

        return tasks.filter(t =>
            t.isCritical &&
            (
                isWithinInterval(t.endDate, { start: nextWeekStart, end: nextWeekEnd }) || // Finishing this week
                isWithinInterval(t.startDate, { start: nextWeekStart, end: nextWeekEnd }) || // Starting this week
                (t.startDate < nextWeekStart && t.endDate > nextWeekEnd) // Spanning the whole week
            )
        ).sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
    }, [tasks, today]);

    return (
        <div className="space-y-8 p-1 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* WIDGET 1: Previsión de Cierres */}
                <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <CalendarDays className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Previsión de Cierres</h3>
                            <p className="text-sm text-muted-foreground">Concentración de finalización de obras por mes</p>
                        </div>
                    </div>

                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={completionDataEnhanced} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                                <Tooltip
                                    cursor={{ fill: 'transparent' }}
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-popover text-popover-foreground rounded-xl shadow-xl border border-border p-3 text-xs max-w-[200px]">
                                                    <p className="font-bold mb-2 text-sm">{label}</p>
                                                    <div className="space-y-1">
                                                        {data.projects.map((proj: string, i: number) => (
                                                            <div key={i} className="flex items-center gap-2">
                                                                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: stringToColor(proj) }} />
                                                                <span className="truncate">{proj}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="mt-3 pt-2 border-t border-border/50 font-semibold text-muted-foreground flex justify-between">
                                                        <span>Total</span>
                                                        <span>{data.count}</span>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} barSize={50}>
                                    {completionDataEnhanced.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--primary)/0.8)'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* WIDGET 2: Obras Retrasadas */}
                <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-sm flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold">Radar de Retrasos</h3>
                            <p className="text-sm text-muted-foreground">Obras que deberían haber terminado</p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 max-h-[300px]">
                        {delayedTasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                <CheckCircle2 className="h-10 w-10 mb-2 opacity-50" />
                                <p>Todo al día</p>
                            </div>
                        ) : (
                            delayedTasks.map((proj, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group">
                                    <div>
                                        <h4 className="font-semibold text-sm truncate max-w-[200px]" title={proj.name}>{proj.name}</h4>
                                        <p className="text-xs text-muted-foreground">Debió terminar: {format(proj.date, 'dd MMM yyyy', { locale: es })}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="block text-red-600 font-bold text-lg">+{proj.daysLate}</span>
                                        <span className="text-[10px] uppercase font-bold text-red-400">Días</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* WIDGET 3: Foco Crítico (Full Width) */}
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-sm">
                {/* ... (Existing Critical Focus Content) ... */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
                        <Flame className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Foco Crítico Semanal</h3>
                        <p className="text-sm text-muted-foreground">Tareas críticas activas en los próximos 7 días</p>
                    </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-border/50">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-4 py-3">Proyecto</th>
                                <th className="px-4 py-3">Tarea Crítica</th>
                                <th className="px-4 py-3 text-center">Fin Previsto</th>
                                <th className="px-4 py-3 text-right">Prioridad</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50 bg-background/50">
                            {criticalFocus.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                                        No hay tareas críticas para esta semana.
                                    </td>
                                </tr>
                            ) : (
                                criticalFocus.slice(0, 10).map((task, idx) => (
                                    <tr key={idx} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-medium">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stringToColor(task.projectName) }} />
                                                <span className="truncate max-w-[150px]">{task.projectName}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="block truncate max-w-[300px]" title={task.name}>{task.name}</span>
                                            {task.wbs && <span className="text-xs text-muted-foreground font-mono">{task.wbs}</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {format(task.endDate, 'dd MMM', { locale: es })}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                                Crítica
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* WIDGET 4: Valoración Económica Teórica */}
            <ValuationWidget />
        </div>
    );
}

function ValuationWidget() {
    // We need logic to calculate the value of tasks within the selected range provided by parent... 
    // Wait, AnalysisView doesn't receive dateRange props yet explicitly, it uses global store?
    // Let's check imports.
    const { tasks, dateRange, hiddenProjects } = useStore();

    const valuationData = useMemo(() => {
        if (!dateRange.from || !dateRange.to) return { projects: [], total: 0 };

        // 1. Filter: Leaves Only + Not Hidden + Not "Total"
        const leafTasks = getLeafTasks(tasks);
        const filteredTasks = leafTasks.filter(t =>
            !hiddenProjects.includes(t.projectName) &&
            t.name.trim().toLowerCase() !== 'total'
        );

        const rangeStart = dateRange.from.getTime();
        const rangeEnd = dateRange.to.getTime();
        // Removed unused rangeDuration

        const projectMap = new Map<string, number>();
        let grandTotal = 0;

        filteredTasks.forEach(task => {
            if (!task.budget || !task.startDate || !task.endDate) return;

            const taskStart = task.startDate.getTime();
            const taskEnd = task.endDate.getTime();

            // Linear Distribution Logic
            // 1. Calculate Overlap
            const overlapStart = Math.max(taskStart, rangeStart);
            const overlapEnd = Math.min(taskEnd, rangeEnd);

            if (overlapStart < overlapEnd) {
                const overlapDuration = overlapEnd - overlapStart;
                const taskDuration = Math.max(taskEnd - taskStart, 86400000); // Min 1 day to avoid div by zero

                // 2. Proportion
                const proportion = overlapDuration / taskDuration;

                // 3. Value
                const valueInPeriod = task.budget * proportion;

                const current = projectMap.get(task.projectName) || 0;
                projectMap.set(task.projectName, current + valueInPeriod);
                grandTotal += valueInPeriod;
            }
        });

        const projects = Array.from(projectMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        return { projects, total: grandTotal };
    }, [tasks, dateRange]);

    if (!dateRange.from || !dateRange.to) return null;

    return (
        <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                    <span className="font-bold text-xl">€</span>
                </div>
                <div>
                    <h3 className="text-lg font-bold">Valoración Teórica del Periodo</h3>
                    <p className="text-sm text-muted-foreground">
                        {format(dateRange.from, 'dd MMM', { locale: es })} - {format(dateRange.to, 'dd MMM yyyy', { locale: es })}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Total Summary */}
                <div className="col-span-1 flex flex-col justify-center p-6 bg-background/50 rounded-xl border border-border/50 text-center">
                    <span className="text-sm text-muted-foreground uppercase tracking-widest font-semibold mb-2">Total Estimado</span>
                    <span className="text-4xl font-bold text-foreground">
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(valuationData.total)}
                    </span>
                    <p className="text-xs text-muted-foreground mt-2">Basado en distribución lineal del presupuesto</p>
                </div>

                {/* Breakdown List */}
                <div className="col-span-2 overflow-y-auto max-h-[300px] custom-scrollbar rounded-xl border border-border/50">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold sticky top-0">
                            <tr>
                                <th className="px-4 py-3">Proyecto</th>
                                <th className="px-4 py-3 text-right">Valoración</th>
                                <th className="px-4 py-3 text-right">% Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50 bg-background/50">
                            {valuationData.projects.map((proj, idx) => (
                                <tr key={idx} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3 font-medium">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stringToColor(proj.name) }} />
                                            <span className="truncate">{proj.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(proj.value)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-muted-foreground">
                                        {((proj.value / valuationData.total) * 100).toFixed(1)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
