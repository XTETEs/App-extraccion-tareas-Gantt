import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Button } from './ui/button';
import type { ColumnMapping } from '../types';

function getAutoMapping(headers: string[]): Partial<ColumnMapping> {
    const newMapping: Partial<ColumnMapping> = {};

    headers.forEach(header => {
        const lower = String(header || '').toLowerCase();
        if (lower.includes('tarea') || lower.includes('actividad') || lower.includes('descripcion')) newMapping.taskCol = header;
        if (lower.includes('inicio') || lower.includes('comienzo')) newMapping.startCol = header;
        if (lower.includes('fin') || lower.includes('termino') || lower.includes('final')) newMapping.endCol = header;
        if (lower.includes('wbs') || lower === 'id' || lower.includes('code') || lower.includes('codigo') || lower.includes('código')) newMapping.wbsCol = header;
        if (lower.includes('tipo') || lower.includes('type')) newMapping.typeCol = header;
        if (lower.includes('holgura') || lower.includes('slack') || lower.includes('margen')) newMapping.slackCol = header;
        if (lower.includes('hito') || lower.includes('milestone')) newMapping.milestoneCol = header;
        if (lower.includes('presupuesto') || lower.includes('importe') || lower.includes('coste') || lower.includes('budget') || lower.includes('amount')) newMapping.budgetCol = header;
    });

    return newMapping;
}

interface ColumnSelectProps {
    label: string;
    value: string;
    onChange: (val: string) => void;
    options: string[];
    emptyLabel?: string;
}

function ColumnSelect({ label, value, onChange, options, emptyLabel = "Selecciona una columna..." }: ColumnSelectProps) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-medium">{label}</label>
            <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(e) => onChange(e.target.value)}
                value={value}
            >
                <option value="">{emptyLabel}</option>
                {options.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
        </div>
    );
}

export function MappingModal() {
    const { rawHeaders, setColumnMapping, setMappingModalOpen, isMappingModalOpen } = useStore();
    const [mapping, setMapping] = useState<Partial<ColumnMapping>>({});

    // Using an effect for this initial derivation causes the linter to warn about
    // setState in an effect. We can achieve the same by setting state in useEffect
    // when mapping is completely empty, or simply by computing initial state.
    // However, since we want to only auto-select ONCE when rawHeaders are populated,
    // and let the user override, we can use a ref, or an effect with a dependency.
    // Given the React Compiler restrictions, we'll initialize correctly
    // and rely on a ref to track if we've auto-mapped for these headers.

    useEffect(() => {
        let mounted = true;

        if (rawHeaders.length > 0) {
            // Delaying the state update slightly to avoid the cascading render warning
            // although setting state in effect is generally fine for initialization
            const timeoutId = setTimeout(() => {
                if (mounted) {
                    setMapping(prev => {
                        const autoMapped = getAutoMapping(rawHeaders);
                        if (Object.keys(prev).length === 0 && Object.keys(autoMapped).length > 0) {
                            return autoMapped;
                        }
                        return prev;
                    });
                }
            }, 0);

            return () => {
                mounted = false;
                clearTimeout(timeoutId);
            };
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
                    <ColumnSelect
                        label="Nombre de la Tarea (Ej. Columna E)"
                        value={mapping.taskCol || ""}
                        onChange={(val) => setMapping(prev => ({ ...prev, taskCol: val }))}
                        options={rawHeaders}
                    />
                    <ColumnSelect
                        label="Fecha de Inicio (Ej. Columna F)"
                        value={mapping.startCol || ""}
                        onChange={(val) => setMapping(prev => ({ ...prev, startCol: val }))}
                        options={rawHeaders}
                    />
                    <ColumnSelect
                        label="Fecha de Fin (Ej. Columna G)"
                        value={mapping.endCol || ""}
                        onChange={(val) => setMapping(prev => ({ ...prev, endCol: val }))}
                        options={rawHeaders}
                    />
                    <ColumnSelect
                        label="Presupuesto/Importe (Opcional)"
                        value={mapping.budgetCol || ""}
                        onChange={(val) => setMapping(prev => ({ ...prev, budgetCol: val }))}
                        options={rawHeaders}
                        emptyLabel="(Sin asignar)"
                    />
                </div>

                <div className="mt-8 flex justify-end">
                    <Button onClick={handleSave}>Guardar Configuración</Button>
                </div>
            </div>
        </div>
    );
}
