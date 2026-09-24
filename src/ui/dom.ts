type Attrs = Record<
  string,
  string | number | boolean | EventListener | undefined
>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === "class") el.className = String(value);
    else if (key.startsWith("on") && typeof value === "function")
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "value")
      (el as HTMLInputElement).value = String(value);
    else if (key === "checked")
      (el as HTMLInputElement).checked = value === true;
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export interface ModalAction {
  label: string;
  kind?: "primary" | "danger" | "ghost";
  onClick: (close: () => void) => void;
}

export function openModal(
  title: string,
  body: HTMLElement,
  actions: ModalAction[],
): () => void {
  const overlay = h("div", { class: "modal-overlay" });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  const dialog = h(
    "div",
    { class: "modal", role: "dialog", "aria-modal": "true" },
    h("h2", { class: "modal-title" }, title),
    body,
    h(
      "div",
      { class: "modal-actions" },
      ...actions.map((a) =>
        h(
          "button",
          { class: `btn btn-${a.kind ?? "ghost"}`, onclick: () => a.onClick(close) },
          a.label,
        ),
      ),
    ),
  );
  overlay.append(dialog);
  document.body.append(overlay);
  return close;
}

export function confirmModal(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  kind: "primary" | "danger" = "primary",
): void {
  openModal(title, h("p", { class: "modal-message" }, message), [
    { label: "Cancel", kind: "ghost", onClick: (close) => close() },
    {
      label: confirmLabel,
      kind,
      onClick: (close) => {
        close();
        onConfirm();
      },
    },
  ]);
}

let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;

export function toast(
  message: string,
  action?: { label: string; onClick: () => void },
): void {
  toastEl?.remove();
  clearTimeout(toastTimer);
  toastEl = h(
    "div",
    { class: "toast" },
    h("span", {}, message),
    action
      ? h(
          "button",
          {
            class: "toast-action",
            onclick: () => {
              action.onClick();
              toastEl?.remove();
              toastEl = null;
            },
          },
          action.label,
        )
      : null,
  );
  document.body.append(toastEl);
  toastTimer = window.setTimeout(
    () => {
      toastEl?.remove();
      toastEl = null;
    },
    action ? 8000 : 3000,
  );
}

export function onLongPress(
  el: HTMLElement,
  fn: () => void,
  ms = 500,
): void {
  let timer: number | undefined;
  let startX = 0;
  let startY = 0;
  const cancel = (e: PointerEvent) => {
    if (timer === undefined) return;
    if (
      e.type === "pointermove" &&
      Math.hypot(e.clientX - startX, e.clientY - startY) < 10
    )
      return;
    clearTimeout(timer);
    timer = undefined;
  };
  el.addEventListener("pointerdown", (e) => {
    startX = e.clientX;
    startY = e.clientY;
    timer = window.setTimeout(() => {
      timer = undefined;
      fn();
    }, ms);
  });
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointermove", cancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
