import { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { X, Trash2, CheckSquare, FolderOpen, Upload, Download, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { processAnyFile, uploadFileToBlob } from '../lib/fileProcessor';
import { format } from 'date-fns';

interface ProjectManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ProjectManagerModal({ isOpen, onClose }: ProjectManagerModalProps) {
    const { projects: storedProjects, tasks, deleteProjects } = useStore();
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Use stored projects
    const projects = storedProjects;

    if (!isOpen) return null;

    const toggleSelection = (projectId: string) => {
        setSelectedProjects(prev =>
            prev.includes(projectId)
                ? prev.filter(p => p !== projectId)
                : [...prev, projectId]
        );
    };

    const toggleAll = () => {
        if (selectedProjects.length === projects.length && projects.length > 0) {
            setSelectedProjects([]);
        } else {
            setSelectedProjects(projects.map(p => p.id));
        }
    };

    const handleDelete = async () => {
        if (selectedProjects.length === 0) return;

        const count = selectedProjects.length;
        const message = count === projects.length
            ? `¿Estás seguro de que quieres eliminar TODAS las obras (${count})? Esta acción no se puede deshacer.`
            : `¿Estás seguro de que quieres eliminar ${count} proyectos? Esta acción no se puede deshacer.`;

        if (window.confirm(message)) {
            try {
                await deleteProjects(selectedProjects);
                setSelectedProjects([]);
                onClose();
            } catch (error) {
                console.error("Error deleting projects:", error);
                alert("Hubo un error al eliminar los proyectos.");
            }
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const files = Array.from(e.target.files);
        setIsImporting(true);
        for (const file of files) {
            await processAnyFile(file);
            uploadFileToBlob(file).catch(() => {});
        }
        setIsImporting(false);
        e.target.value = '';
    };

    const handleExportBackup = () => {
        const backupData = {
            exportDate: new Date().toISOString(),
            projects: projects.map(p => ({
                id: p.id,
                name: p.name,
                order: p.order,
                startDate: p.startDate ? format(p.startDate, 'yyyy-MM-dd') : undefined,
                endDate: p.endDate ? format(p.endDate, 'yyyy-MM-dd') : undefined,
            })),
            tasks: tasks.map(t => ({
                id: t.id,
                projectId: t.projectId,
                projectName: t.projectName,
                name: t.name,
                startDate: format(t.startDate, 'yyyy-MM-dd'),
                endDate: format(t.endDate, 'yyyy-MM-dd'),
                progress: t.progress ?? 0,
                budget: t.budget,
                isCritical: !!t.isCritical,
                totalSlack: t.totalSlack,
                wbs: t.wbs,
                type: t.type,
                industrial: t.industrial,
                delayDays: t.delayDays || 0
            }))
        };

        const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(backupData, null, 2))}`;
        const a = document.createElement('a');
        a.href = jsonString;
        a.download = `Copia_Seguridad_Obras_${format(new Date(), 'yyyyMMdd_HHmm')}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-4 border-b border-border/40 flex items-center justify-between bg-muted/30">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <FolderOpen className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm">Gestor de Obras</h3>
                            <p className="text-xs text-muted-foreground">Administra, importa o elimina planificaciones</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-muted rounded-md transition-colors text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Import / Export quick toolbar */}
                <div className="px-4 py-2.5 bg-muted/20 border-b border-border/30 flex items-center justify-between gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        multiple
                        accept=".xlsx,.xls,.csv,.json"
                        onChange={handleFileUpload}
                    />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="text-xs h-7 gap-1.5"
                    >
                        {isImporting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Upload className="h-3 w-3" />
                        )}
                        Importar JSON/Excel
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleExportBackup}
                        disabled={projects.length === 0}
                        className="text-xs h-7 gap-1.5 text-muted-foreground hover:text-foreground"
                    >
                        <Download className="h-3 w-3" />
                        Descargar Copia JSON
                    </Button>
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
                                const isSelected = selectedProjects.includes(project.id);
                                return (
                                    <div
                                        key={project.id}
                                        onClick={() => toggleSelection(project.id)}
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
                                        <span className="text-sm font-medium flex-1 truncate">{project.name}</span>
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
