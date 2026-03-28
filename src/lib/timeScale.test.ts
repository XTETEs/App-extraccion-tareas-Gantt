import { describe, it, expect } from 'vitest';
import { toUtcDay } from './timeScale';

describe('toUtcDay', () => {
    it('should convert a Date object to a UTC midnight timestamp', () => {
        // Create a local date: 2026-04-15 14:30:00 local time
        const localDate = new Date(2026, 3, 15, 14, 30, 0);
        const expectedUtcMs = Date.UTC(2026, 3, 15);
        expect(toUtcDay(localDate)).toBe(expectedUtcMs);
    });

    it('should convert a string to a UTC midnight timestamp', () => {
        // "2026-04-15" string (parsed as UTC by default if ISO, but here let's ensure it maps to the right day)
        const dateString = "2026-04-15T14:30:00.000Z";
        const dateObj = new Date(dateString);
        const expectedUtcMs = Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
        expect(toUtcDay(dateString)).toBe(expectedUtcMs);
    });

    it('should convert a number to a UTC midnight timestamp', () => {
        // Unix timestamp for 2026-04-15 14:30:00 UTC
        const timestamp = new Date(Date.UTC(2026, 3, 15, 14, 30, 0)).getTime();
        const dateObj = new Date(timestamp);
        const expectedUtcMs = Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
        expect(toUtcDay(timestamp)).toBe(expectedUtcMs);
    });

    it('should handle dates exactly at local midnight', () => {
        const localDate = new Date(2026, 0, 1, 0, 0, 0); // Jan 1st
        const expectedUtcMs = Date.UTC(2026, 0, 1);
        expect(toUtcDay(localDate)).toBe(expectedUtcMs);
    });

    it('should handle dates right before local midnight', () => {
        const localDate = new Date(2026, 0, 1, 23, 59, 59, 999);
        const expectedUtcMs = Date.UTC(2026, 0, 1);
        expect(toUtcDay(localDate)).toBe(expectedUtcMs);
    });
});
