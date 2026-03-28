import { create } from 'zustand';
import type { StoreApi } from 'zustand';
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

type SetState = StoreApi<AppState>['setState'];
type GetState = StoreApi<AppState>['getState'];

// --- Extracted Store Operations ---

const handleReorderProjects = async (set: SetState, newProjects: Project[]) => {
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
};

const handleAddTasks = async (set: SetState, newTasks: Task[], projectDates?: { startDate?: Date, endDate?: Date, blobUrl?: string }) => {
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
            if (!existingNamesSet.has(name)) {
                currentMaxOrder++;
                const newProject: Project = {
                    id: name,
                    name,
                    lastUpdated: new Date(),
                    order: currentMaxOrder,
                    startDate: projectDates?.startDate,
                    endDate: projectDates?.endDate,
                    blobUrl: projectDates?.blobUrl,
                };
                projectsToAdd.push(newProject);
                existingNamesSet.add(name); // Prevent duplicate adds in same batch
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const updateData: any = { lastUpdated: new Date() };
                if (projectDates?.startDate) updateData.startDate = projectDates.startDate;
                if (projectDates?.endDate) updateData.endDate = projectDates.endDate;
                if (projectDates?.blobUrl) updateData.blobUrl = projectDates.blobUrl;

                projectsToUpdate.set(name, updateData);
            }
        }

        // Perform DB operations
        if (projectsToAdd.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await db.projects.bulkAdd(projectsToAdd as any);
        }

        for (const [name, updateData] of projectsToUpdate.entries()) {
            await db.projects.update(name, updateData);
        }

        // 4. Final State Update (Atomic)
        set((state: AppState) => {
            const newTasksState = [
                ...state.tasks.filter(t => !uniqueProjectNames.includes(t.projectName)),
                ...newTasks
            ];

            let newProjectsState = [...state.projects];

            // Process updates in state
            if (projectsToUpdate.size > 0) {
                newProjectsState = newProjectsState.map(p => {
                    const update = projectsToUpdate.get(p.id);
                    return update ? { ...p, ...update } as Project : p;
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
                    blobUrl: p.blobUrl
                } as Project))];
            }

            return {
                tasks: newTasksState,
                projects: newProjectsState,
                isReportGenerated: false
            };
        });
    } catch (error) {
        console.error("Failed to handle projects creation/update:", error);
        // Even if projects fail, update tasks so user sees something
        set((state: AppState) => ({
            tasks: [
                ...state.tasks.filter(t => !uniqueProjectNames.includes(t.projectName)),
                ...newTasks
            ],
            isReportGenerated: false
        }));
    }
};

const handleLoadFromDB = async (set: SetState) => {
    try {
        const count = await db.tasks.count();
        if (count > 0) {
            const tasks = await db.tasks.toArray();
            // CRITICAL: orderBy('order') excludes items where 'order' is undefined.
            // We must fetch ALL projects first.
            const projects = await db.projects.toArray();

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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
};

const handleClearRemoteFiles = async () => {
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
};

const handleClearData = async (set: SetState) => {
    try {
        await db.tasks.clear();
        await db.projects.clear();

        // Also try to clear remote files
        await handleClearRemoteFiles();

        set({ tasks: [], projects: [], columnMapping: null, rawHeaders: [], hiddenProjects: [], isReportGenerated: false });
    } catch (error) {
        console.error("Failed to clear DB:", error);
    }
};

const handleDeleteProjects = async (set: SetState, get: GetState, projectNames: string[]) => {
    try {
        const state = get();
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
        set((state: AppState) => {
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
};

// --- Store Definition ---

export const useStore = create<AppState>((set, get) => ({
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
    setTasks: (tasks) => set({ tasks }),
    setProjects: (projects) => set({ projects }),

    reorderProjects: (newProjects) => handleReorderProjects(set, newProjects),
    addTasks: (newTasks, projectDates) => handleAddTasks(set, newTasks, projectDates),

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

    loadFromDB: () => handleLoadFromDB(set),
    clearData: () => handleClearData(set),
    clearRemoteFiles: () => handleClearRemoteFiles(),
    deleteProjects: (projectNames) => handleDeleteProjects(set, get, projectNames),

    setRadarSelectedTask: (taskName: string) => set({ radarSelectedTask: taskName }),
}));
