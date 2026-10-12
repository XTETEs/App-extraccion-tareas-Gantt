import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import type { ColumnMapping } from '../types';
import { cn } from '../lib/utils';
import { X } from 'lucide-react';

export function MappingModal() {
    const { rawHeaders, setColumnMapping, setMappingModalOpen, isMappingModalOpen } = useStore();
    const [userOverrides, setUserOverrides] = useState<Partial<ColumnMapping>>({});

    // Auto-select columns based on common names
    const autoMapping = useMemo(() => {
        const detected: Partial<ColumnMapping> = {};
        if (rawHeaders.length > 0) {
            rawHeaders.forEach(header => {
                const lower = String(header || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                if (!detected.taskCol && (lower.includes('tarea') || lower.includes('actividad') || lower.includes('descripcion') || lower.includes('task'))) detected.taskCol = header;
                if (!detected.startCol && (lower.includes('inicio') || lower.includes('comienzo') || lower.includes('start'))) detected.startCol = header;
                if (!detected.endCol && (lower.includes('fin') || lower.includes('termino') || lower.includes('final') || lower.includes('end'))) detected.endCol = header;
                if (!detected.wbsCol && (lower.includes('wbs') || lower === 'id' || lower.includes('codigo') || lower.includes('code'))) detected.wbsCol = header;
                if (!detected.typeCol && (lower.includes('tipo') || lower.includes('type'))) detected.typeCol = header;
                if (!detected.slackCol && (lower.includes('holgura') || lower.includes('slack') || lower.includes('margen'))) detected.slackCol = header;
                if (!detected.milestoneCol && (lower.includes('hito') || lower.includes('milestone'))) detected.milestoneCol = header;
                if (!detected.budgetCol && (lower.includes('presupuesto') || lower.includes('importe') || lower.includes('coste') || lower.includes('budget') || lower.includes('amount'))) detected.budgetCol = header;
            });
        }
        return detected;
    }, [rawHeaders]);

    const mapping = { ...autoMapping, ...userOverrides };

    if (!isMappingModalOpen) return null;

    const handleSave = () => {
        if (mapping.taskCol && mapping.startCol && mapping.endCol) {
            setColumnMapping(mapping as ColumnMapping);
            setMappingModalOpen(false);
        } else {
            alert("Por favor, asigna todas las columnas obligatorias (Tarea, Inicio, Fin).");
        }
    };

    const handleClose = () => {
        setMappingModalOpen(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Configurar Columnas</h2>
                    <button
                        onClick={handleClose}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Cerrar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                    Indica qué columna del archivo corresponde a cada dato clave del cronograma.
                </p>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nombre de la Tarea <span className="text-destructive">*</span></label>
                        <select
                            className={cn(
                                "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors",
                                mapping.taskCol ? "border-green-500 bg-green-50/10" : "border-destructive/50"
                            )}
                            onChange={(e) => setUserOverrides(prev => ({ ...prev, taskCol: e.target.value }))}
                            value={mapping.taskCol || ""}
                        >
                            <option value="">Selecciona una columna...</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Fecha de Inicio <span className="text-destructive">*</span></label>
                        <select
                            className={cn(
                                "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors",
                                mapping.startCol ? "border-green-500 bg-green-50/10" : "border-destructive/50"
                            )}
                            onChange={(e) => setUserOverrides(prev => ({ ...prev, startCol: e.target.value }))}
                            value={mapping.startCol || ""}
                        >
                            <option value="">Selecciona una columna...</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Fecha de Fin <span className="text-destructive">*</span></label>
                        <select
                            className={cn(
                                "flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors",
                                mapping.endCol ? "border-green-500 bg-green-50/10" : "border-destructive/50"
                            )}
                            onChange={(e) => setUserOverrides(prev => ({ ...prev, endCol: e.target.value }))}
                            value={mapping.endCol || ""}
                        >
                            <option value="">Selecciona una columna...</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">WBS / Código (Opcional)</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(e) => setUserOverrides(prev => ({ ...prev, wbsCol: e.target.value }))}
                            value={mapping.wbsCol || ""}
                        >
                            <option value="">(Sin asignar)</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Tipo de Tarea (P/T/S) (Opcional)</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(e) => setUserOverrides(prev => ({ ...prev, typeCol: e.target.value }))}
                            value={mapping.typeCol || ""}
                        >
                            <option value="">(Sin asignar)</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Presupuesto / Importe (Opcional)</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(e) => setUserOverrides(prev => ({ ...prev, budgetCol: e.target.value }))}
                            value={mapping.budgetCol || ""}
                        >
                            <option value="">(Sin asignar)</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                    >
                        Cancelar
                    </Button>
                    <Button 
                        onClick={handleSave}
                        disabled={!mapping.taskCol || !mapping.startCol || !mapping.endCol}
                        className={(!mapping.taskCol || !mapping.startCol || !mapping.endCol) ? "opacity-50 cursor-not-allowed" : ""}
                    >
                        Guardar Configuración
                    </Button>
                </div>
            </div>
        </div>
    );
}
