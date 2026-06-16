import { describe, it, expect } from 'vitest';
import { getLeafTasks } from './utils';

describe('getLeafTasks', () => {
  it('should return leaf tasks correctly', () => {
    const tasks = [
      { id: '1', projectName: 'ProjA', wbs: '1', type: 'P' },
      { id: '2', projectName: 'ProjA', wbs: '1.1', type: 'P' },
      { id: '3', projectName: 'ProjA', wbs: '1.1.1', type: 'P' },
    ];

    const leafTasks = getLeafTasks(tasks);

    expect(leafTasks).toHaveLength(1);
    expect(leafTasks[0].id).toBe('3');
  });

  it('should deduplicate tasks with same WBS taking highest priority S > T > P', () => {
    const tasks = [
      { id: '1', projectName: 'ProjA', wbs: '1', type: 'P' },
      { id: '2', projectName: 'ProjA', wbs: '1', type: 'S' },
      { id: '3', projectName: 'ProjA', wbs: '1', type: 'T' },
    ];

    const leafTasks = getLeafTasks(tasks);

    expect(leafTasks).toHaveLength(1);
    expect(leafTasks[0].id).toBe('2');
    expect(leafTasks[0].type).toBe('S');
  });

  it('should treat task type S as an atomic leaf and skip its children', () => {
    const tasks = [
      { id: '1', projectName: 'ProjA', wbs: '1', type: 'P' },
      { id: '2', projectName: 'ProjA', wbs: '1.1', type: 'S' },
      { id: '3', projectName: 'ProjA', wbs: '1.1.1', type: 'P' },
      { id: '4', projectName: 'ProjA', wbs: '1.2', type: 'P' },
    ];

    const leafTasks = getLeafTasks(tasks);

    expect(leafTasks).toHaveLength(2);
    const wbsList = leafTasks.map(t => t.wbs);
    expect(wbsList).toContain('1.1');
    expect(wbsList).toContain('1.2');
  });

  it('should handle tasks with no WBS by treating them as leaves', () => {
    const tasks = [
      { id: '1', projectName: 'ProjA', wbs: null, type: 'P' },
      { id: '2', projectName: 'ProjA', wbs: undefined, type: 'T' },
      { id: '3', projectName: 'ProjA', wbs: '', type: 'S' },
      { id: '4', projectName: 'ProjA', wbs: '1', type: 'P' },
    ];

    const leafTasks = getLeafTasks(tasks);

    expect(leafTasks).toHaveLength(4);
    const ids = leafTasks.map(t => t.id);
    expect(ids).toContain('1');
    expect(ids).toContain('2');
    expect(ids).toContain('3');
    expect(ids).toContain('4');
  });

  it('should keep leaf tasks from different projects separate', () => {
    const tasks = [
      { id: '1', projectName: 'ProjA', wbs: '1', type: 'P' },
      { id: '2', projectName: 'ProjB', wbs: '1', type: 'P' },
    ];

    const leafTasks = getLeafTasks(tasks);

    expect(leafTasks).toHaveLength(2);
  });
});
