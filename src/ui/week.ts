import {
  addCorrection,
  addEntry,
  discardTimer,
  startTimer,
  state,
  stopTimer,
  validateEntryInput,
} from "../store";
import { computeLedgers, projectNextWeek } from "../ledger";
import { currentWeek, todayLocalDate, weekDates } from "../weeks";
import {
  daysSince,
  fmtDate,
  fmtHours,
  fmtMinutes,
  fmtWeekLabel,
  fmtWeekRange,
} from "../format";
import { CATEGORIES } from "../types";
import type { ActivityEntry, Category } from "../types";
import { confirmModal, h, onLongPress, openModal, toast } from "./dom";

const CHIPS = [15, 30, 45, 60, 90] as const;

let tickInterval: number | undefined;

export function renderWeek(root: HTMLElement): void {
  clearInterval(tickInterval);
  const now = currentWeek();
  const ledgers = computeLedgers(state.entries, state.formulas, now);
  const ledger = ledgers[ledgers.length - 1]!;
  const projection = projectNextWeek(state.entries, state.formulas, now);

  const header = h(
    "header",
    { class: "week-header" },
    h(
      "div",
      {},
      h("div", { class: "week-label" }, fmtWeekLabel(now)),
      h("div", { class: "week-range muted" }, fmtWeekRange(now)),
    ),
    exportReminder(),
  );

  root.append(
    header,
    heroCard(ledger.grant, ledger.consumed),
    bankedCard(ledger.hours.reading, ledger.hours.exercise, projection),
    logButtons(),
    timerSection(),
    entriesSection(now),
  );
}

function heroCard(grant: number | null, consumed: number): HTMLElement {
  const sub = h(
    "div",
    { class: "hero-sub muted" },
    grant === null
      ? `uncapped week · used ${fmtHours(consumed)}`
      : `grant ${fmtHours(grant)} · used ${fmtHours(consumed)}`,
  );
  let number: HTMLElement;
  if (grant === null) {
    number = h("div", { class: "hero-number" }, "no cap");
  } else if (grant - consumed < 0) {
    number = h(
      "div",
      { class: "hero-number debt" },
      fmtHours(consumed - grant),
      h("span", { class: "hero-left" }, " debt"),
    );
  } else {
    number = h(
      "div",
      { class: "hero-number" },
      fmtHours(grant - consumed),
      h("span", { class: "hero-left" }, " left"),
    );
  }
  return h(
    "section",
    { class: "card hero" },
    h("div", { class: "hero-title" }, "GAME BUDGET"),
    number,
    sub,
  );
}

function bankedCard(
  reading: number,
  exercise: number,
  projection: number | null,
): HTMLElement {
  return h(
    "section",
    { class: "card" },
    h(
      "div",
      { class: "banked" },
      h("span", { class: "cat-reading" }, `reading ${fmtHours(reading)}`),
      h("span", { class: "muted" }, " · "),
      h("span", { class: "cat-exercise" }, `exercise ${fmtHours(exercise)}`),
    ),
    h(
      "div",
      { class: "projection muted" },
      `→ next week vesting ≈ ${fmtHours(projection)}`,
    ),
  );
}

function logButtons(): HTMLElement {
  const btn = (category: Category, wide: boolean) =>
    h(
      "button",
      {
        class: `log-btn cat-bg-${category}${wide ? " wide" : ""}`,
        onclick: () => openLogSheet(category),
      },
      `+ ${category[0]!.toUpperCase()}${category.slice(1)}`,
    );
  return h(
    "section",
    { class: "log-buttons" },
    btn("reading", false),
    btn("exercise", false),
    btn("game", true),
  );
}

function timerSection(): HTMLElement {
  if (state.timer) {
    const { category, startedAt } = state.timer;
    const elapsed = h("span", { class: "timer-elapsed" }, elapsedText(startedAt));
    tickInterval = window.setInterval(() => {
      elapsed.textContent = elapsedText(startedAt);
    }, 10_000);
    return h(
      "section",
      { class: "card timer-running" },
      h("span", {}, h("span", { class: `cat-${category}` }, "●"), ` ${category} `, elapsed),
      h(
        "div",
        { class: "timer-actions" },
        h(
          "button",
          {
            class: "btn btn-primary",
            onclick: () => {
              void stopTimer().then((t) => {
                if (t)
                  openLogSheet(
                    t.category,
                    Math.max(
                      1,
                      Math.round((Date.now() - Date.parse(t.startedAt)) / 60_000),
                    ),
                  );
              });
            },
          },
          "Stop",
        ),
        h(
          "button",
          {
            class: "btn btn-ghost",
            onclick: () =>
              confirmModal(
                "Discard timer?",
                "The running timer is discarded; nothing is logged.",
                "Discard",
                () => void discardTimer(),
                "danger",
              ),
          },
          "Discard",
        ),
      ),
    );
  }
  return h(
    "section",
    { class: "timer-start muted" },
    h("span", {}, "start timer: "),
    ...CATEGORIES.map((c, i) =>
      h(
        "span",
        {},
        i > 0 ? " · " : "",
        h(
          "button",
          { class: "link-btn", onclick: () => void startTimer(c) },
          c,
        ),
      ),
    ),
  );
}

function elapsedText(startedAt: string): string {
  const mins = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(startedAt)) / 60_000),
  );
  const hours = Math.floor(mins / 60);
  return hours > 0 ? `${hours}h ${mins % 60}m` : `${mins}m`;
}

function entriesSection(week: string): HTMLElement {
  const dates = new Set(weekDates(week));
  const entries = state.entries.filter((e) => dates.has(e.date)).reverse();
  if (entries.length === 0) {
    return h(
      "section",
      { class: "muted empty" },
      "nothing logged yet this week",
    );
  }
  return h(
    "section",
    { class: "entries" },
    h(
      "div",
      { class: "entries-title muted" },
      "this week · hold an entry to correct",
    ),
    ...entries.map(entryRow),
  );
}

function entryRow(entry: ActivityEntry): HTMLElement {
  const row = h(
    "div",
    { class: `entry${entry.minutes < 0 ? " correction" : ""}` },
    h("span", { class: "entry-date muted" }, fmtDate(entry.date)),
    h("span", { class: `entry-cat cat-${entry.category}` }, entry.category),
    h("span", { class: "entry-min" }, fmtMinutes(entry.minutes)),
    entry.note
      ? h("span", { class: "entry-note muted" }, entry.note)
      : null,
    entry.corrects
      ? h("span", { class: "entry-flag muted" }, "correction")
      : null,
  );
  onLongPress(row, () => {
    if (entry.minutes < 0) return;
    confirmModal(
      "Correct this entry?",
      `Append a compensating entry of ${fmtMinutes(-entry.minutes)} ${entry.category} on ${fmtDate(entry.date)}? The original stays in the log.`,
      "Append correction",
      () => void addCorrection(entry).then(() => toast("correction appended")),
      "danger",
    );
  });
  return row;
}

function exportReminder(): HTMLElement | false {
  if (!state.lastExportAt) {
    return (
      state.entries.length > 0 &&
      h(
        "div",
        { class: "export-reminder muted" },
        "not backed up yet · export in Settings",
      )
    );
  }
  const days = daysSince(state.lastExportAt);
  return (
    days > 7 &&
    h(
      "div",
      { class: "export-reminder muted" },
      `last export: ${days} days ago`,
    )
  );
}

export function openLogSheet(
  category: Category,
  presetMinutes?: number,
): void {
  let closeFn: () => void = () => undefined;
  const today = todayLocalDate();
  const dateInput = h("input", {
    type: "date",
    class: "sheet-date",
    value: today,
    max: today,
  });
  const customInput = h("input", {
    type: "number",
    class: "sheet-custom",
    min: "1",
    max: "1440",
    placeholder: "custom minutes",
    value: presetMinutes !== undefined ? String(presetMinutes) : "",
    inputmode: "numeric",
  });
  const noteInput = h("input", {
    type: "text",
    class: "sheet-note",
    placeholder: "note (optional)",
  });

  const save = (minutes: number) => {
    const input = {
      date: dateInput.value,
      category,
      minutes,
      note: noteInput.value,
    };
    const error = validateEntryInput(input);
    if (error) {
      toast(error);
      return;
    }
    void addEntry(input).then(() => {
      closeFn();
      toast(`logged ${fmtMinutes(minutes)} ${category}`);
    });
  };

  const body = h(
    "div",
    { class: "sheet" },
    h(
      "div",
      { class: "chip-row" },
      ...CHIPS.map((m) =>
        h("button", { class: "chip", onclick: () => save(m) }, `${m}m`),
      ),
    ),
    h(
      "div",
      { class: "sheet-row" },
      customInput,
      h(
        "button",
        {
          class: "btn btn-primary",
          onclick: () => {
            const m = Number(customInput.value);
            if (Number.isFinite(m) && m > 0) save(m);
            else toast("enter minutes first");
          },
        },
        "Log",
      ),
    ),
    h("label", { class: "sheet-row muted sheet-date-row" }, "date", dateInput),
    h(
      "details",
      { class: "sheet-note-details" },
      h("summary", {}, "note"),
      noteInput,
    ),
  );
  closeFn = openModal(`Log ${category}`, body, [
    { label: "Cancel", kind: "ghost", onClick: (close) => close() },
  ]);
}
