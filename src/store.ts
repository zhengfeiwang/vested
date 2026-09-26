import { bulkPut, clear, del, getAll, put } from "./db";
import { DEFAULT_FORMULA, validateFormula } from "./formula";
import { currentWeek, isValidDate, todayLocalDate } from "./weeks";
import { ulid } from "./ulid";
import type {
  ActivityEntry,
  ActiveTimer,
  Category,
  FormulaConfig,
} from "./types";

interface MetaRecord {
  key: string;
  value: string;
}

export interface State {
  ready: boolean;
  entries: ActivityEntry[];
  formulas: FormulaConfig[]; // ascending by version
  timer: ActiveTimer | null;
  lastExportAt: string | null;
}

export const state: State = {
  ready: false,
  entries: [],
  formulas: [],
  timer: null,
  lastExportAt: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(): void {
  for (const fn of listeners) fn();
}

function sortEntries(): void {
  state.entries.sort((a, b) =>
    a.date === b.date
      ? a.loggedAt === b.loggedAt
        ? a.id.localeCompare(b.id)
        : a.loggedAt.localeCompare(b.loggedAt)
      : a.date.localeCompare(b.date),
  );
}

async function getMeta(key: string): Promise<string | null> {
  const rows = await getAll<MetaRecord>("meta");
  return rows.find((r) => r.key === key)?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  await put("meta", { key, value } satisfies MetaRecord);
}

export async function initStore(): Promise<void> {
  const [entries, formulas, timerRaw, lastExportAt] = await Promise.all([
    getAll<ActivityEntry>("entries"),
    getAll<FormulaConfig>("formulas"),
    getMeta("timer"),
    getMeta("lastExportAt"),
  ]);
  state.entries = entries;
  state.formulas = formulas.sort((a, b) => a.version - b.version);
  state.timer = timerRaw ? (JSON.parse(timerRaw) as ActiveTimer) : null;
  state.lastExportAt = lastExportAt;
  if (state.formulas.length === 0) {
    const v1: FormulaConfig = {
      ...structuredClone(DEFAULT_FORMULA),
      version: 1,
      effectiveFrom: currentWeek(),
    };
    await put("formulas", v1);
    state.formulas = [v1];
  }
  sortEntries();
  state.ready = true;
  emit();
}

export function currentFormula(): FormulaConfig {
  return state.formulas[state.formulas.length - 1]!;
}

export interface EntryInput {
  date: string;
  category: Category;
  minutes: number;
  note?: string;
}

export function validateEntryInput(input: EntryInput): string | null {
  if (!isValidDate(input.date)) return "invalid date";
  if (input.date > todayLocalDate()) return "future dates can't be logged";
  if (!Number.isFinite(input.minutes) || input.minutes <= 0)
    return "minutes must be positive";
  if (input.minutes > 24 * 60) return "minutes exceed a day";
  return null;
}

export async function addEntry(input: EntryInput): Promise<ActivityEntry> {
  const entry: ActivityEntry = {
    id: ulid(),
    date: input.date,
    category: input.category,
    minutes: input.minutes,
    loggedAt: new Date().toISOString(),
  };
  if (input.note?.trim()) entry.note = input.note.trim();
  await put("entries", entry);
  state.entries.push(entry);
  sortEntries();
  emit();
  return entry;
}

// Corrections are append-only: a compensating negative entry that links back
// to the original (docs/prd.md §3, §9).
export async function addCorrection(
  original: ActivityEntry,
): Promise<ActivityEntry> {
  const entry: ActivityEntry = {
    id: ulid(),
    date: original.date,
    category: original.category,
    minutes: -original.minutes,
    loggedAt: new Date().toISOString(),
    corrects: original.id,
  };
  await put("entries", entry);
  state.entries.push(entry);
  sortEntries();
  emit();
  return entry;
}

export async function saveFormula(
  input: Omit<FormulaConfig, "version">,
): Promise<{ formula?: FormulaConfig; errors: string[] }> {
  const formula: FormulaConfig = {
    ...input,
    version: currentFormula().version + 1,
  };
  const errors = validateFormula(formula);
  if (errors.length > 0) return { errors };
  await put("formulas", formula);
  state.formulas.push(formula);
  emit();
  return { formula, errors: [] };
}

export async function startTimer(category: Category): Promise<void> {
  state.timer = { category, startedAt: new Date().toISOString() };
  await setMeta("timer", JSON.stringify(state.timer));
  emit();
}

// Stop-and-prefill: the timer clears and the caller opens the log sheet with
// the elapsed minutes, editable before saving.
export async function stopTimer(): Promise<ActiveTimer | null> {
  const timer = state.timer;
  if (timer) {
    state.timer = null;
    await del("meta", "timer");
    emit();
  }
  return timer;
}

export async function discardTimer(): Promise<void> {
  state.timer = null;
  await del("meta", "timer");
  emit();
}

// Import is a validated full replace of the matching dataset.
export async function replaceEntries(entries: ActivityEntry[]): Promise<void> {
  await clear("entries");
  await bulkPut("entries", entries);
  state.entries = [...entries];
  sortEntries();
  emit();
}

export async function replaceFormulas(
  formulas: FormulaConfig[],
): Promise<void> {
  await clear("formulas");
  await bulkPut("formulas", formulas);
  state.formulas = [...formulas].sort((a, b) => a.version - b.version);
  emit();
}

// Merge is union by id / version: incoming records already present are
// skipped, existing data is never touched (docs/prd.md §9 v0.3).
export async function mergeEntries(
  entries: ActivityEntry[],
): Promise<{ added: number; skipped: number }> {
  const existing = new Set(state.entries.map((e) => e.id));
  const fresh = entries.filter((e) => !existing.has(e.id));
  if (fresh.length > 0) {
    await bulkPut("entries", fresh);
    state.entries.push(...fresh);
    sortEntries();
    emit();
  }
  return { added: fresh.length, skipped: entries.length - fresh.length };
}

export async function mergeFormulas(
  formulas: FormulaConfig[],
): Promise<{ added: number; skipped: number }> {
  const existing = new Set(state.formulas.map((f) => f.version));
  const fresh = formulas.filter((f) => !existing.has(f.version));
  if (fresh.length > 0) {
    await bulkPut("formulas", fresh);
    state.formulas.push(...fresh);
    state.formulas.sort((a, b) => a.version - b.version);
    emit();
  }
  return { added: fresh.length, skipped: formulas.length - fresh.length };
}

export async function markExported(): Promise<void> {
  state.lastExportAt = new Date().toISOString();
  await setMeta("lastExportAt", state.lastExportAt);
  emit();
}
