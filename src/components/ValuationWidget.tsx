import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { stringToColor, getLeafTasks } from '../lib/utils';

export function ValuationWidget() {
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
    }, [tasks, dateRange, hiddenProjects]);

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
