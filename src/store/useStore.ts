import { create } from 'zustand';
import type { Task, ColumnMapping, DateRange, Project } from '../types';
import { db } from '../db';
import { differenceInCalendarDays } from 'date-fns';

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
    addTasks: (
        tasks: Task[],
        projectDates?: { startDate?: Date; endDate?: Date; blobUrl?: string } | Map<string, { startDate?: Date; endDate?: Date; blobUrl?: string }> | Record<string, { startDate?: Date; endDate?: Date; blobUrl?: string }>
    ) => Promise<void>;
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
    isReportGenerated: true, // Default to true so data is immediately visible
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

        // 2. Add new tasks to DB
        await db.tasks.bulkAdd(newTasks);

        // 3. Handle Projects creation/update in DB and collect changes for State
        try {
            const existingProjects = await db.projects.toArray();
            const existingNamesSet = new Set(existingProjects.map(p => p.name));
            
            const projectsToAdd: Project[] = [];
            const projectsToUpdate: Map<string, Partial<Project>> = new Map();
            
            let currentMaxOrder = existingProjects.length > 0
                ? Math.max(...existingProjects.map(p => p.order || 0))
                : -1;

            for (const name of uniqueProjectNames) {
                // Determine per-project start and end date from tasks as fallback
                const projTasks = newTasks.filter(t => t.projectName === name);
                const taskStarts = projTasks.map(t => (t.startDate instanceof Date ? t.startDate : new Date(t.startDate)).getTime()).filter(n => !isNaN(n));
                const taskEnds = projTasks.map(t => (t.endDate instanceof Date ? t.endDate : new Date(t.endDate)).getTime()).filter(n => !isNaN(n));
                const minStart = taskStarts.length > 0 ? new Date(Math.min(...taskStarts)) : undefined;
                const maxEnd = taskEnds.length > 0 ? new Date(Math.max(...taskEnds)) : undefined;

                const specific = projectDates instanceof Map
                    ? projectDates.get(name)
                    : (projectDates && typeof projectDates === 'object' && name in (projectDates as any) ? (projectDates as any)[name] : undefined);

                const startDate = specific?.startDate || (projectDates as any)?.startDate || minStart;
                const endDate = specific?.endDate || (projectDates as any)?.endDate || maxEnd;
                const budget = specific?.budget !== undefined ? specific.budget : (projectDates as any)?.budget;
                const blobUrl = specific?.blobUrl || (projectDates as any)?.blobUrl;

                if (!existingNamesSet.has(name)) {
                    currentMaxOrder++;
                    const newProject: Project = {
                        id: name,
                        name,
                        lastUpdated: new Date(),
                        order: currentMaxOrder,
                        startDate,
                        endDate,
                        budget,
                        blobUrl,
                    };
                    projectsToAdd.push(newProject);
                    existingNamesSet.add(name); // Prevent duplicate adds in same batch
                } else {
                    const updateData: any = { lastUpdated: new Date() };
                    if (startDate) updateData.startDate = startDate;
                    if (endDate) updateData.endDate = endDate;
                    if (budget !== undefined) updateData.budget = budget;
                    if (blobUrl) updateData.blobUrl = blobUrl;
                    
                    projectsToUpdate.set(name, updateData);
                }
            }

            // Perform DB operations
            if (projectsToAdd.length > 0) {
                await db.projects.bulkAdd(projectsToAdd as any);
            }
            
            for (const [name, updateData] of projectsToUpdate.entries()) {
                await db.projects.update(name, updateData);
            }

            // 4. Final State Update (Atomic)
            set((state) => {
                const newTasksState = [
                    ...state.tasks.filter(t => !uniqueProjectNames.includes(t.projectName)),
                    ...newTasks
                ];

                let newProjectsState = [...state.projects];
                
                // Process updates in state
                if (projectsToUpdate.size > 0) {
                    newProjectsState = newProjectsState.map(p => {
                        const update = projectsToUpdate.get(p.id);
                        return update ? { ...p, ...update } : p;
                    });
                }

                // Process additions in state
                if (projectsToAdd.length > 0) {
                    newProjectsState = [...newProjectsState, ...projectsToAdd.map(p => ({
                        id: p.id,
                        name: p.name,
                        order: p.order,
                        startDate: p.startDate,
                        endDate: p.endDate,
                        budget: p.budget,
                        blobUrl: p.blobUrl,
                        lastUpdated: p.lastUpdated
                    }))];
                }

                return {
                    tasks: newTasksState,
                    projects: newProjectsState,
                    isReportGenerated: true
                };
            });
        } catch (error) {
            console.error("Failed to handle projects creation/update:", error);
            // Even if projects fail, update tasks so user sees something
            set((state) => ({
                tasks: [
                    ...state.tasks.filter(t => !uniqueProjectNames.includes(t.projectName)),
                    ...newTasks
                ],
                isReportGenerated: true
            }));
        }
    },

    setColumnMapping: (mapping) => set({ columnMapping: mapping }),
    setDateRange: (range) => set({
        dateRange: range,
        isReportGenerated: true
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
                const rawTasks = await db.tasks.toArray();
                const now = new Date();
                const tasks: Task[] = rawTasks.map(t => {
                    const startDate = t.startDate instanceof Date ? t.startDate : new Date(t.startDate);
                    const endDate = t.endDate instanceof Date ? t.endDate : new Date(t.endDate);
                    const progress = t.progress ?? 0;
                    return {
                        ...t,
                        startDate,
                        endDate,
                        delayDays: progress >= 100 ? 0 : differenceInCalendarDays(now, endDate)
                    };
                });

                // CRITICAL: orderBy('order') excludes items where 'order' is undefined. 
                // We must fetch ALL projects first.
                const projects = await db.projects.toArray();

                // 1. Fallback: If no projects found but tasks exist (migration from v0 or broken state)
                if (projects.length === 0 && tasks.length > 0) {
                    const uniqueProjects = Array.from(new Set(tasks.map(t => t.projectName))).sort();
                    const newProjects: Project[] = uniqueProjects.map((name, index) => ({
                        id: name,
                        name,
                        lastUpdated: new Date(),
                        order: index
                    }));

                    // Use bulkPut to upsert (safe if keys exist)
                    await db.projects.bulkPut(newProjects as any);
                    set({ 
                        tasks, 
                        projects: newProjects,
                        isReportGenerated: true 
                    });
                    return;
                }

                // 2. Migration: If projects exist but lack 'order' (migration from v1)
                const missingOrder = projects.some(p => p.order === undefined);
                if (missingOrder) {
                    // Assign order based on current db order or alphabetical if arbitrary
                    projects.sort((a, b) => a.name.localeCompare(b.name));
                    const updatedProjects = projects.map((p, i) => ({ 
                        ...p, 
                        order: p.order ?? i,
                        lastUpdated: p.lastUpdated ? new Date(p.lastUpdated) : new Date(),
                        startDate: p.startDate ? new Date(p.startDate) : undefined,
                        endDate: p.endDate ? new Date(p.endDate) : undefined
                    }));

                    await db.projects.bulkPut(updatedProjects);

                    set({ 
                        tasks, 
                        projects: updatedProjects,
                        isReportGenerated: true 
                    });
                } else {
                    // 3. Normal Case: sort by order
                    projects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                    set({ 
                        tasks, 
                        projects: projects.map(p => ({
                            id: p.name,
                            name: p.name,
                            order: p.order,
                            startDate: p.startDate ? new Date(p.startDate) : undefined,
                            endDate: p.endDate ? new Date(p.endDate) : undefined,
                            blobUrl: p.blobUrl,
                            lastUpdated: p.lastUpdated ? new Date(p.lastUpdated) : new Date()
                        })),
                        isReportGenerated: true 
                    });
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
