export interface Task {
    id: string;
    projectId: string; // The "Obra" name
    projectName: string;
    name: string; // Tarea
    startDate: Date;
    endDate: Date;
    status?: string; // Optional status
    isCritical?: boolean;
    progress?: number;
    wbs?: string;
    type?: string; // 'P' | 'T' | 'S'
    delayDays?: number; // Calculated: Today - EndDate
    totalSlack?: number; // Holgura Total
    isMilestone?: boolean;
    budget?: number; // Presupuesto / Importe
    industrial?: string; // Nombre del industrial/contratista asignado
}

export interface Project {
    id: string;
    name: string;
    lastUpdated?: Date;
    order?: number;
    startDate?: Date;
    endDate?: Date;
    /** URL of the corresponding Vercel Blob file */
    blobUrl?: string;
}

export interface ColumnMapping {
    projectCol?: string; // Now optional/unused as we use Sheet Name
    taskCol: string;
    startCol: string;
    endCol: string;
    wbsCol?: string;
    typeCol?: string;
    criticalCol?: string; // Optional (Direct Bool)
    slackCol?: string; // Holgura
    milestoneCol?: string; // Hito
    budgetCol?: string; // Presupuesto
}

export interface DateRange {
    from: Date | undefined;
    to: Date | undefined;
}
