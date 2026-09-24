const NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const WIDTH = 560;
const PAD = { left: 34, right: 8, top: 10, bottom: 22 };

function niceMax(max: number): number {
  const step = max > 40 ? 20 : max > 20 ? 10 : max > 10 ? 5 : max > 4 ? 2 : 1;
  return Math.ceil(max / step) * step;
}

function axes(
  svg: SVGSVGElement,
  labels: string[],
  yMax: number,
  height: number,
): { x: (i: number) => number; y: (v: number) => number } {
  const iw = WIDTH - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / yMax) * ih;
  for (const g of [0, yMax / 2, yMax]) {
    svg.append(
      el("line", { x1: PAD.left, x2: WIDTH - PAD.right, y1: y(g), y2: y(g), class: "grid" }),
    );
    const tick = el("text", { x: PAD.left - 5, y: y(g) + 3.5, class: "axis-label", "text-anchor": "end" });
    tick.textContent = String(g);
    svg.append(tick);
  }
  const step = Math.max(1, Math.ceil(labels.length / 6));
  labels.forEach((label, i) => {
    if (i % step !== 0 && i !== labels.length - 1) return;
    const t = el("text", { x: x(i), y: height - 6, class: "axis-label", "text-anchor": "middle" });
    t.textContent = label;
    svg.append(t);
  });
  return { x, y };
}

export interface LineSeries {
  color: string;
  dashed?: boolean;
  values: (number | null)[];
}

export function lineChart(
  labels: string[],
  series: LineSeries[],
  height = 180,
): SVGSVGElement {
  const svg = el("svg", {
    viewBox: `0 0 ${WIDTH} ${height}`,
    class: "chart",
    role: "img",
  });
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.values.map((v) => v ?? 0)),
  );
  const { x, y } = axes(svg, labels, niceMax(max), height);
  for (const s of series) {
    let segment: string[] = [];
    const flush = () => {
      if (segment.length > 1) {
        svg.append(
          el("polyline", {
            points: segment.join(" "),
            fill: "none",
            stroke: s.color,
            "stroke-width": 2,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            ...(s.dashed ? { "stroke-dasharray": "5 4" } : {}),
          }),
        );
      }
      segment = [];
    };
    s.values.forEach((v, i) => {
      if (v === null) {
        flush();
      } else {
        segment.push(`${x(i)},${y(v)}`);
        svg.append(el("circle", { cx: x(i), cy: y(v), r: 2.5, fill: s.color }));
      }
    });
    flush();
  }
  return svg;
}

// Grouped bars: one group per label, one bar per series. null values render
// as an "∞" marker (uncapped grant).
export function barChart(
  labels: string[],
  groups: (number | null)[][],
  colors: string[],
  height = 180,
): SVGSVGElement {
  const svg = el("svg", {
    viewBox: `0 0 ${WIDTH} ${height}`,
    class: "chart",
    role: "img",
  });
  const max = Math.max(1, ...groups.flat().map((v) => v ?? 0));
  const { x, y } = axes(svg, labels, niceMax(max), height);
  const seriesCount = groups[0]?.length ?? 0;
  const groupWidth = (WIDTH - PAD.left - PAD.right) / Math.max(1, labels.length);
  const barWidth = Math.min(
    14,
    (groupWidth * 0.7) / Math.max(1, seriesCount),
  );
  groups.forEach((values, i) => {
    values.forEach((v, s) => {
      const bx = x(i) + (s - (seriesCount - 1) / 2) * (barWidth + 3) - barWidth / 2;
      if (v === null) {
        const t = el("text", { x: x(i), y: y(0) - 6, class: "axis-label", "text-anchor": "middle" });
        t.textContent = "∞";
        svg.append(t);
        return;
      }
      svg.append(
        el("rect", {
          x: bx,
          y: y(v),
          width: barWidth,
          height: Math.max(0, y(0) - y(v)),
          rx: 2,
          fill: colors[s] ?? "#94a3b8",
        }),
      );
    });
  });
  return svg;
}
