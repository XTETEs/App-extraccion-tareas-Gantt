import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStore } from './useStore';
import { db } from '../db';

vi.mock('../db', () => ({
    db: {
        tasks: {
            count: vi.fn(),
            toArray: vi.fn(),
        },
        projects: {
            toArray: vi.fn(),
            bulkPut: vi.fn(),
        }
    }
}));

describe('useStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useStore.setState({ tasks: [], projects: [] }); // Reset state
    });

    describe('loadFromDB', () => {
        it('should catch and log errors from db.tasks.count()', async () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const error = new Error('Database connection failed');
            (db.tasks.count as any).mockRejectedValueOnce(error);

            // Get initial state
            const initialState = useStore.getState();

            await useStore.getState().loadFromDB();

            // Verify console.error was called
            expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to load from DB:", error);

            // Verify state remained unchanged
            const finalState = useStore.getState();
            expect(finalState.tasks).toEqual(initialState.tasks);
            expect(finalState.projects).toEqual(initialState.projects);

            consoleErrorSpy.mockRestore();
        });
    });
});
