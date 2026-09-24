import type { ActivityEntry, FormulaConfig, WeeklyLedger } from "./types";
import { computeGrant, formulaForWeek, type WeekInput } from "./formula";
import { addWeeks, dateToWeek, listWeeks } from "./weeks";

export interface WeekTotals extends WeekInput {
  game: number;
}

export function totalsByWeek(
  entries: ActivityEntry[],
): Map<string, WeekTotals> {
  const map = new Map<string, WeekTotals>();
  for (const e of entries) {
    const week = dateToWeek(e.date);
    let t = map.get(week);
    if (!t) {
      t = { reading: 0, exercise: 0, game: 0 };
      map.set(week, t);
    }
    t[e.category] += e.minutes / 60;
  }
  return map;
}

// Ledger rows from the first week with entries through the current week.
// The first week of the span is the bootstrap (grace) week.
export function computeLedgers(
  entries: ActivityEntry[],
  formulas: FormulaConfig[],
  now: string,
): WeeklyLedger[] {
  const totals = totalsByWeek(entries);
  let first = now;
  for (const e of entries) {
    const w = dateToWeek(e.date);
    if (w < first) first = w;
  }
  const input = (w: string): WeekInput =>
    totals.get(w) ?? { reading: 0, exercise: 0 };
  return listWeeks(first, now).map((week) => {
    const formula = formulaForWeek(formulas, week);
    const t = totals.get(week) ?? { reading: 0, exercise: 0, game: 0 };
    const grant = computeGrant(week, formula, input, week === first);
    return {
      week,
      hours: { reading: t.reading, exercise: t.exercise, game: t.game },
      grant,
      consumed: t.game,
      balance: grant === null ? null : grant - t.game,
      formulaVersion: formula.version,
      bootstrap: week === first,
    };
  });
}

// "Next week vesting ≈": the current formula applied to the window of the
// last N−1 completed weeks plus the current week-so-far as the Nth.
export function projectNextWeek(
  entries: ActivityEntry[],
  formulas: FormulaConfig[],
  now: string,
): number | null {
  const totals = totalsByWeek(entries);
  const formula = formulaForWeek(formulas, addWeeks(now, 1));
  const input = (w: string): WeekInput =>
    totals.get(w) ?? { reading: 0, exercise: 0 };
  return computeGrant(addWeeks(now, 1), formula, input, false);
}
