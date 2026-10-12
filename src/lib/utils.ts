import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
// Deterministic color generator from string (HSL)
export function stringToColor(str: string, saturation = 65, lightness = 50) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, ${saturation}%, ${lightness}%)`;
}

// Hierarchy Filter: Only return Leaf Tasks
export function getLeafTasks(allTasks: any[]) {
    // 1. Deduplicate by Priority (S > T > P)
    const distinctTasks = deduplicateByWbs(allTasks);

    // Group by project to process each obra independently
    const tasksByProject = new Map<string, any[]>();
    distinctTasks.forEach(t => {
        const list = tasksByProject.get(t.projectName) || [];
        list.push(t);
        tasksByProject.set(t.projectName, list);
    });

    const leafTasks: any[] = [];

    tasksByProject.forEach(projectTasks => {
        const hasExplicitLeafTypes = projectTasks.some(t => t.type === 'T' || t.type === 'S');
        const wbsSet = new Set(
            projectTasks
                .map(t => (t.wbs ? t.wbs.toString().trim() : ''))
                .filter(Boolean)
        );

        projectTasks.forEach(current => {
            const currWbs = current.wbs ? current.wbs.toString().trim() : '';

            // Check if any other task has current task as a hierarchical parent via separator (., -, /)
            const hasChildrenByWbs = currWbs !== '' && Array.from(wbsSet).some(otherWbs =>
                otherWbs !== currWbs && (
                    otherWbs.startsWith(currWbs + '.') ||
                    otherWbs.startsWith(currWbs + '-') ||
                    otherWbs.startsWith(currWbs + '/') ||
                    otherWbs.startsWith(currWbs + ' ')
                )
            );

            // If another task is an explicit child in the WBS tree, this task is a parent
            if (hasChildrenByWbs) {
                return;
            }

            // If project uses explicit types (P, T, S)
            if (hasExplicitLeafTypes) {
                // 'P' (Partida) is a summary header when 'T' or 'S' tasks exist
                if (current.type === 'P') {
                    return;
                }
                leafTasks.push(current);
                return;
            }

            // If no explicit types, non-parent tasks with or without WBS are leaves
            leafTasks.push(current);
        });
    });

    return leafTasks;
}

// Helper: Select best task type per WBS (S > T > P)
function deduplicateByWbs(tasks: any[]) {
    const groups = new Map<string, any[]>();

    // Group by Project + WBS
    tasks.forEach(t => {
        if (!t.wbs) {
            // No WBS? Keep it separate/unique (or handle as special case). 
            // Let's use ID as key to keep it.
            groups.set(t.id, [t]);
            return;
        }
        const key = `${t.projectName}||${t.wbs}`;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(t);
    });

    const result: any[] = [];

    groups.forEach((groupTasks) => {
        if (groupTasks.length === 1) {
            result.push(groupTasks[0]);
            return;
        }

        // Priority Selection
        const sType = groupTasks.find(t => t.type === 'S');
        if (sType) {
            result.push(sType);
            return;
        }

        const tType = groupTasks.find(t => t.type === 'T');
        if (tType) {
            result.push(tType);
            return;
        }

        // Fallback: P or others. If multiple P, take first or all? 
        // User said: "evitamos duplicidades". Assuming strict dedupe.
        // We take the first available if no S or T.
        const pType = groupTasks.find(t => t.type === 'P');
        if (pType) {
            result.push(pType);
            return;
        }

        // If absolutely no type match (e.g. all empty type), take first
        result.push(groupTasks[0]);
    });

    return result;
}
