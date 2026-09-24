// ISO 8601 week utilities. Weeks start Monday; week 1 contains the year's
// first Thursday. All arithmetic is done on calendar dates in UTC so results
// never depend on the local timezone.

const DAY_MS = 86_400_000;

function toDateString(y: number, m: number, d: number): string {
  const p = (n: number, w: number) => n.toString().padStart(w, "0");
  return `${p(y, 4)}-${p(m, 2)}-${p(d, 2)}`;
}

export function todayLocalDate(): string {
  const d = new Date();
  return toDateString(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function isValidDate(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  );
}

function utcDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function formatWeek(year: number, week: number): string {
  return `${year.toString().padStart(4, "0")}-W${week.toString().padStart(2, "0")}`;
}

function week1Monday(weekYear: number): Date {
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - day);
  return monday;
}

export function dateToWeek(date: string): string {
  const dt = utcDate(date);
  const day = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - day + 3); // Thursday of this week
  const weekYear = dt.getUTCFullYear();
  const week =
    1 + Math.round((dt.getTime() - week1Monday(weekYear).getTime()) / (7 * DAY_MS));
  return formatWeek(weekYear, week);
}

export function isValidWeek(week: string): boolean {
  if (!/^\d{4}-W\d{2}$/.test(week)) return false;
  const wn = Number(week.slice(6));
  if (wn < 1 || wn > 53) return false;
  return dateToWeek(weekToMonday(week)) === week; // rejects W53 in 52-week years
}

export function weekToMonday(week: string): string {
  const year = Number(week.slice(0, 4));
  const wn = Number(week.slice(6));
  const monday = week1Monday(year);
  monday.setUTCDate(monday.getUTCDate() + (wn - 1) * 7);
  return toDateString(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
  );
}

export function weekDates(week: string): string[] {
  const dt = utcDate(weekToMonday(week));
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    out.push(
      toDateString(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
    );
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return out;
}

export function addWeeks(week: string, n: number): string {
  const dt = utcDate(weekToMonday(week));
  dt.setUTCDate(dt.getUTCDate() + n * 7);
  return dateToWeek(
    toDateString(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()),
  );
}

export function currentWeek(): string {
  return dateToWeek(todayLocalDate());
}

// Inclusive ascending list, from <= to. String compare is valid for
// zero-padded ISO week strings.
export function listWeeks(from: string, to: string): string[] {
  const out: string[] = [];
  for (let w = from; w <= to && out.length < 520; w = addWeeks(w, 1)) out.push(w);
  return out;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function weekdayOf(date: string): string {
  return WEEKDAYS[(utcDate(date).getUTCDay() + 6) % 7]!;
}
