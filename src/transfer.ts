import { CATEGORIES } from "./types";
import type { ActivityEntry, Category, FormulaConfig } from "./types";
import { validateFormula } from "./formula";
import { isValidDate, isValidWeek, todayLocalDate } from "./weeks";

export const SCHEMA_VERSION = 1;

function byLine(a: ActivityEntry, b: ActivityEntry): number {
  return a.date === b.date
    ? a.loggedAt === b.loggedAt
      ? a.id.localeCompare(b.id)
      : a.loggedAt.localeCompare(b.loggedAt)
    : a.date.localeCompare(b.date);
}

export function serializeEntries(entries: ActivityEntry[]): string {
  const lines = [
    JSON.stringify({ kind: "entries", schemaVersion: SCHEMA_VERSION }),
    ...[...entries].sort(byLine).map((e) => JSON.stringify(e)),
  ];
  return lines.join("\n") + "\n";
}

export function serializeFormulas(formulas: FormulaConfig[]): string {
  const lines = [
    JSON.stringify({ kind: "formulas", schemaVersion: SCHEMA_VERSION }),
    ...[...formulas]
      .sort((a, b) => a.version - b.version)
      .map((f) => JSON.stringify(f)),
  ];
  return lines.join("\n") + "\n";
}

export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ImportData =
  | { kind: "entries"; entries: ActivityEntry[] }
  | { kind: "formulas"; formulas: FormulaConfig[] };

export function parseImport(text: string): {
  data?: ImportData;
  errors: string[];
} {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { errors: ["file is empty"] };

  let kind: "entries" | "formulas" | null = null;
  const records: { rec: Record<string, unknown>; line: number }[] = [];
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]!);
    } catch {
      errors.push(`line ${i + 1}: not valid JSON`);
      continue;
    }
    const rec = parsed as Record<string, unknown>;
    if (i === 0 && (rec.kind === "entries" || rec.kind === "formulas")) {
      if (typeof rec.schemaVersion !== "number" || rec.schemaVersion > SCHEMA_VERSION) {
        return {
          errors: [
            `file schema version ${String(rec.schemaVersion)} is newer than this app supports (${SCHEMA_VERSION})`,
          ],
        };
      }
      kind = rec.kind;
      continue;
    }
    records.push({ rec, line: i + 1 });
  }
  if (errors.length > 0) return { errors };
  if (records.length === 0) return { errors: ["no data lines"] };

  if (!kind) {
    const first = records[0]!.rec;
    if (typeof first.minutes === "number") kind = "entries";
    else if (first.weights && typeof first.weights === "object")
      kind = "formulas";
    else
      return {
        errors: ["cannot tell whether this file holds entries or formulas"],
      };
  }
  return kind === "entries"
    ? validateEntryRecords(records)
    : validateFormulaRecords(records);
}

function validateEntryRecords(
  records: { rec: Record<string, unknown>; line: number }[],
): { data?: ImportData; errors: string[] } {
  const errors: string[] = [];
  const entries: ActivityEntry[] = [];
  const seen = new Set<string>();
  const today = todayLocalDate();
  for (const { rec, line } of records) {
    const bad = (msg: string) => errors.push(`line ${line}: ${msg}`);
    if (typeof rec.id !== "string" || rec.id.length === 0) {
      bad("id must be a non-empty string");
      continue;
    }
    if (seen.has(rec.id)) {
      bad(`duplicate id ${rec.id}`);
      continue;
    }
    if (typeof rec.date !== "string" || !isValidDate(rec.date)) {
      bad("date must be YYYY-MM-DD");
      continue;
    }
    if (rec.date > today) {
      bad(`future date ${rec.date}`);
      continue;
    }
    if (!CATEGORIES.includes(rec.category as Category)) {
      bad(`unknown category ${String(rec.category)}`);
      continue;
    }
    if (typeof rec.minutes !== "number" || !Number.isFinite(rec.minutes)) {
      bad("minutes must be a number");
      continue;
    }
    if (typeof rec.loggedAt !== "string" || Number.isNaN(Date.parse(rec.loggedAt))) {
      bad("loggedAt must be an ISO timestamp");
      continue;
    }
    if (rec.note !== undefined && typeof rec.note !== "string") {
      bad("note must be a string");
      continue;
    }
    if (rec.corrects !== undefined && typeof rec.corrects !== "string") {
      bad("corrects must be an entry id string");
      continue;
    }
    seen.add(rec.id);
    const entry: ActivityEntry = {
      id: rec.id,
      date: rec.date,
      category: rec.category as Category,
      minutes: rec.minutes,
      loggedAt: rec.loggedAt,
    };
    if (typeof rec.note === "string") entry.note = rec.note;
    if (typeof rec.corrects === "string") entry.corrects = rec.corrects;
    entries.push(entry);
  }
  if (errors.length > 0) return { errors };
  return { data: { kind: "entries", entries }, errors: [] };
}

function validateFormulaRecords(
  records: { rec: Record<string, unknown>; line: number }[],
): { data?: ImportData; errors: string[] } {
  const errors: string[] = [];
  const formulas: FormulaConfig[] = [];
  const seen = new Set<number>();
  for (const { rec, line } of records) {
    const bad = (msg: string) => errors.push(`line ${line}: ${msg}`);
    const weights = rec.weights as Record<string, unknown> | undefined;
    const window = rec.window as Record<string, unknown> | undefined;
    if (typeof rec.version !== "number" || !Number.isInteger(rec.version) || rec.version < 1) {
      bad("version must be a positive integer");
      continue;
    }
    if (seen.has(rec.version)) {
      bad(`duplicate version ${rec.version}`);
      continue;
    }
    if (!weights || !window) {
      bad("missing weights or window");
      continue;
    }
    const formula: FormulaConfig = {
      version: rec.version,
      weights: {
        reading: weights.reading as number,
        exercise: weights.exercise as number,
      },
      window: { weeks: window.weeks as number, fn: window.fn as FormulaConfig["window"]["fn"] },
      ceilingHours: rec.ceilingHours === null ? null : (rec.ceilingHours as number),
      floorHours: rec.floorHours as number,
      effectiveFrom: rec.effectiveFrom as string,
    };
    if (typeof rec.effectiveFrom !== "string" || !isValidWeek(rec.effectiveFrom)) {
      bad("effectiveFrom must be an ISO week like 2026-W44");
      continue;
    }
    const fieldErrors = validateFormula(formula);
    if (fieldErrors.length > 0) {
      bad(fieldErrors.join("; "));
      continue;
    }
    seen.add(rec.version);
    formulas.push(formula);
  }
  if (errors.length > 0) return { errors };
  if (formulas.length === 0) return { errors: ["no formulas in file"] };
  return { data: { kind: "formulas", formulas }, errors: [] };
}
