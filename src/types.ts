export type Category = "reading" | "exercise" | "game";
export const CATEGORIES: readonly Category[] = ["reading", "exercise", "game"];

export interface ActivityEntry {
  id: string; // ulid
  date: string; // YYYY-MM-DD, local calendar date the activity happened
  category: Category;
  minutes: number; // negative only on correction entries
  note?: string;
  loggedAt: string; // ISO timestamp of when it was recorded
  corrects?: string; // id of the entry this compensates
}

export type WindowFn = "mean" | "max" | "min";

export interface FormulaConfig {
  version: number;
  weights: { reading: number; exercise: number };
  window: { weeks: number; fn: WindowFn };
  ceilingHours: number | null; // null = uncapped
  floorHours: number;
  effectiveFrom: string; // ISO week, e.g. "2026-W44"
}

// Derived view, never stored — see docs/prd.md §4.
export interface WeeklyLedger {
  week: string; // "2026-W44"
  hours: Record<Category, number>;
  grant: number | null; // null = uncapped
  consumed: number; // game hours logged
  balance: number | null; // grant - consumed (negative = debt; null when uncapped)
  formulaVersion: number;
  bootstrap: boolean; // grace week
}

export interface ActiveTimer {
  category: Category;
  startedAt: string; // ISO timestamp
}
