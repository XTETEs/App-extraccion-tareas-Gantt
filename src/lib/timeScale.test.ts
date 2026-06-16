import { describe, it, expect } from 'vitest';
import { buildTimeScale, toUtcDay, getISOWeek } from './timeScale';

describe('timeScale', () => {
    describe('toUtcDay', () => {
        it('should strip time component and return UTC epoch ms', () => {
            const date = new Date(Date.UTC(2026, 2, 24, 15, 30, 0)); // 2026-03-24T15:30:00.000Z
            const expected = Date.UTC(2026, 2, 24);
            // In a local environment, toUtcDay strips local time.
            // Let's create a date where we control the local components.
            // Since we can't easily mock the local timezone, we test the logic roughly:
            const now = new Date();
            const utc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
            expect(toUtcDay(now)).toBe(utc);
        });

        it('should handle string inputs', () => {
            const dateStr = '2026-03-24T00:00:00';
            const date = new Date(dateStr);
            const expected = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
            expect(toUtcDay(dateStr)).toBe(expected);
        });

        it('should handle numeric inputs', () => {
            const nowMs = Date.now();
            const date = new Date(nowMs);
            const expected = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
            expect(toUtcDay(nowMs)).toBe(expected);
        });
    });

    describe('getISOWeek', () => {
        it('should return correct ISO week number for dates in the middle of the year', () => {
            // May 14, 2026 is Thursday -> Week 20
            expect(getISOWeek(new Date(Date.UTC(2026, 4, 14)))).toBe(20);
        });

        it('should return correct ISO week number for start of the year', () => {
            // Jan 1, 2026 is Thursday -> Week 1
            expect(getISOWeek(new Date(Date.UTC(2026, 0, 1)))).toBe(1);
        });

        it('should return correct ISO week number for end of the year', () => {
            // Dec 31, 2026 is Thursday -> Week 53
            expect(getISOWeek(new Date(Date.UTC(2026, 11, 31)))).toBe(53);
        });
    });

    describe('buildTimeScale', () => {
        it('should return null for empty tasks array', () => {
            expect(buildTimeScale([])).toBeNull();
        });

        it('should build a valid timescale with correctly snapped start and end dates', () => {
            // Create start and end dates directly
            // March 15, 2026 (Sunday)
            const startDate = new Date(Date.UTC(2026, 2, 15));
            // June 18, 2026 (Thursday)
            const endDate = new Date(Date.UTC(2026, 5, 18));

            const tasks = [{ startDate, endDate }];
            const timeScale = buildTimeScale(tasks);

            expect(timeScale).not.toBeNull();
            if (!timeScale) return;

            // Start logic:
            // 1 month before March 15, 2026 -> February 15, 2026 (Sunday)
            // Snap to preceding Monday -> February 9, 2026
            const expectedStart = Date.UTC(2026, 1, 9);
            expect(timeScale.startMs).toBe(expectedStart);

            // End logic:
            // At least 4 months from expectedStart -> June 9, 2026
            // End date is June 18, 2026. Max is June 18, 2026.
            // Snap to next Sunday -> June 21, 2026
            const expectedEnd = Date.UTC(2026, 5, 21);
            expect(timeScale.endMs).toBe(expectedEnd);

            const MS_DAY = 86_400_000;
            const expectedTotalMs = expectedEnd - expectedStart;
            expect(timeScale.totalMs).toBe(expectedTotalMs);

            // Total weeks is rounded up
            const expectedWeeks = Math.ceil(expectedTotalMs / (7 * MS_DAY));
            expect(timeScale.weekTicks.length).toBe(expectedWeeks);

            const COL_PX = 72;
            expect(timeScale.totalPx).toBe(expectedWeeks * COL_PX);

            // Test toPx
            expect(timeScale.toPx(expectedStart)).toBe(0);
            expect(timeScale.toPx(expectedEnd)).toBe(timeScale.totalPx);
            expect(timeScale.toPx(expectedStart + expectedTotalMs / 2)).toBe(timeScale.totalPx / 2);

            // Test week ticks labels and data
            const firstTick = timeScale.weekTicks[0];
            expect(firstTick.ms).toBe(expectedStart);
            expect(firstTick.label).toBe('09 feb');
            expect(firstTick.year).toBe('2026');

            const lastTick = timeScale.weekTicks[timeScale.weekTicks.length - 1];
            expect(lastTick.ms).toBe(expectedEnd - 6 * MS_DAY); // last tick is Monday of the last week (expectedEnd is a Sunday but it's really the Monday of the *next* week if we didn't add anything, but since cursor < endMs)
        });

        it('should correctly handle the minimum 4 month spread', () => {
             // Task only lasts 1 day
             const startDate = new Date(Date.UTC(2026, 2, 15));
             const endDate = new Date(Date.UTC(2026, 2, 16));
             const tasks = [{ startDate, endDate }];
             const timeScale = buildTimeScale(tasks);

             expect(timeScale).not.toBeNull();
             if (!timeScale) return;

             // Start logic:
             // 1 month before March 15, 2026 -> February 15, 2026 (Sunday)
             // Snap to preceding Monday -> February 9, 2026
             const expectedStart = Date.UTC(2026, 1, 9);
             expect(timeScale.startMs).toBe(expectedStart);

             // End logic:
             // 4 months from start (Feb 9, 2026) -> June 9, 2026
             // End date is March 16. Max is June 9, 2026.
             // Snap to next Sunday -> June 14, 2026
             const expectedEnd = Date.UTC(2026, 5, 14);
             expect(timeScale.endMs).toBe(expectedEnd);
        });
    });
});
