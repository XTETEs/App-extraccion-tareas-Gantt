import { renderToString } from 'react-dom/server';
import { TaskTable } from './src/components/TaskTable';
import React from 'react';

// Create a mock store since useStore is called in TaskTable
jest.mock('./src/store/useStore', () => ({
  useStore: () => ({
    dateRange: { from: new Date('2024-01-01'), to: new Date('2024-12-31') },
    projects: [{ name: 'Project 1', order: 1 }, { name: 'Project 2', order: 2 }]
  })
}));

const generateTasks = (count: number) => {
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

const tasks = generateTasks(5000);

const start = performance.now();
for (let i = 0; i < 100; i++) {
  // We can't render it directly outside a component tree with hooks easily in this simple script,
  // Let's just extract the grouping logic to measure it
}
const end = performance.now();
console.log(`Time: ${end - start}ms`);
