/**
 * TimeScaleService — Centralized date-to-pixel coordinate engine.
 *
 * Core formula (ISO-compliant, DST-safe):
 *   X_px = (T_target - T_start) / T_total  × totalPx
 *
 * No index × cellWidth. No premature rounding. No locale-derived week start.
 */

const COL_PX = 72;         // visual width in px of one 7-day span (pure display constant)
const MS_DAY = 86_400_000;
const MS_WEEK = 7 * MS_DAY;

// Short month names in Spanish — avoids locale API inconsistencies across browsers
const MONTH_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export interface WeekTick {
    /** Unix epoch ms of the Monday that starts this tick */
    ms: number;
    label: string; // e.g. "28 abr"
    year: string; // e.g. "2026"
}

export interface TimeScale {
    startMs: number;
    endMs: number;
    totalMs: number;
    totalPx: number;
    weekTicks: WeekTick[];
    /**
     * Convert any UTC-day epoch ms → px offset from the left edge.
     * Formula: X = (ms - startMs) / totalMs × totalPx
     */
    toPx: (ms: number) => number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strip the time component using LOCAL date parts, then store in UTC epoch ms.
 * This avoids DST-related shifts that occur when dividing raw getTime() values.
 * Works even if the input is an ISO string (from JSON/IndexedDB serialisation).
 */
export function toUtcDay(d: Date | string | number): number {
    const date = d instanceof Date ? d : new Date(d as string | number);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * ISO 8601 week number — always Monday-based, correct across year boundaries.
 * Does NOT rely on locale or date-fns, computed entirely in UTC.
 */
export function getISOWeek(d: Date | string | number): number {
    const ms = typeof d === 'number' ? d : toUtcDay(d);
    const date = new Date(ms);
    // Move to Thursday of current ISO week, which determines the ISO year
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
    return Math.ceil(((date.getTime() - yearStart) / MS_DAY + 1) / 7);
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function buildTimeScale(
    tasks: Array<{ startDate: Date | string; endDate: Date | string }>
): TimeScale | null {
    if (tasks.length === 0) return null;

    const startDays = tasks.map(t => toUtcDay(t.startDate as Date));
    const endDays = tasks.map(t => toUtcDay(t.endDate as Date));

    const rawStartMs = Math.min(...startDays);
    const rawEndMs = Math.max(...endDays);

    // ── Expand start: 1 month back, snapped to the preceding Monday ──────────
    const s = new Date(rawStartMs);
    s.setUTCMonth(s.getUTCMonth() - 1);
    const dow = s.getUTCDay() || 7;          // 1=Mon..7=Sun
    s.setUTCDate(s.getUTCDate() - (dow - 1));
    const startMs = s.getTime();

    // ── Expand end: at least 4 months from start, covers rawEndMs, snapped to Sunday ──
    const minEnd = new Date(startMs);
    minEnd.setUTCMonth(minEnd.getUTCMonth() + 4);
    const e = new Date(Math.max(rawEndMs, minEnd.getTime()));
    const edow = e.getUTCDay() || 7;
    e.setUTCDate(e.getUTCDate() + (7 - edow));
    const endMs = e.getTime();

    const totalMs = endMs - startMs;

    // ── Generate one tick per Monday using pure ms arithmetic ────────────────
    const weekTicks: WeekTick[] = [];
    let cursor = startMs;
    while (cursor < endMs) {
        const d = new Date(cursor);
        weekTicks.push({
            ms: cursor,
            label: `${String(d.getUTCDate()).padStart(2, '0')} ${MONTH_ES[d.getUTCMonth()]}`,
            year: String(d.getUTCFullYear()),
        });
        cursor += MS_WEEK;
    }

    const totalPx = weekTicks.length * COL_PX;

    // Core formula — no index multiplication, no premature rounding
    const toPx = (ms: number): number => ((ms - startMs) / totalMs) * totalPx;

    return { startMs, endMs, totalMs, totalPx, weekTicks, toPx };
}
