# Vested — Product Requirements Document

> You don't get game time. You vest it.

- **Status**: Draft v0.2 (keystone decisions recorded; implementation started)
- **Author**: with Kimi
- **Date**: 2026-09-24

---

## 1. Context & Problem

One-year gap from work (left 9/7, returning 7/31 next year). After a two-month trip, personal priorities at home are: **reading, exercise, game** — in that order of aspiration, if not always of temptation.

The risk of a gap year isn't too much gaming; it's the absence of structure. Vested creates one lightweight feedback loop: **next week's gaming budget is earned by this week's reading and exercise.**

## 2. Goals / Non-Goals

### v1 Goals
- Log hours in three categories: `reading`, `exercise`, `game` — in **two taps** from the main screen.
- Compute a weekly **grant** (game budget) from a **user-definable formula** (formula-as-data, versioned).
- Show current-week status at a glance: banked hours, grant, remaining game budget.
- Weekly ledger plus **historical reports**: range-based totals, averages, adherence, trends.
- Append-only, human-readable storage (git-friendly export).
- Installable PWA: one tap from the phone home screen, fully offline.

### v1 Non-Goals (declared, not implied)
- **No backend.** Single-page PWA; data lives in the browser (IndexedDB). Stated plainly: **data is local to that browser on that device** — phone and laptop will NOT share state in v1. The backup/sync story is manual JSONL export → git. Multi-device sync is a v2 decision.
- No accounts, no cloud, no server of any kind.
- No notifications or reminders.
- **No enforcement.** Overdrawing the budget is recorded and flagged as debt, never blocked. The tool informs; you decide.
- No streaks, badges, or gamification beyond the vesting rule itself.
- No additional categories (coding, alumni time, etc.) — adding categories is a v2 decision informed by data.

## 3. The Rule (core mechanic)

Let `R(w)`, `E(w)` = hours of reading and exercise in week `w` (ISO week, Monday start).

The grant is computed over a **sliding window of the N most recent completed weeks** — as each week closes, the window slides forward and the oldest week drops out:

```
window(w) = the N weeks ending at w        (N = window.weeks, default 1)
grant(w+1) = clamp( floor, ceiling,
                    aggregate over window(w) of
                    ( weight_reading × R + weight_exercise × E ) )
```

With `N=1` this is exactly the original rule ("next week ≤ last week"); `N=2–3` smooths one-off travel/sick weeks without changing the mechanic. The window always slides — there is no "reset epoch".

### Default parameters

| Parameter | Default | Rationale |
|---|---|---|
| `weights.reading` | 1.0 | Reading hours convert 1:1 |
| `weights.exercise` | 2.0 | Exercise is harder to motivate; a run is "worth" more than couch reading |
| `ceilingHours` | 10 | The cap exists to protect you, not to be earned away |
| `window.weeks` | 1 | True to the original idea; raise to 2–3 after real data shows weekly variance |
| `weekStart` | Monday | ISO week |

### The formula is data, not code

The grant formula is a **structured, versioned config object** — never hardcoded. Editing it bumps `formula.version` and records `effectiveFrom`; the full history is kept, so any past week can be recomputed under the formula that was active at the time (and reports can show "what if" under the current formula).

```ts
interface FormulaConfig {
  version: number;
  weights: Record<"reading" | "exercise", number>;  // { reading: 1, exercise: 2 } — game is the output, not an input
  window: {
    weeks: number;                    // sliding-window size N over past weeks, default 1
    fn: "mean" | "max" | "min";       // aggregation across the sliding window, default "mean"
  };
  ceilingHours: number | null;        // hard cap, default 10; null = uncapped
  floorHours: number;                 // minimum grant even after a zero week, default 0
  effectiveFrom: string;              // ISO week, e.g. "2026-W44"
}
```

The config renders to a human-readable expression for display in Settings, e.g.:

```
grant = min(10, mean over 1w of (1.0×reading + 2.0×exercise))
```

**v1 editing is structured** (sliders/pickers for weights, window, aggregation, ceiling) — not free-text expressions. A free-form expression DSL (e.g. `max(E*2, R)`) is a possible phase-3 escape hatch; see Open Questions.

This composes the earlier decisions: a zero week still grants `floorHours`; `window.weeks = 2–3` implements the rolling-average smoothing; `ceilingHours = null` removes the cap for a "trust week" experiment.

### Edge cases (decided now, not at implementation time)

- **Bootstrap week**: with no prior data, week 1's grant = `ceilingHours` (uncapped if `ceilingHours = null`, displayed as ∞). Flagged as a grace week in the ledger.
- **Undersized window / empty weeks**: weeks before the first data, and weeks with no entries, count as 0 in the window. This only depresses grants when `window.weeks > 1` from day one; with the default N=1 raised later (once real history exists), the window is always full of real weeks.
- **Partial weeks** (travel, sick): count as-is. When `window.weeks > 1`, the rolling average smooths them.
- **Overdraw**: `balance` goes negative, displayed as debt. Not blocked, not carried as a hard penalty — visible in the ledger, that's all. (Revisit with data.)
- **Rollover**: v1 has none. Unspent grant is use-it-or-lose-it. Declared limitation; the ledger keeps the data to revisit this later.
- **Retroactive logging**: allowed freely into any past date (trip days will need it); future dates are rejected. Entries carry `loggedAt` separate from `date`.

### Category definitions (what counts)

Ambiguity here would rot the data, so define it upfront:

- **reading**: books, long-form essays/papers. Audiobooks count. News feeds, docs-for-work, and Reddit do not.
- **exercise**: deliberate sessions — running, gym, swimming, sports. Incidental walking does not count; a deliberate 45-min walk does.
- **game**: playing games. Watching streams/film does not count (it's untracked leisure, not budgeted).

## 4. Keystone: Data Model

Event-sourced and append-only. **Entries are truth; the ledger is a derived view**, recomputed on read. If the rule parameters change, history recomputes cleanly.

```ts
type Category = "reading" | "exercise" | "game";

interface ActivityEntry {
  id: string;          // ulid
  date: string;        // ISO date the activity happened
  category: Category;
  minutes: number;
  note?: string;
  loggedAt: string;    // ISO timestamp of when it was recorded
  corrects?: string;   // id of the entry this compensates (negative-minutes correction)
}

// see §3 "The formula is data, not code" — full history retained
// entries.jsonl + formulas.jsonl are the only source of truth

// Derived — never stored as truth
interface WeeklyLedger {
  week: string;                       // "2026-W44"
  hours: Record<Category, number>;
  grant: number | null;               // vested budget for this week (null = uncapped)
  consumed: number;                   // game hours logged
  balance: number | null;             // grant - consumed (negative = debt; null when uncapped)
  formulaVersion: number;             // formula this was computed under
}
```

Storage: one JSONL file (`entries.jsonl`) + one formula-history file (`formulas.jsonl`, one version per line). Diffable, greppable, recoverable by hand if the tool dies. Each export file starts with a header line (`{"kind":"entries","schemaVersion":1}` / `{"kind":"formulas","schemaVersion":1}`) and is deterministically ordered (entries by `date`, `loggedAt`, `id`; formulas by `version`), so re-exports produce minimal git diffs.

## 5. Interface (Web PWA)

**Design principle: logging friction kills trackers.** Every design decision below optimizes for capture speed. Two taps to log, one glance to know where you stand. Mobile-first: the phone is the daily driver; the laptop is just the git-export terminal. Hours are displayed rounded to one decimal.

### Screen 1 — This Week (main screen, the default)

The only screen that matters day-to-day:

```
┌─────────────────────────────────────┐
│  W39        GAME BUDGET: 5.5h left  │
│             (grant 8.5h, used 3.0h) │
│                                     │
│  banked: reading 4.5h  exercise 2h  │
│  → next week vesting ≈ 8.5h         │
│                                     │
│  [ + Reading ] [ + Exercise ]       │
│  [ + Game          ]                │
└─────────────────────────────────────┘
```

- Three large tap targets. Tap a category → duration chips (15 / 30 / 45 / 60 / 90 min + custom) → done. Optional note field, collapsed by default.
- **Optional timer mode** per category ("start reading" → stop later) for exact capture instead of estimation. Chips are the default; timer is one toggle away. The active timer's start timestamp is persisted (survives app kill/restart); on stop, the elapsed duration is shown editable before saving.
- The **game budget remaining** is the hero number — it's the answer to "can I play tonight?" Negative balance renders as a visible debt badge, never a block. With `ceilingHours = null` the hero shows "no cap".
- The "next week vesting ≈" projection uses the current formula over the last N−1 completed weeks plus the current week-so-far as the Nth.
- Logging against a past date (trip retro-logging) via a date picker in the log sheet. `loggedAt` vs `date` distinction preserved.
- Corrections: tap-and-hold an entry → append compensating negative entry carrying `corrects: <id>` (append-only discipline holds in UI too).

### Screen 2 — Ledger & Reports

Two tabs over the same derived data:

**Ledger** — weekly rows: R / E / game hours, grant, balance, formula version. Tap a week to drill into its daily entries.

**Report** — historical analysis over a selectable range (last 4 / 8 / 12 weeks, all time):

- Totals and weekly averages per category.
- **Adherence**: `consumed / grant` ratio per week — persistently ≪1 means the ceiling isn't binding; persistent debt means the formula is miscalibrated, not that you failed. Weeks with `grant = 0` show "—" and are counted separately; uncapped weeks are excluded from the ratio.
- Trend chart of `reading + exercise` hours per week (the gap-year legibility view), with an optional **sliding-window overlay** — the same N-week rolling aggregation as the formula uses, so you can see the trend the way the grant "sees" it.
- Grant-vs-consumed bar chart per week.
- **Formula comparison toggle**: recompute the range under the current formula vs. the historical ones — answers "would the new weights have changed anything?" before you commit to them.
- Export report as CSV/JSON.

### Screen 3 — Settings

- **Formula editor** (structured, per §3): weights, window size + aggregation fn, ceiling, floor. Editing bumps `formula.version` and records `effectiveFrom` — historical weeks keep their original formula; the change applies from the chosen week onward. `effectiveFrom` is constrained to the current week or later (a mid-week edit immediately recomputes the current grant); looking backward is what the report's comparison toggle is for. Validation: weights ≥ 0; `window.weeks` integer 1–12; `floorHours ≥ 0`; `floorHours ≤ ceilingHours` when a ceiling is set.
- Formula history list (view past versions, diff against current).
- Export / import of `entries.jsonl` + `formulas.jsonl` (backup to git). Import is **full replace** of the matching dataset: every line is validated first, incoming vs. current stats are shown, and explicit confirmation is required. `lastExportAt` is recorded at each export; the main screen shows a subtle "last export: N days ago" line once it exceeds 7 days.

### Tech shape

TypeScript single-page app, no build-time backend. IndexedDB for entries + config, service worker for offline, PWA manifest for home-screen install. Same event-sourced model as §4 — the browser is just the store.

Deployed as a static site on **GitHub Pages** (served from the project subpath, so the app `base` is set accordingly; Azure Static Web Apps is the fallback). Service-worker updates precache a fresh app shell and prompt "update available — reload"; an update must **never clear IndexedDB**. Local SQLite (sql.js/wa-sqlite over OPFS) was considered and rejected: OPFS shares IndexedDB's per-origin eviction domain, so it buys no durability, and a binary DB breaks the human-readable keystone.

## 6. Rollout Plan

| Phase | When | What |
|---|---|---|
| **1 — keystone** | week 1 home | PWA shell + IndexedDB store + main screen (tap-to-log + status). Retro-logging supported from day one via the date picker. |
| **2 — ledger & reports** | weeks 2–3 | Ledger screen, report view (totals/adherence/trends), formula editor with versioning, debt badge, JSONL export, basic timer mode. Dogfood 4 weeks before any new feature. |
| **3 — maybe** | later | Timer-mode polish, richer charts, multi-device sync (a real backend — separate PRD), open-source polish. Each is a separate decision, not a roadmap commitment. |

## 7. Success Metrics

- **Still using it at week 8.** The only metric that really matters for v1.
- ≥5 logged days per week after the first month.
- Trend: `reading + exercise` hours per week vs. the first weeks' baseline.
- Ratio: `consumed / grant` over time. Persistently ≪1 means the ceiling isn't binding; persistently negative balance means the rule is miscalibrated, not that you failed.

## 8. Open Questions

1. **Rollover**: should unspent grant partially carry (e.g., 50%, capped)? Defer to phase 2 data.
2. **Trip timezones**: entries use local dates; crossing zones mid-trip may split a day oddly. Accept and move on, or normalize to home timezone?
3. ~~**Corrections**~~ — **decided (v0.2)**: append-only compensating negative entry carrying `corrects: <id>`. No edit-with-tombstone.
4. **Weight tuning cadence**: fix parameters per month (stable expectations) vs. tune anytime (faster convergence)? Leaning monthly.
5. **Expression DSL**: is the structured formula editor enough, or do you want free-form expressions (`max(E*2, R)`, diminishing returns like `sqrt(E)`)? Structured covers the plausible formula space with zero parsing risk; a DSL is strictly more powerful but invites cleverness the data hasn't asked for. Leaning structured-only for v1, DSL only if a real formula idea doesn't fit.
6. **Report ranges**: are 4/8/12 weeks + all-time enough, or do you want arbitrary date ranges? Arbitrary ranges make week-boundary math messier (partial weeks at both ends). v1 ships 4/8/12 + all-time ("month" dropped as redundant with 4 weeks).

## 9. Decisions Log

### v0.2 — 2026-09-24 (keystone review rulings)

- **Window zero-fill**: missing and empty weeks count as 0 in the sliding window (§3). Safe because the default N=1 is only raised after real history exists.
- **Bootstrap with `ceilingHours = null`**: week 1 is uncapped, hero shows "no cap" / ∞.
- **Projection**: "next week vesting ≈" = current formula over the last N−1 completed weeks + current week-so-far.
- **Adherence with `grant = 0`**: display "—", counted separately; uncapped weeks excluded from the ratio.
- **`effectiveFrom`**: constrained to current or future weeks; mid-week edits recompute the current grant immediately.
- **Validation**: weights ≥ 0; `window.weeks` integer 1–12; `floorHours ≥ 0`; `floor ≤ ceiling` when ceiling set; `floor` still applies when `ceiling = null` (grant = `max(floor, x)`).
- **Corrections**: append-only negative entry with `corrects: <id>`; export files carry `schemaVersion`.
- **Export/import**: `entries.jsonl` + `formulas.jsonl`, header line, deterministic ordering; import = validated full replace with confirmation; `lastExportAt` drives a "last export: N days ago" indicator after 7 days.
- **Storage**: IndexedDB. Local SQLite rejected — same per-origin eviction domain, binary breaks the human-readable keystone.
- **Timer**: ships in phase 2; start timestamp persisted; elapsed duration editable on stop.
- **Retro-logging**: unlimited past; future dates rejected.
- **Primary device**: phone, mobile-first; hours rounded to one decimal.
- **Reports**: 4 / 8 / 12 weeks + all-time ("month" dropped).
- **Deployment**: GitHub Pages with project-subpath `base`; SW updates never clear IndexedDB; Azure Static Web Apps as fallback.
