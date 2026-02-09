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
    addTasks: (tasks: Task[], projectDates?: { startDate?: Date, endDate?: Date }) => Promise<void>;
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
        // We assume an upload contains the full latest state of a project.
        await db.tasks.where('projectName').anyOf(uniqueProjectNames).delete();

        // 2. Add new tasks to DB and State
        await db.tasks.bulkAdd(newTasks);

        set((state) => ({
            // Remove old tasks for these projects and append new ones
            tasks: [
                ...state.tasks.filter(t => !uniqueProjectNames.includes(t.projectName)),
                ...newTasks
            ],
            isReportGenerated: false // Reset report on new data
        }));

        // 3. Handle Projects creation/update
        try {
            const existingProjects = await db.projects.toArray();
            const existingNames = new Set(existingProjects.map(p => p.name));

            for (const name of uniqueProjectNames) {
                if (!existingNames.has(name)) {
                    // Create New
                    const maxOrder = existingProjects.length > 0
                        ? Math.max(...existingProjects.map(p => p.order || 0))
                        : -1;

                    const newProjectData = {
                        id: name,
                        name,
                        lastUpdated: new Date(),
                        order: maxOrder + 1,
                        startDate: projectDates?.startDate,
                        endDate: projectDates?.endDate
                    };

                    await db.projects.add(newProjectData as any);

                    set(state => ({
                        projects: [...state.projects, {
                            id: newProjectData.id,
                            name: newProjectData.name,
                            order: newProjectData.order,
                            startDate: newProjectData.startDate,
                            endDate: newProjectData.endDate
                        }]
                    }));
                } else {
                    // Update Existing with new dates if provided
                    if (projectDates && (projectDates.startDate || projectDates.endDate)) {
                        const updateData: any = { lastUpdated: new Date() };
                        if (projectDates.startDate) updateData.startDate = projectDates.startDate;
                        if (projectDates.endDate) updateData.endDate = projectDates.endDate;

                        await db.projects.update(name, updateData);

                        set(state => ({
                            projects: state.projects.map(p =>
                                p.id === name
                                    ? {
                                        ...p,
                                        startDate: projectDates.startDate || p.startDate,
                                        endDate: projectDates.endDate || p.endDate
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
    setDateRange: (range) => set({ dateRange: range }),
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
                    set({ tasks, projects: projects.map(p => ({ id: p.name, name: p.name, order: p.order, startDate: p.startDate, endDate: p.endDate })) });
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
            set({ tasks: [], projects: [], columnMapping: null, rawHeaders: [], hiddenProjects: [], isReportGenerated: false });
        } catch (error) {
            console.error("Failed to clear DB:", error);
        }
    },

    deleteProjects: async (projectNames) => {
        try {
            // Delete from DB
            await db.tasks.where('projectName').anyOf(projectNames).delete();
            await db.projects.bulkDelete(projectNames);

            // Update State
            set((state) => ({
                tasks: state.tasks.filter(t => !projectNames.includes(t.projectName)),
                projects: state.projects.filter(p => !projectNames.includes(p.id)),
                hiddenProjects: state.hiddenProjects.filter(id => !projectNames.includes(id))
            }));
        } catch (error) {
            console.error("Failed to delete projects:", error);
        }
    }
}));

