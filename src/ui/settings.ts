import { h } from "./dom";

export function renderSettings(root: HTMLElement): void {
  root.append(h("p", { class: "muted" }, "Settings — coming in a later commit."));
}
