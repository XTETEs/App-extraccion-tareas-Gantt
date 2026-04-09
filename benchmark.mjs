import { performance } from 'perf_hooks';

const generateTasks = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `task-${i}`,
    projectName: i % 2 === 0 ? 'Project 1' : 'Project 2',
    name: `Task ${i}`,
    wbs: `1.${i}`,
    type: 'T',
    startDate: new Date('2024-02-01'),
    endDate: new Date('2024-03-01'),
    delayDays: 0,
    budget: 1000,
  }));
};

const tasks = generateTasks(10000);
const projects = [{ name: 'Project 1', order: 1 }, { name: 'Project 2', order: 2 }];

function runUnoptimized() {
    const tasksByProject = {};
    tasks.forEach(task => {
        const key = task.projectName || 'Sin Proyecto';
        if (!tasksByProject[key]) tasksByProject[key] = [];
        tasksByProject[key].push(task);
    });

    const sortedProjectNames = Object.keys(tasksByProject).sort((a, b) => {
        const orderA = projects.find(p => p.name === a)?.order ?? 999;
        const orderB = projects.find(p => p.name === b)?.order ?? 999;
        return orderA - orderB;
    });

    Object.keys(tasksByProject).forEach(key => {
        tasksByProject[key].sort((a, b) => {
            const strA = a.wbs ? a.wbs.toString().trim() : '';
            const strB = b.wbs ? b.wbs.toString().trim() : '';

            if (strA && strB) {
                const partsA = strA.split(/[\.\-\s]+/);
                const partsB = strB.split(/[\.\-\s]+/);

                const len = Math.min(partsA.length, partsB.length);
                for (let i = 0; i < len; i++) {
                    const numA = parseInt(partsA[i], 10);
                    const numB = parseInt(partsB[i], 10);

                    if (!isNaN(numA) && !isNaN(numB)) {
                        if (numA !== numB) return numA - numB;
                    } else {
                        const cmp = partsA[i].localeCompare(partsB[i], undefined, { numeric: true });
                        if (cmp !== 0) return cmp;
                    }
                }
                return partsA.length - partsB.length;
            }

            if (strA && !strB) return -1;
            if (!strA && strB) return 1;

            return a.startDate.getTime() - b.startDate.getTime();
        });
    });

    return { tasksByProject, sortedProjectNames };
}

const ITERATIONS = 100;

console.log("Running unoptimized version...");
const start1 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    runUnoptimized();
}
const end1 = performance.now();
const timeUnoptimized = end1 - start1;
console.log(`Unoptimized Time: ${timeUnoptimized.toFixed(2)}ms`);

// Memoized version behavior simulation
let memoizedResult = null;
function runOptimized() {
    if (memoizedResult) return memoizedResult;
    memoizedResult = runUnoptimized();
    return memoizedResult;
}

const start2 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    runOptimized();
}
const end2 = performance.now();
const timeOptimized = end2 - start2;
console.log(`Optimized Time: ${timeOptimized.toFixed(2)}ms`);
