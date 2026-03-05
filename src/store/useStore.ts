import { create } from 'zustand';
import type { Task, ColumnMapping, DateRange, Project } from '../types';
import { db } from '../db';

interface AppState {
    tasks: Task[];
    projects: Project[];
    columnMapping: ColumnMapping | null;
    dateRange: DateRange;
    isMappingModalOpen: boolean;
    rawHeaders: string[];
    hiddenProjects: string[];

    // Actions
    setTasks: (tasks: Task[]) => void;
    addTasks: (tasks: Task[], projectDates?: { startDate?: Date, endDate?: Date, blobUrl?: string }) => Promise<void>;
    setProjects: (projects: Project[]) => void;
    reorderProjects: (projects: Project[]) => Promise<void>;
    setColumnMapping: (mapping: ColumnMapping) => void;
    setDateRange: (range: DateRange) => void;
    setMappingModalOpen: (isOpen: boolean) => void;
    setRawHeaders: (headers: string[]) => void;
    toggleProjectVisibility: (projectId: string) => void;

    // Workflow State
    isReportGenerated: boolean;
    setReportGenerated: (isGenerated: boolean) => void;

    reset: () => void;

    // Persistence
    loadFromDB: () => Promise<void>;
    clearData: () => Promise<void>;
    deleteProjects: (projectNames: string[]) => Promise<void>;
    clearRemoteFiles: () => Promise<void>;
    radarSelectedTask: string;
    setRadarSelectedTask: (taskName: string) => void;
}

export const useStore = create<AppState>((set) => ({
    tasks: [],
    projects: [],
    columnMapping: null,
    dateRange: { from: undefined, to: undefined },
    isMappingModalOpen: false,
    rawHeaders: [],
    hiddenProjects: [],
    isReportGenerated: false, // Default to false
    radarSelectedTask: '',

    setReportGenerated: (isGenerated) => set({ isReportGenerated: isGenerated }),

    setTasks: (tasks) => {
        set({ tasks });
    },

    setProjects: (projects) => set({ projects }),

    reorderProjects: async (newProjects) => {
        // Update order property to match new array index
        const updatedProjects = newProjects.map((p, index) => ({ ...p, order: index }));

        // Optimistic update
        set({ projects: updatedProjects });

        // Persist order
        try {
            await Promise.all(updatedProjects.map((p) =>
                db.projects.update(p.id, { order: p.order })
            ));
        } catch (error) {
            console.error("Failed to reorder projects:", error);
        }
    },

    addTasks: async (newTasks, projectDates) => {
        const uniqueProjectNames = Array.from(new Set(newTasks.map(t => t.projectName)));

        // 1. Clean up existing tasks for these projects to prevent duplicates (Snapshot logic)
        await db.tasks.where('projectName').anyOf(uniqueProjectNames).delete();

        // 2. Add new tasks to DB and State
        await db.tasks.bulkAdd(newTasks);

        set((state) => ({
            tasks: [
                ...state.tasks.filter(t => !uniqueProjectNames.includes(t.projectName)),
                ...newTasks
            ],
            isReportGenerated: false
        }));

        // 3. Handle Projects creation/update
        try {
            const existingProjects = await db.projects.toArray();
            const existingNames = new Set(existingProjects.map(p => p.name));

            for (const name of uniqueProjectNames) {
                if (!existingNames.has(name)) {
                    const maxOrder = existingProjects.length > 0
                        ? Math.max(...existingProjects.map(p => p.order || 0))
                        : -1;

                    const newProjectData = {
                        id: name,
                        name,
                        lastUpdated: new Date(),
                        order: maxOrder + 1,
                        startDate: projectDates?.startDate,
                        endDate: projectDates?.endDate,
                        blobUrl: projectDates?.blobUrl,
                    };

                    await db.projects.add(newProjectData as any);

                    set(state => ({
                        projects: [...state.projects, {
                            id: newProjectData.id,
                            name: newProjectData.name,
                            order: newProjectData.order,
                            startDate: newProjectData.startDate,
                            endDate: newProjectData.endDate,
                            blobUrl: newProjectData.blobUrl,
                        }]
                    }));
                } else {
                    // Update Existing with new dates/blobUrl if provided
                    const updateData: any = { lastUpdated: new Date() };
                    if (projectDates?.startDate) updateData.startDate = projectDates.startDate;
                    if (projectDates?.endDate) updateData.endDate = projectDates.endDate;
                    if (projectDates?.blobUrl) updateData.blobUrl = projectDates.blobUrl;

                    if (Object.keys(updateData).length > 1) {
                        await db.projects.update(name, updateData);

                        set(state => ({
                            projects: state.projects.map(p =>
                                p.id === name
                                    ? {
                                        ...p,
                                        startDate: projectDates?.startDate || p.startDate,
                                        endDate: projectDates?.endDate || p.endDate,
                                        blobUrl: projectDates?.blobUrl || p.blobUrl,
                                    }
                                    : p
                            )
                        }));
                    }
                }
            }
        } catch (error) {
            console.error("Failed to handle projects creation/update:", error);
        }
    },

    setColumnMapping: (mapping) => set({ columnMapping: mapping }),
    setDateRange: (range) => set({
        dateRange: range,
        isReportGenerated: false // Reset extraction when dates change
    }),
    setMappingModalOpen: (isOpen) => set({ isMappingModalOpen: isOpen }),
    setRawHeaders: (headers) => set({ rawHeaders: headers }),

    toggleProjectVisibility: (projectId) => set((state) => ({
        hiddenProjects: state.hiddenProjects.includes(projectId)
            ? state.hiddenProjects.filter(id => id !== projectId)
            : [...state.hiddenProjects, projectId]
    })),

    reset: () => set({ tasks: [], columnMapping: null, rawHeaders: [], hiddenProjects: [] }),

    loadFromDB: async () => {
        try {
            const count = await db.tasks.count();
            if (count > 0) {
                const tasks = await db.tasks.toArray();
                // CRITICAL: orderBy('order') excludes items where 'order' is undefined. 
                // We must fetch ALL projects first.
                let projects = await db.projects.toArray();

                // 1. Fallback: If no projects found but tasks exist (migration from v0 or broken state)
                if (projects.length === 0 && tasks.length > 0) {
                    const uniqueProjects = Array.from(new Set(tasks.map(t => t.projectName))).sort();
                    const newProjects = uniqueProjects.map((name, index) => ({
                        id: name,
                        name,
                        lastUpdated: new Date(),
                        order: index
                    }));

                    // Use bulkPut to upsert (safe if keys exist)
                    await db.projects.bulkPut(newProjects as any);
                    set({ tasks, projects: newProjects.map(p => ({ id: p.id, name: p.name, order: p.order })) });
                    return;
                }

                // 2. Migration: If projects exist but lack 'order' (migration from v1)
                const missingOrder = projects.some(p => p.order === undefined);
                if (missingOrder) {
                    // Assign order based on current db order or alphabetical if arbitrary
                    projects.sort((a, b) => a.name.localeCompare(b.name));
                    const updatedProjects = projects.map((p, i) => ({ ...p, order: p.order ?? i }));

                    await db.projects.bulkPut(updatedProjects);

                    set({ tasks, projects: updatedProjects.map(p => ({ id: p.name, name: p.name, order: p.order, startDate: p.startDate, endDate: p.endDate })) });
                } else {
                    // 3. Normal Case: sort by order
                    projects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                    set({ tasks, projects: projects.map(p => ({ id: p.name, name: p.name, order: p.order, startDate: p.startDate, endDate: p.endDate, blobUrl: p.blobUrl })) });
                }
            }
        } catch (error) {
            console.error("Failed to load from DB:", error);
        }
    },

    clearData: async () => {
        try {
            await db.tasks.clear();
            await db.projects.clear();

            // Also try to clear remote files
            const state = useStore.getState();
            await state.clearRemoteFiles();

            set({ tasks: [], projects: [], columnMapping: null, rawHeaders: [], hiddenProjects: [], isReportGenerated: false });
        } catch (error) {
            console.error("Failed to clear DB:", error);
        }
    },

    clearRemoteFiles: async () => {
        try {
            console.log('[Store] Calling clear-files API');
            const response = await fetch('/api/clear-files', {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error('Failed to clear remote files');
            }
            console.log('[Store] Remote files cleared successfully');
        } catch (error) {
            console.error('[Store] Error clearing remote files:', error);
        }
    },

    deleteProjects: async (projectNames) => {
        try {
            const state = useStore.getState();
            const isDeletingAll = projectNames.length === state.projects.length;

            // --- Delete remote blob files for each project being deleted ---
            const projectsToDelete = state.projects.filter(p => projectNames.includes(p.id));
            await Promise.allSettled(
                projectsToDelete
                    .filter(p => p.blobUrl)
                    .map(p =>
                        fetch('/api/delete-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: p.blobUrl }),
                        }).then(async res => {
                            if (!res.ok) throw new Error(`Server returned ${res.status}`);
                            const text = await res.text();
                            if (text.trim().startsWith('import')) throw new Error('API returned JS source code instead of executing. (Run vercel dev)');
                            return JSON.parse(text);
                        }).catch(e => {
                            console.error(`[deleteProjects] Error eliminando archivo remoto de "${p.name}":`, e);
                        })
                    )
            );

            if (isDeletingAll) {
                await db.tasks.clear();
                await db.projects.clear();
            } else {
                await db.tasks.where('projectName').anyOf(projectNames).delete();
                await db.projects.bulkDelete(projectNames);
            }

            // Update State
            set((state) => {
                const remainingProjects = state.projects.filter(p => !projectNames.includes(p.id));
                return {
                    tasks: state.tasks.filter(t => !projectNames.includes(t.projectName)),
                    projects: remainingProjects,
                    hiddenProjects: state.hiddenProjects.filter(id => !projectNames.includes(id)),
                    isReportGenerated: remainingProjects.length > 0 ? state.isReportGenerated : false
                };
            });
        } catch (error) {
            console.error("Failed to delete projects:", error);
        }
    },

    setRadarSelectedTask: (taskName: string) => set({ radarSelectedTask: taskName }),
}));
