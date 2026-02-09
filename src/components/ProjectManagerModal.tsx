import { useState } from 'react';
import { useStore } from '../store/useStore';
import { X, Trash2, CheckSquare, FolderOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface ProjectManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProjectManagerModal({ isOpen, onClose }: ProjectManagerModalProps) {
    const { projects: storedProjects, deleteProjects } = useStore();
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

    // Use stored projects (preserving order or resorting if needed, but let's keep array order)
    const projects = storedProjects.map(p => p.name);

    if (!isOpen) return null;

    const toggleSelection = (project: string) => {
        setSelectedProjects(prev =>
            prev.includes(project)
                ? prev.filter(p => p !== project)
                : [...prev, project]
        );
    };

    const toggleAll = () => {
        if (selectedProjects.length === projects.length) {
            setSelectedProjects([]);
        } else {
            setSelectedProjects(projects);
        }
    };

    const handleDelete = async () => {
        if (selectedProjects.length === 0) return;

        if (window.confirm(`¿Estás seguro de que quieres eliminar ${selectedProjects.length} proyectos? Esta acción no se puede deshacer.`)) {
            await deleteProjects(selectedProjects);
            setSelectedProjects([]);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 border-b border-border/40 flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <FolderOpen className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm">Gestor de Obras</h3>
                            <p className="text-xs text-muted-foreground">Selecciona para eliminar</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* List - Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                    {projects.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground text-sm">
                            No hay proyectos cargados.
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between mb-2 px-1">
                                <span className="text-xs font-semibold text-muted-foreground">{projects.length} Obras encontradas</span>
                                <button
                                    onClick={toggleAll}
                                    className="text-xs text-primary hover:underline font-medium"
                                >
                                    {selectedProjects.length === projects.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                </button>
                            </div>

                            {projects.map(project => {
                                const isSelected = selectedProjects.includes(project);
                                return (
                                    <div
                                        key={project}
                                        onClick={() => toggleSelection(project)}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 group select-none",
                                            isSelected
                                                ? "bg-primary/5 border-primary/30 shadow-sm"
                                                : "bg-background border-border/40 hover:bg-muted/50 hover:border-border"
                                        )}
                                    >
                                        <div className={cn(
                                            "h-5 w-5 rounded-md flex items-center justify-center transition-colors border",
                                            isSelected
                                                ? "bg-primary border-primary text-primary-foreground"
                                                : "bg-transparent border-muted-foreground/30 text-transparent group-hover:border-primary/50"
                                        )}>
                                            <CheckSquare className="h-3.5 w-3.5" />
                                        </div>
                                        <span className="text-sm font-medium flex-1 truncate">{project}</span>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border/40 bg-muted/10 flex items-center gap-3">
                    <span className="text-xs text-muted-foreground flex-1">
                        {selectedProjects.length > 0 ? `${selectedProjects.length} seleccionados` : ''}
                    </span>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        disabled={selectedProjects.length === 0}
                        onClick={handleDelete}
                        className="gap-2"
                    >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                    </Button>
                </div>
            </div>
        </div>
    );
}
