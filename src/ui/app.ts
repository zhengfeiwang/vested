import { state, subscribe } from "../store";
import { h } from "./dom";
import { renderWeek } from "./week";
import { renderLedger } from "./ledger";
import { renderReport } from "./report";
import { renderSettings } from "./settings";

type Route = "week" | "ledger" | "report" | "settings";

const ROUTES: readonly {
  id: Route;
  label: string;
  render: (root: HTMLElement) => void;
}[] = [
  { id: "week", label: "Week", render: renderWeek },
  { id: "ledger", label: "Ledger", render: renderLedger },
  { id: "report", label: "Report", render: renderReport },
  { id: "settings", label: "Settings", render: renderSettings },
];

function routeFromHash(): Route {
  const hash = location.hash.replace(/^#\/?/, "");
  return ROUTES.some((r) => r.id === hash) ? (hash as Route) : "week";
}

export function initApp(): void {
  const screen = h("main", { id: "screen" });
  const nav = h(
    "nav",
    { id: "tabbar" },
    ...ROUTES.map((r) =>
      h("a", { href: `#/${r.id}`, class: "tab", "data-route": r.id }, r.label),
    ),
  );
  document.getElementById("app")!.replaceChildren(screen, nav);

  const render = () => {
    if (!state.ready) {
      screen.textContent = "Loading…";
      return;
    }
    const route = routeFromHash();
    for (const tab of nav.querySelectorAll<HTMLElement>(".tab")) {
      tab.classList.toggle("active", tab.dataset.route === route);
    }
    screen.replaceChildren();
    ROUTES.find((r) => r.id === route)!.render(screen);
    window.scrollTo(0, 0);
  };
  window.addEventListener("hashchange", render);
  subscribe(render);
  render();
}
