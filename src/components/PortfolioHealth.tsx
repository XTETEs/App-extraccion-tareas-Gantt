import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { getLeafTasks, stringToColor, cn } from '../lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, CheckCircle2, Clock, Activity } from 'lucide-react';

type ProjectHealth = {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    totalTasks: number;
    delayedCount: number;
    criticalDelayedCount: number;
    delayedPercent: number;
    status: 'healthy' | 'warning' | 'critical';
    color: string;
    [key: string]: any;
};

export function PortfolioHealth() {
    const { tasks, projects } = useStore();

    const healthData = useMemo(() => {
        const leafTasks = getLeafTasks(tasks);
        
        return projects.map(project => {
            const projectTasks = leafTasks.filter(t => t.projectName === project.name);
            const totalTasks = projectTasks.length;
            if (totalTasks === 0) return null;

            let delayedCount = 0;
            let criticalDelayedCount = 0;

            projectTasks.forEach(task => {
                if ((task.delayDays || 0) > 0) {
                    delayedCount++;
                    if (task.isCritical) {
                        criticalDelayedCount++;
                    }
                }
            });

            const delayedPercent = (delayedCount / totalTasks) * 100;

            let status: 'healthy' | 'warning' | 'critical' = 'healthy';
            
            if (criticalDelayedCount > 0 || delayedPercent > 10) {
                status = 'critical';
            } else if (delayedCount > 0) {
                status = 'warning';
            }

            // Fallbacks if no explicit project dates
            const taskStartDates = projectTasks.map(t => t.startDate.getTime());
            const taskEndDates = projectTasks.map(t => t.endDate.getTime());
            
            const minStart = taskStartDates.length > 0 ? new Date(Math.min(...taskStartDates)) : new Date();
            const maxEnd = taskEndDates.length > 0 ? new Date(Math.max(...taskEndDates)) : new Date();

            return {
                ...project,
                startDate: project.startDate || minStart,
                endDate: project.endDate || maxEnd,
                totalTasks,
                delayedCount,
                criticalDelayedCount,
                delayedPercent,
                status,
                color: stringToColor(project.name),
            };
        }).filter((p): p is ProjectHealth => p !== null); 
    }, [tasks, projects]);

    if (healthData.length === 0) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-muted/10 rounded-3xl border border-dashed border-border/50 p-8 text-center">
                <Activity className="h-16 w-16 mb-4 opacity-20" />
                <h3 className="text-xl font-semibold mb-2">Sin datos de proyectos</h3>
                <p>Cargue archivos Excel para visualizar el estado global del portafolio.</p>
            </div>
        );
    }

    // Sort: Critical first, then warning, then healthy, then by name
    const sortedHealthData = [...healthData].sort((a, b) => {
        const priority: Record<'critical' | 'warning' | 'healthy', number> = { critical: 0, warning: 1, healthy: 2 };
        if (priority[a.status] !== priority[b.status]) {
            return priority[a.status] - priority[b.status];
        }
        return a.name.localeCompare(b.name);
    });

    const statusConfig = {
        healthy: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-700', icon: CheckCircle2, label: 'Saludable', color: '#10b981' },
        warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-700', icon: Clock, label: 'Precaución', color: '#f59e0b' },
        critical: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-700', icon: AlertCircle, label: 'Crítico', color: '#ef4444' }
    };

    return (
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                <Activity className="h-6 w-6 text-primary" />
                Panel de Salud Global (Portafolio)
            </h2>
            
            {/* KPI Summary Global */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
               <div className="bg-card p-4 rounded-xl border border-border/50 flex flex-col items-center text-center shadow-sm">
                   <h4 className="text-3xl font-bold">{healthData.length}</h4>
                   <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">Obras Activas</span>
               </div>
               <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 flex flex-col items-center text-center">
                   <h4 className="text-3xl font-bold text-emerald-600">{healthData.filter(d => d.status === 'healthy').length}</h4>
                   <span className="text-xs text-emerald-700 uppercase tracking-wider font-semibold mt-1">Saludables</span>
               </div>
               <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 flex flex-col items-center text-center">
                   <h4 className="text-3xl font-bold text-amber-600">{healthData.filter(d => d.status === 'warning').length}</h4>
                   <span className="text-xs text-amber-700 uppercase tracking-wider font-semibold mt-1">En Precaución</span>
               </div>
               <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20 flex flex-col items-center text-center">
                   <h4 className="text-3xl font-bold text-red-600">{healthData.filter(d => d.status === 'critical').length}</h4>
                   <span className="text-xs text-red-700 uppercase tracking-wider font-semibold mt-1">Críticos</span>
               </div>
            </div>

            {/* Grid of Projects */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedHealthData.map(project => {
                    const Config = statusConfig[project.status as keyof typeof statusConfig];
                    const Icon = Config.icon;

                    return (
                        <div key={project.id || project.name} className={cn("relative overflow-hidden rounded-2xl border p-6 transition-all hover:shadow-md", Config.bg, Config.border)}>
                            <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: Config.color }} />
                            
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="font-bold text-lg leading-tight uppercase tracking-tight text-foreground line-clamp-2 pr-4">
                                    {project.name}
                                </h3>
                                <div className={cn("flex px-2 py-1 rounded-full text-xs font-bold items-center gap-1.5 shrink-0 bg-background/50 backdrop-blur-sm border shadow-sm", Config.text, Config.border)}>
                                    <Icon className="h-3.5 w-3.5" />
                                    {Config.label}
                                </div>
                            </div>

                            <div className="text-xs text-muted-foreground font-mono bg-background/50 px-3 py-2 rounded-lg border border-border/40 inline-block mb-5">
                                {format(project.startDate, 'dd MMM yyyy', { locale: es })} - {format(project.endDate, 'dd MMM yyyy', { locale: es })}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between text-sm mb-1.5">
                                        <span className="text-muted-foreground font-medium">Tareas con Retraso</span>
                                        <span className="font-bold">{project.delayedCount} <span className="text-muted-foreground font-normal">/ {project.totalTasks}</span></span>
                                    </div>
                                    <div className="h-2 w-full bg-background/60 rounded-full overflow-hidden">
                                        <div 
                                            className={cn("h-full rounded-full transition-all duration-1000", 
                                                project.delayedPercent > 10 ? 'bg-red-500' : project.delayedPercent > 0 ? 'bg-amber-500' : 'bg-emerald-500'
                                            )} 
                                            style={{ width: `${Math.min(100, Math.max(project.delayedPercent || 0, 2))}%` }} 
                                        />
                                    </div>
                                </div>

                                {project.criticalDelayedCount > 0 && (
                                    <div className="flex items-center gap-2 text-sm text-red-600 font-semibold bg-red-500/10 px-3 py-2 rounded-lg">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{project.criticalDelayedCount} Tareas críticas penalizadas</span>
                                    </div>
                                )}
                                
                                {project.criticalDelayedCount === 0 && project.status !== 'healthy' && (
                                    <div className="flex items-center gap-2 text-sm text-amber-700 font-medium bg-amber-500/10 px-3 py-2 rounded-lg">
                                        <Clock className="h-4 w-4 shrink-0" />
                                        <span>Retrasos focalizados en tareas no críticas</span>
                                    </div>
                                )}

                                {project.status === 'healthy' && (
                                    <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium bg-emerald-500/10 px-3 py-2 rounded-lg">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>Ejecución conforme a lo planificado</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
