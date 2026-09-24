import type { FormulaConfig, WindowFn } from "./types";
import { addWeeks, isValidWeek } from "./weeks";

export const DEFAULT_FORMULA = {
  weights: { reading: 1, exercise: 2 },
  window: { weeks: 1, fn: "mean" as WindowFn },
  ceilingHours: 10,
  floorHours: 0,
};

export interface WeekInput {
  reading: number; // hours
  exercise: number; // hours
}

// The grant a week vests, derived from the window of prior completed weeks.
// Missing and empty weeks count as 0 (docs/prd.md §3). Returns null when the
// formula has no ceiling (uncapped week).
export function computeGrant(
  week: string,
  formula: FormulaConfig,
  weekInput: (w: string) => WeekInput,
  bootstrap: boolean,
): number | null {
  if (bootstrap) return formula.ceilingHours;
  const values: number[] = [];
  for (let i = formula.window.weeks; i >= 1; i--) {
    const input = weekInput(addWeeks(week, -i));
    values.push(
      formula.weights.reading * input.reading +
        formula.weights.exercise * input.exercise,
    );
  }
  let aggregate: number;
  if (formula.window.fn === "max") aggregate = Math.max(...values);
  else if (formula.window.fn === "min") aggregate = Math.min(...values);
  else aggregate = values.reduce((a, b) => a + b, 0) / values.length;
  const floored = Math.max(formula.floorHours, aggregate);
  return formula.ceilingHours === null
    ? floored
    : Math.min(formula.ceilingHours, floored);
}

// The formula in force for a week: the latest version effective on or before
// it; weeks before the first version use the earliest version.
export function formulaForWeek(
  formulas: FormulaConfig[],
  week: string,
): FormulaConfig {
  let best: FormulaConfig | undefined;
  for (const f of formulas) {
    if (f.effectiveFrom <= week && (!best || f.version > best.version)) best = f;
  }
  return (
    best ?? formulas.reduce((a, b) => (a.version < b.version ? a : b))
  );
}

export function validateFormula(f: FormulaConfig): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(f.weights.reading) || f.weights.reading < 0)
    errors.push("reading weight must be ≥ 0");
  if (!Number.isFinite(f.weights.exercise) || f.weights.exercise < 0)
    errors.push("exercise weight must be ≥ 0");
  if (
    !Number.isInteger(f.window.weeks) ||
    f.window.weeks < 1 ||
    f.window.weeks > 12
  )
    errors.push("window must be a whole number of weeks, 1–12");
  if (!["mean", "max", "min"].includes(f.window.fn))
    errors.push("window aggregation must be mean, max or min");
  if (
    f.ceilingHours !== null &&
    (!Number.isFinite(f.ceilingHours) || f.ceilingHours < 0)
  )
    errors.push("ceiling must be ≥ 0 or empty (no cap)");
  if (!Number.isFinite(f.floorHours) || f.floorHours < 0)
    errors.push("floor must be ≥ 0");
  if (f.ceilingHours !== null && f.floorHours > f.ceilingHours)
    errors.push("floor must not exceed the ceiling");
  if (!isValidWeek(f.effectiveFrom))
    errors.push("effective week must look like 2026-W44");
  return errors;
}

// "grant = min(10, mean over 1w of (1.0×reading + 2.0×exercise))"
export function describeFormula(f: FormulaConfig): string {
  const w = `${f.weights.reading.toFixed(1)}×reading + ${f.weights.exercise.toFixed(1)}×exercise`;
  let expr = `${f.window.fn} over ${f.window.weeks}w of (${w})`;
  if (f.floorHours > 0) expr = `max(${trimHours(f.floorHours)}, ${expr})`;
  if (f.ceilingHours !== null) expr = `min(${trimHours(f.ceilingHours)}, ${expr})`;
  return `grant = ${expr}`;
}

function trimHours(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
