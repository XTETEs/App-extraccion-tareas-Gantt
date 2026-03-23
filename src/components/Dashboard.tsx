import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Sidebar } from './Sidebar';
import { TaskTable } from './TaskTable';
import { FileUpload } from './FileUpload';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
// Dashboard component orchestrator
import { ListTodo, Zap, LayoutDashboard, Printer } from 'lucide-react';
import { AnalysisView, BottleneckRadar, PortfolioHealth } from './';
import { Button } from './ui/button';
import { cn, stringToColor, getLeafTasks } from '../lib/utils'; // Keep this if used outside or re-import if needed

export function Dashboard() {
    const { tasks, projects, dateRange, hiddenProjects, isReportGenerated } = useStore();
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'gantt' | 'analysis' | 'radar' | 'portfolio'>('portfolio');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Use projects from store which are ordered via Drag & Drop


    // --- HIERARCHY FILTERING ---
    // We only want LEAF nodes (tasks with no children) to avoid double counting.
    // Algorithm moved to utils for consistency across views.

    const leafTasks = getLeafTasks(tasks);

    const filteredTasks = leafTasks.filter(t => {
        // Exclude specific tasks like "Total"
        if (t.name.trim().toLowerCase() === 'total') return false;

        // 1. Filter by Project
        if (selectedProjectId) {
            if (t.projectName !== selectedProjectId) return false;
        } else {
            // In Global View, hide specific projects if toggled off
            if (hiddenProjects.includes(t.projectName)) return false;
        }

        // 2. Filter by Date Range (if set)
        if (dateRange.from) {
            // Strict overlap logic: Start <= RangeEnd AND End >= RangeStart
            // However, user logic is simpler: "Show active tasks".
            // Previous logic: t.endDate < from -> hide. t.startDate > to -> hide.
            if (t.endDate < dateRange.from) return false;
        }
        if (dateRange.to) {
            if (t.startDate > dateRange.to) return false;
        }

        return true;
    }).sort((a, b) => {
        // Sort by Project Order first
        if (a.projectName !== b.projectName) {
            const orderA = projects.find(p => p.name === a.projectName)?.order ?? 999;
            const orderB = projects.find(p => p.name === b.projectName)?.order ?? 999;
            return orderA - orderB;
        }
        // Then by Task date/name if needed (optional, keeping current implicit order)
        return 0;
    });

    // Chart Data
    // Pre-sort projects by order to ensure chart follows sidebar order
    const sortedProjects = [...projects].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const chartData = sortedProjects.map(p => {
        const projectTasks = filteredTasks.filter(t => t.projectName === p.name);
        return {
            name: p.name,
            total: projectTasks.length, // Renamed 'tasks' to 'total' to match usage
            critical: projectTasks.filter(t => t.isCritical).length,
            color: stringToColor(p.name)
        };
    }).filter(d => d.total > 0);

    return (
        <div className="flex h-full overflow-hidden bg-background relative">

            {/* Sidebar - Desktop */}
            <div className="w-72 hidden lg:block h-full shrink-0 no-print">
                <Sidebar
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    onSelectProject={(id) => {
                        setSelectedProjectId(id);
                        if (id) {
                            setViewMode('gantt');
                            useStore.getState().setReportGenerated(true);
                        }
                    }}
                />
            </div>

            {/* Sidebar - Mobile Drawer */}
            <div className={cn(
                "fixed inset-0 z-50 lg:hidden transition-opacity duration-300 no-print",
                isSidebarOpen ? "bg-black/60 backdrop-blur-sm pointer-events-auto" : "bg-black/0 pointer-events-none"
            )} onClick={() => setIsSidebarOpen(false)}>
                <div
                    className={cn(
                        "w-72 h-full bg-background transition-transform duration-300 ease-in-out",
                        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Sidebar
                        projects={projects}
                        selectedProjectId={selectedProjectId}
                        onSelectProject={(id) => {
                            setSelectedProjectId(id);
                            setIsSidebarOpen(false);
                            if (id) {
                                setViewMode('gantt');
                                useStore.getState().setReportGenerated(true);
                            }
                        }}
                    />
                </div>
            </div>

            {/* Main Content - Scrollable */}
            <div className="flex-1 h-full overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 md:space-y-8">

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            className="lg:hidden p-2 hover:bg-muted rounded-lg transition-colors no-print"
                            onClick={() => setIsSidebarOpen(true)}
                        >
                            <LayoutDashboard className="h-6 w-6" />
                        </button>
                        <h2 className="text-xl md:text-2xl font-bold tracking-tight">Dashboard</h2>
                    </div>

                    <div className="flex bg-muted/50 p-1 rounded-lg self-start md:self-auto overflow-x-auto max-w-full no-print">
                        <button
                            onClick={() => setViewMode('gantt')}
                            className={`px-3 md:px-4 text-xs md:text-sm font-medium py-1.5 rounded-md transition-all whitespace-nowrap ${viewMode === 'gantt' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Operaciones
                        </button>
                        <button
                            onClick={() => setViewMode('analysis')}
                            className={`px-3 md:px-4 text-xs md:text-sm font-medium py-1.5 rounded-md transition-all whitespace-nowrap ${viewMode === 'analysis' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Análisis
                        </button>
                        <button
                            onClick={() => setViewMode('radar')}
                            className={`px-3 md:px-4 text-xs md:text-sm font-medium py-1.5 rounded-md transition-all whitespace-nowrap ${viewMode === 'radar' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Radar
                        </button>
                        <button
                            onClick={() => setViewMode('portfolio')}
                            className={`px-3 md:px-4 text-xs md:text-sm font-medium py-1.5 rounded-md transition-all whitespace-nowrap ${viewMode === 'portfolio' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            Portafolio
                        </button>
                    </div>
                </div>

                {viewMode === 'portfolio' ? (
                    <PortfolioHealth />
                ) : isReportGenerated ? (
                    viewMode === 'analysis' ? (
                        <AnalysisView />
                    ) : viewMode === 'radar' ? (
                        <BottleneckRadar />
                    ) : (
                        <>
                            {/* KPI Cards - Modern Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-card/50 backdrop-blur-sm border border-border/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                    <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                                        <ListTodo className="h-16 w-16" />
                                    </div>
                                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Total Tareas</p>
                                    <h3 className="text-4xl font-extrabold mt-2 text-foreground tracking-tight">{filteredTasks.length}</h3>
                                    <div className="h-1 w-full bg-muted mt-4 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary w-full" />
                                    </div>
                                </div>

                                <div className="bg-card/50 backdrop-blur-sm border border-border/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                    <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:scale-110 transition-transform text-destructive">
                                        <Zap className="h-16 w-16" />
                                    </div>
                                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Tareas Críticas</p>
                                    <h3 className="text-4xl font-extrabold mt-2 text-destructive tracking-tight">
                                        {filteredTasks.filter(t => t.isCritical).length}
                                    </h3>
                                    <div className="h-1 w-full bg-muted mt-4 rounded-full overflow-hidden">
                                        <div className="h-full bg-destructive w-[30%]" />
                                    </div>
                                </div>

                                <div className="bg-card/50 backdrop-blur-sm border border-border/50 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                    <div className="absolute right-0 top-0 p-6 opacity-10 group-hover:scale-110 transition-transform">
                                        <LayoutDashboard className="h-16 w-16" />
                                    </div>
                                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Obras Activas</p>
                                    <h3 className="text-4xl font-extrabold mt-2 text-foreground tracking-tight">
                                        {selectedProjectId ? 1 : new Set(filteredTasks.map(t => t.projectName)).size}
                                    </h3>
                                </div>
                            </div>

                            {/* 1. GRAPHS (TOP) */}
                            <div className="w-full bg-card/40 backdrop-blur-md rounded-2xl border border-border/50 p-6 h-[400px] flex flex-col">
                                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
                                    <LayoutDashboard className="h-4 w-4" />
                                    Distribución de Carga por Obra
                                </h3>
                                <div className="flex-1 w-full min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                                            <XAxis
                                                dataKey="name"
                                                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                                                interval={0}
                                                angle={-45}
                                                textAnchor="end"
                                                height={60}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                                allowDecimals={false}
                                            />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                                                cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                                            />
                                            <Bar dataKey="total" radius={[4, 4, 0, 0]} barSize={40}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* 2. TASKS (MIDDLE) */}
                            <div className="w-full" id="print-area">
                                <div className="flex items-center justify-between mb-4 px-1">
                                    <h3 className="text-lg font-bold flex items-center gap-2">
                                        <ListTodo className="h-5 w-5 text-primary" />
                                        Detalle de Tareas
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => window.print()}
                                            className="flex items-center gap-2 no-print"
                                        >
                                            <Printer className="h-4 w-4" />
                                            Imprimir Detalle
                                        </Button>
                                        <div className="text-sm text-muted-foreground bg-muted/30 px-3 py-1 rounded-full border border-border/40">
                                            Mostrando {filteredTasks.length} resultados
                                        </div>
                                    </div>
                                </div>
                                <TaskTable tasks={filteredTasks} />
                            </div>
                        </>
                    )
                ) : (
                    <div className="w-full h-[500px] flex flex-col items-center justify-center text-muted-foreground bg-muted/10 rounded-3xl border border-dashed border-border/50 p-8 text-center">
                        <ListTodo className="h-16 w-16 mb-4 opacity-20" />
                        <h3 className="text-xl font-semibold mb-2">Esperando extracción</h3>
                        <p className="max-w-md">
                            Ordene las obras en el panel lateral, seleccione un rango de fechas (opcional) y pulse
                            <span className="font-bold text-primary mx-1">"Extraer Tareas"</span>
                            para generar el informe.
                        </p>
                    </div>
                )}
                {/* 3. FILE UPLOAD (BOTTOM) */}
                <div className="w-full border-t border-border/40 pt-8 mt-8 no-print">
                    <div className="max-w-2xl mx-auto p-4 md:p-8 border border-dashed border-primary/20 rounded-3xl bg-primary/5 hover:bg-primary/10 transition-colors flex flex-col items-center justify-center text-center">
                        <h4 className="text-lg font-semibold mb-2">Gestión de Archivos</h4>
                        <p className="text-muted-foreground mb-6 text-sm">Arrastra tus archivos Excel aquí para actualizar o añadir nuevos proyectos.</p>
                        <div className="w-full max-w-md bg-background rounded-xl shadow-sm p-1">
                            <FileUpload />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
