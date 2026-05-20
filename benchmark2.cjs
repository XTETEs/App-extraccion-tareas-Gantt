const { performance } = require('perf_hooks');

const generateTasks = (count, uniqueProjects) => {
    const tasks = [];
    for (let i = 0; i < count; i++) {
        tasks.push({
            id: i,
            projectName: `Project_${i % uniqueProjects}`,
            name: `Task_${i}`
        });
    }
    return tasks;
};

const newTasks = generateTasks(100000, 50);

const measure = (name, fn) => {
    const start = performance.now();
    for(let i=0; i<100; i++) {
        fn();
    }
    const end = performance.now();
    console.log(`${name}: ${(end - start).toFixed(2)}ms`);
    return end - start;
};

const oldApproach = () => {
    const uniqueProjectNames = Array.from(new Set(newTasks.map(t => t.projectName)));
    return uniqueProjectNames;
};

const newApproachForOf = () => {
    const uniqueProjectNames = [];
    const seen = new Set();
    for (const task of newTasks) {
        const name = task.projectName;
        if (!seen.has(name)) {
            seen.add(name);
            uniqueProjectNames.push(name);
        }
    }
    return uniqueProjectNames;
};

const t1 = measure('Old Approach', oldApproach);
const t2 = measure('New Approach (For...of)', newApproachForOf);

console.log(`Improvement: ${((t1 - t2) / t1 * 100).toFixed(2)}%`);
