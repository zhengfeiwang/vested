import { weekdayOf, weekDates } from "./weeks";

function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r; // avoid "-0"
}

export function fmtHours(hours: number | null): string {
  if (hours === null) return "∞";
  return `${round1(hours)}h`;
}

export function fmtSignedHours(hours: number | null): string {
  if (hours === null) return "∞";
  const r = round1(hours);
  if (r > 0) return `+${r}h`;
  if (r < 0) return `−${Math.abs(r)}h`;
  return "0h";
}

export function fmtMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const text = abs >= 90 ? fmtHours(abs / 60) : `${Math.round(abs)}m`;
  return minutes < 0 ? `−${text}` : text;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

// "2026-09-24" → "Thu 24 Sep"
export function fmtDate(date: string): string {
  return `${weekdayOf(date)} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

// "2026-W44" → "W44"
export function fmtWeekLabel(week: string): string {
  return week.slice(5);
}

// "2026-W44" → "26 Oct – 1 Nov"
export function fmtWeekRange(week: string): string {
  const dates = weekDates(week);
  const short = (d: string) =>
    `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
  return `${short(dates[0]!)} – ${short(dates[6]!)}`;
}

export function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}
