import { useState } from 'react';
import type { Project } from '../types';
import { cn } from '../lib/utils';
import { Building2, Layers, Calendar as CalendarIcon, Eye, EyeOff, Settings2, GripVertical } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ProjectManagerModal } from './ProjectManagerModal';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SidebarProps {
    projects: Project[];
    selectedProjectId: string | null;
    onSelectProject: (id: string | null) => void;
}

interface SortableProjectItemProps {
    project: Project;
    selectedProjectId: string | null;
    onSelectProject: (id: string | null) => void;
    hiddenProjects: string[];
    toggleProjectVisibility: (id: string) => void;
}

function SortableProjectItem({ project, selectedProjectId, onSelectProject, hiddenProjects, toggleProjectVisibility }: SortableProjectItemProps) {
    const isHidden = hiddenProjects.includes(project.id);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: project.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-1 group/item w-full relative">
            <div
                {...attributes}
                {...listeners}
                className="p-1.5 rounded-md cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover/item:opacity-100 transition-opacity touch-none"
                title="Reordenar"
            >
                <GripVertical className="h-3.5 w-3.5" />
            </div>
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    toggleProjectVisibility(project.id);
                }}
                className={cn(
                    "p-2 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground",
                    isHidden ? "text-muted-foreground/50" : "text-primary/70 hover:text-primary"
                )}
                title={isHidden ? "Mostrar en resumen" : "Ocultar de resumen"}
            >
                {isHidden ? (
                    <EyeOff className="h-4 w-4" />
                ) : (
                    <Eye className="h-4 w-4" />
                )}
            </button>
            <button
                onClick={() => onSelectProject(project.id)}
                className={cn(
                    "flex-1 flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 border border-transparent min-w-0",
                    selectedProjectId === project.id
                        ? "bg-white dark:bg-zinc-800 border-border shadow-sm text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    isHidden && selectedProjectId !== project.id && "opacity-50 grayscale"
                )}
            >
                <Building2 className={cn(
                    "h-4 w-4 transition-colors shrink-0",
                    selectedProjectId === project.id ? "text-primary" : "text-muted-foreground/70 group-hover/item:text-primary/70"
                )} />
                <span className="truncate text-left flex-1">{project.name}</span>
                {selectedProjectId === project.id && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
            </button>
        </div>
    );
}

export function Sidebar({ projects, selectedProjectId, onSelectProject }: SidebarProps) {
    const { dateRange, setDateRange, hiddenProjects, toggleProjectVisibility, reorderProjects } = useStore();
    const [isManagerOpen, setIsManagerOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = projects.findIndex((p) => p.id === active.id);
            const newIndex = projects.findIndex((p) => p.id === over?.id);
            reorderProjects(arrayMove(projects, oldIndex, newIndex));
        }
    }

    return (
        <div className="flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-border/40 p-6">

            <ProjectManagerModal isOpen={isManagerOpen} onClose={() => setIsManagerOpen(false)} />

            {/* Date Filter Section - Designed as a floating card */}
            <div className="mb-8 p-4 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl border border-primary/10">
                <h4 className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-widest mb-4">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Periodo
                </h4>
                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground ml-1">Inicio</label>
                        <input
                            type="date"
                            className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                            value={dateRange.from ? dateRange.from.toISOString().split('T')[0] : ''}
                            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value ? new Date(e.target.value) : undefined })}
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground ml-1">Fin</label>
                        <input
                            type="date"
                            className="w-full bg-background/50 border border-border/50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
                            value={dateRange.to ? dateRange.to.toISOString().split('T')[0] : ''}
                            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value ? new Date(e.target.value) : undefined })}
                        />
                    </div>
                </div>

                {/* Generate Report Button */}
                <div className="mt-4">
                    <button
                        onClick={() => {
                            if (!dateRange.from && !dateRange.to) {
                                alert("Por favor seleccione al menos una fecha de inicio o fin.");
                                return;
                            }
                            // Trigger report generation
                            useStore.getState().setReportGenerated(true);
                        }}
                        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-2 px-4 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wide"
                    >
                        <Settings2 className="h-4 w-4" />
                        Extraer Tareas
                    </button>
                    <p className="text-[10px] text-muted-foreground text-center mt-2 px-1 leading-tight">
                        Ordene las obras arriba y pulse para generar el informe.
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="mb-2 px-2 flex items-center justify-between group/header">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                        Obras ({projects.length})
                    </h4>
                    <button
                        onClick={() => setIsManagerOpen(true)}
                        className="opacity-0 group-hover/header:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-primary rounded-md hover:bg-muted"
                        title="Gestionar obras"
                    >
                        <Settings2 className="h-3.5 w-3.5" />
                    </button>
                </div>

                <div className="space-y-1">
                    <button
                        onClick={() => onSelectProject(null)}
                        className={cn(
                            "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 group relative overflow-hidden",
                            selectedProjectId === null
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                                : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Layers className="h-4 w-4 relative z-10" />
                        <span className="relative z-10">Vista General</span>
                        {selectedProjectId === null && <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent" />}
                    </button>

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={projects.map(p => p.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {projects.map(project => (
                                <SortableProjectItem
                                    key={project.id}
                                    project={project}
                                    selectedProjectId={selectedProjectId}
                                    onSelectProject={onSelectProject}
                                    hiddenProjects={hiddenProjects}
                                    toggleProjectVisibility={toggleProjectVisibility}
                                />
                            ))}
                        </SortableContext>
                    </DndContext>
                </div>
            </div>
        </div>
    );
}
