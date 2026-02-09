import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import type { ColumnMapping } from '../types';

export function MappingModal() {
    const { rawHeaders, setColumnMapping, setMappingModalOpen, isMappingModalOpen } = useStore();
    const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});

    // Auto-select columns based on common names
    useEffect(() => {
        if (rawHeaders.length > 0) {
            const newMapping: Partial<ColumnMapping> = {};

            // Simple heuristic to find columns
            rawHeaders.forEach(header => {
                const lower = header.toLowerCase();
                // Project name is not a column anymore
                if (lower.includes('tarea') || lower.includes('actividad') || lower.includes('descripcion')) newMapping.taskCol = header;
                if (lower.includes('inicio') || lower.includes('comienzo')) newMapping.startCol = header;
                if (lower.includes('fin') || lower.includes('termino') || lower.includes('final')) newMapping.endCol = header;
                if (lower.includes('wbs') || lower === 'id' || lower.includes('code') || lower.includes('codigo') || lower.includes('código')) newMapping.wbsCol = header;
                if (lower.includes('tipo') || lower.includes('type')) newMapping.typeCol = header;
                if (lower.includes('holgura') || lower.includes('slack') || lower.includes('margen')) newMapping.slackCol = header;
                if (lower.includes('hito') || lower.includes('milestone')) newMapping.milestoneCol = header;
                if (lower.includes('presupuesto') || lower.includes('importe') || lower.includes('coste') || lower.includes('budget') || lower.includes('amount')) newMapping.budgetCol = header;
            });

            setMapping(prev => ({ ...prev, ...newMapping }));
        }
    }, [rawHeaders]);

    if (!isMappingModalOpen) return null;

    const handleSave = () => {
        if (mapping.taskCol && mapping.startCol && mapping.endCol) {
            setColumnMapping(mapping as ColumnMapping);
            setMappingModalOpen(false);
            // Ideally here we would re-trigger the file processing of the pending file, 
            // but simpler flow is: User maps -> User uploads again OR we keep the file in memory.
            // For V1, we will ask user to re-upload or handle existing file in FileUpload component if we kept it.
            // Better UX: FileUpload keeps the file in a temp state and processes it after this closes.
        } else {
            alert("Please map all required fields.");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg text-card-foreground">
                <h2 className="text-xl font-bold mb-4">Configurar Columnas</h2>
                <p className="text-sm text-muted-foreground mb-6">
                    Para entender tu archivo Excel, necesitamos saber qué columna corresponde a cada dato.
                    Esto solo se hace una vez.
                </p>

                <div className="space-y-4">


                    <div className="space-y-2">
                        <label className="text-sm font-medium">Nombre de la Tarea (Ej. Columna E)</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(e) => setMapping(prev => ({ ...prev, taskCol: e.target.value }))}
                            value={mapping.taskCol || ""}
                        >
                            <option value="">Selecciona una columna...</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Fecha de Inicio (Ej. Columna F)</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(e) => setMapping(prev => ({ ...prev, startCol: e.target.value }))}
                            value={mapping.startCol || ""}
                        >
                            <option value="">Selecciona una columna...</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Fecha de Fin (Ej. Columna G)</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(e) => setMapping(prev => ({ ...prev, endCol: e.target.value }))}
                            value={mapping.endCol || ""}
                        >
                            <option value="">Selecciona una columna...</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Presupuesto/Importe (Opcional)</label>
                        <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onChange={(e) => setMapping(prev => ({ ...prev, budgetCol: e.target.value }))}
                            value={mapping.budgetCol || ""}
                        >
                            <option value="">(Sin asignar)</option>
                            {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                    </div>

                </div>

                <div className="mt-8 flex justify-end">
                    <Button onClick={handleSave}>Guardar Configuración</Button>
                </div>
            </div>
        </div>
    );
}
