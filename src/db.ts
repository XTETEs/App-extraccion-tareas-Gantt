import Dexie, { type EntityTable } from 'dexie';
import { type Task } from './types';

// Define DB Schema
interface Project {
    id: string; // Using string ID (name) as primary key or separate ID
    name: string;
    lastUpdated: Date;
    order?: number;
    startDate?: Date;
    endDate?: Date;
}

// Extend Task to be DB compatible if needed, but the original interface should work
// We might want to optimize by indexing specific fields
const db = new Dexie('ConstructionGanttDB') as Dexie & {
    projects: EntityTable<Project, 'name'>; // 'name' as PK
    tasks: EntityTable<Task, 'id'>; // 'id' as PK
};

// Start Date, End Date, Project Name, etc. are important for querying if we ever need to
db.version(1).stores({
    projects: 'name, lastUpdated',
    tasks: 'id, projectName, wbs, startDate, endDate, type'
});

db.version(2).stores({
    projects: 'name, lastUpdated, order'
});

export { db };
export type { Project };
