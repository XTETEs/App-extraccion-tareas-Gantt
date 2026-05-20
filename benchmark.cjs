const { performance } = require('perf_hooks');

// Generate mock tasks
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

const newApproach = () => {
    const uniqueProjectNames = [];
    const seen = new Set();
    for (let i = 0; i < newTasks.length; i++) {
        const name = newTasks[i].projectName;
        if (!seen.has(name)) {
            seen.add(name);
            uniqueProjectNames.push(name);
        }
    }
    return uniqueProjectNames;
};

const t1 = measure('Old Approach (Map + Set + Array.from)', oldApproach);
const t2 = measure('New Approach (Single Loop + Push)', newApproach);

console.log(`Improvement: ${((t1 - t2) / t1 * 100).toFixed(2)}%`);
