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

    // 2. Sort by WBS (Lexical) to ensure Hierarchy
    const sorted = [...distinctTasks].sort((a, b) => {
        if (a.projectName !== b.projectName) return a.projectName.localeCompare(b.projectName);
        const wbsA = a.wbs ? a.wbs.toString().trim() : '';
        const wbsB = b.wbs ? b.wbs.toString().trim() : '';
        return wbsA.localeCompare(wbsB);
    });

    const leafTasks: any[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];

        // Special case: If no WBS, treat as leaf (fallback)
        if (!current.wbs) {
            leafTasks.push(current);
            continue;
        }

        // Logic: Treat 'S' (Subcontrata) as Atomic Leaf
        // If current is 'S', we add it, and SKIP any subsequent tasks that are children of it.
        if (current.type === 'S') {
            leafTasks.push(current);

            // Fast-forward loop to skip children
            let j = i + 1;
            while (j < sorted.length) {
                const nextCandidate = sorted[j];
                if (nextCandidate.projectName !== current.projectName || !nextCandidate.wbs) break;

                const currWbs = current.wbs.toString().trim();
                const nextWbs = nextCandidate.wbs.toString().trim();

                // Check if child
                const isChild = nextWbs.startsWith(currWbs + '.') ||
                    nextWbs.startsWith(currWbs + '-') ||
                    (nextWbs.startsWith(currWbs) && nextWbs.length > currWbs.length);

                if (!isChild) break;
                j++;
            }
            // Update main loop index (minus 1 because for-loop does i++)
            i = j - 1;
            continue;
        }

        const next = sorted[i + 1];
        let isParent = false;

        // Check if current WBS is parent of next
        if (next && next.projectName === current.projectName && next.wbs) {
            const currWbs = current.wbs.toString().trim();
            const nextWbs = next.wbs.toString().trim();

            // Logic: 1. Dot/Dash separator or 2. Strict Prefix
            if (nextWbs.startsWith(currWbs + '.') || nextWbs.startsWith(currWbs + '-') || (nextWbs.startsWith(currWbs) && nextWbs.length > currWbs.length)) {
                isParent = true;
            }
        }

        if (!isParent) {
            leafTasks.push(current);
        }
    }
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
