import type { Chart, Plugin } from 'chart.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Color values for scrollbar components. */
export interface ScrollbarColors {
  /** Scrollbar track background. */
  track?: string;
  /** Thumb (selected range) fill. */
  thumb?: string;
  /** Handle circle fill. */
  handleFill?: string;
  /** Handle circle border stroke. */
  handleStroke?: string;
  /** Handle grip‑line color. */
  grip?: string;
}

/** Position of the X scrollbar relative to the chart area. */
export type XPosition = 'top' | 'bottom';

/** Position of the Y scrollbar relative to the chart area. */
export type YPosition = 'left' | 'right';

/** Which axes have scrollbars. */
export type ScrollbarAxes = 'x' | 'y' | 'both';

/** Full plugin options — every field is optional with sensible defaults. */
export interface ScrollbarZoomOptions {
  /** Enable / disable the plugin (default `true`). */
  enabled?: boolean;

  /** Which axes to show scrollbars for (default `'both'`). */
  axes?: ScrollbarAxes;

  /** X scrollbar position (default `'top'`). */
  xPosition?: XPosition;

  /** Y scrollbar position (default `'right'`). */
  yPosition?: YPosition;

  /** Track height / width in px (default `6`). */
  trackSize?: number;

  /** Handle circle radius in px (default `10`). */
  handleRadius?: number;

  /** Distance from chart area edge to scrollbar center in px (default `20`). */
  xOffset?: number;

  /** Distance from chart area edge to scrollbar center in px (default `16`). */
  yOffset?: number;

  /** Minimum thumb size as a fraction of the track (default `0.08`). */
  minThumbFraction?: number;

  /** Light‑mode colors (used when `dark` is false). */
  colors?: ScrollbarColors;

  /** Dark‑mode colors (used when `dark` is true). */
  darkColors?: ScrollbarColors;

  /** Whether the chart is in dark mode (default `false`). */
  dark?: boolean;

  /**
   * Preserve original Y‑axis tick values during zoom — prevents Chart.js
   * from generating intermediate decimal ticks (default `true`).
   */
  preserveYTicks?: boolean;

  /**
   * Callback fired whenever the visible range changes.
   * Receives the current viewport fractions for both axes.
   */
  onZoomChange?: (range: { xStart: number; xEnd: number; yStart: number; yEnd: number }) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_LIGHT_COLORS: Required<ScrollbarColors> = {
  track: 'rgba(0,0,0,0.08)',
  thumb: 'rgba(0,0,0,0.15)',
  handleFill: '#e8e8e8',
  handleStroke: 'rgba(0,0,0,0.25)',
  grip: 'rgba(0,0,0,0.35)',
};

const DEFAULT_DARK_COLORS: Required<ScrollbarColors> = {
  track: 'rgba(255,255,255,0.12)',
  thumb: 'rgba(255,255,255,0.25)',
  handleFill: '#555',
  handleStroke: 'rgba(255,255,255,0.5)',
  grip: 'rgba(255,255,255,0.7)',
};

function resolveColors(opts: ScrollbarZoomOptions): Required<ScrollbarColors> {
  const base = opts.dark ? DEFAULT_DARK_COLORS : DEFAULT_LIGHT_COLORS;
  const custom = opts.dark ? opts.darkColors : opts.colors;
  if (!custom) return base;
  return { ...base, ...custom };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type DragTarget = 'xL' | 'xR' | 'xT' | 'yT' | 'yB' | 'yThumb' | null;

interface TrackRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Center on the cross‑axis (cy for horizontal tracks, cx for vertical). */
  center: number;
}

function getOpts(chart: Chart): ScrollbarZoomOptions {
  return (chart.options.plugins as any)?.scrollbarZoom ?? {};
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const ScrollbarZoomPlugin: Plugin<'line' | 'bar'> = {
  id: 'scrollbarZoom',

  // Store per‑chart state on the chart instance so multiple charts on the
  // same page don't interfere with each other.
  afterInit(chart: Chart) {
    const opts = getOpts(chart);
    if (opts.enabled === false) return;

    const state = initState(chart, opts);
    (chart as any).__scrollbarZoom = state;
  },

  beforeDestroy(chart: Chart) {
    const state: PluginState | undefined = (chart as any).__scrollbarZoom;
    if (!state) return;
    if (state.docMoveHandler) document.removeEventListener('mousemove', state.docMoveHandler);
    if (state.docUpHandler) document.removeEventListener('mouseup', state.docUpHandler);
    delete (chart as any).__scrollbarZoom;
  },

  afterDraw(chart: Chart) {
    const state: PluginState | undefined = (chart as any).__scrollbarZoom;
    if (!state) return;
    const opts = getOpts(chart);
    if (opts.enabled === false) return;
    drawScrollbars(chart, state, opts);
  },
};

// ---------------------------------------------------------------------------
// Per‑chart state
// ---------------------------------------------------------------------------

interface PluginState {
  xS: number;
  xE: number;
  yS: number;
  yE: number;
  origYMin?: number;
  origYMax?: number;
  origYTicks?: Set<number>;
  drag: DragTarget;
  dragMouseStart: number;
  dragValStart: { s: number; e: number };
  docMoveHandler: ((e: MouseEvent) => void) | null;
  docUpHandler: (() => void) | null;
}

function initState(chart: Chart, opts: ScrollbarZoomOptions): PluginState {
  const state: PluginState = {
    xS: 0, xE: 1,
    yS: 0, yE: 1,
    drag: null,
    dragMouseStart: 0,
    dragValStart: { s: 0, e: 0 },
    docMoveHandler: null,
    docUpHandler: null,
  };

  // Capture original Y bounds after first render
  setTimeout(() => {
    const yScale = chart.scales?.['y'];
    if (yScale) {
      state.origYMin = yScale.min;
      state.origYMax = yScale.max;
      if (opts.preserveYTicks !== false) {
        state.origYTicks = new Set(yScale.ticks.map((t: any) => t.value));
      }
    }
  }, 0);

  const canvas = chart.canvas;
  const axes = opts.axes ?? 'both';

  // --- Mouse down ---
  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const target = hitTest(chart, state, opts, mx, my);
    if (!target) return;

    state.drag = target;
    state.dragMouseStart = target.startsWith('x') ? mx : my;
    state.dragValStart = target.startsWith('x')
      ? { s: state.xS, e: state.xE }
      : { s: state.yS, e: state.yE };
    e.preventDefault();
    e.stopPropagation();
  });

  // --- Mouse move (on document for drag beyond canvas) ---
  state.docMoveHandler = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const minFrac = opts.minThumbFraction ?? 0.08;

    if (!state.drag) {
      // Hover cursor
      const t = hitTest(chart, state, opts, mx, my);
      if (t) {
        const isXHandle = t === 'xL' || t === 'xR';
        const isYHandle = t === 'yT' || t === 'yB';
        canvas.style.cursor = isXHandle ? 'ew-resize' : isYHandle ? 'ns-resize' : 'grab';
      }
      return;
    }

    if (state.drag.startsWith('x')) {
      const tr = xTrackRect(chart, opts);
      if (!tr) return;
      const dFrac = (mx - state.dragMouseStart) / tr.w;

      if (state.drag === 'xL') {
        state.xS = Math.max(0, Math.min(state.xE - minFrac, state.dragValStart.s + dFrac));
      } else if (state.drag === 'xR') {
        state.xE = Math.min(1, Math.max(state.xS + minFrac, state.dragValStart.e + dFrac));
      } else {
        const size = state.dragValStart.e - state.dragValStart.s;
        let ns = state.dragValStart.s + dFrac;
        let ne = state.dragValStart.e + dFrac;
        if (ns < 0) { ns = 0; ne = size; }
        if (ne > 1) { ne = 1; ns = 1 - size; }
        state.xS = ns;
        state.xE = ne;
      }
      applyX(chart, state);
      canvas.style.cursor = state.drag === 'xT' ? 'grabbing' : 'ew-resize';
    } else {
      const tr = yTrackRect(chart, opts);
      if (!tr) return;
      const dFrac = (my - state.dragMouseStart) / tr.h;

      if (state.drag === 'yT') {
        state.yS = Math.max(0, Math.min(state.yE - minFrac, state.dragValStart.s + dFrac));
      } else if (state.drag === 'yB') {
        state.yE = Math.min(1, Math.max(state.yS + minFrac, state.dragValStart.e + dFrac));
      } else {
        const size = state.dragValStart.e - state.dragValStart.s;
        let ns = state.dragValStart.s + dFrac;
        let ne = state.dragValStart.e + dFrac;
        if (ns < 0) { ns = 0; ne = size; }
        if (ne > 1) { ne = 1; ns = 1 - size; }
        state.yS = ns;
        state.yE = ne;
      }
      applyY(chart, state, opts);
      canvas.style.cursor = state.drag === 'yThumb' ? 'grabbing' : 'ns-resize';
    }

    chart.update('none');

    opts.onZoomChange?.({
      xStart: state.xS, xEnd: state.xE,
      yStart: state.yS, yEnd: state.yE,
    });
  };

  // --- Mouse up ---
  state.docUpHandler = () => {
    if (state.drag) {
      state.drag = null;
      canvas.style.cursor = 'default';
    }
  };

  document.addEventListener('mousemove', state.docMoveHandler);
  document.addEventListener('mouseup', state.docUpHandler);

  // --- Double‑click to reset ---
  canvas.addEventListener('dblclick', () => {
    state.xS = 0; state.xE = 1;
    state.yS = 0; state.yE = 1;

    if (axes === 'x' || axes === 'both') {
      const labels = chart.data.labels as string[];
      if (labels?.length) {
        chart.options.scales!['x']!.min = 0;
        chart.options.scales!['x']!.max = labels.length - 1;
      }
    }
    if (axes === 'y' || axes === 'both') {
      if (state.origYMin !== undefined && state.origYMax !== undefined) {
        chart.options.scales!['y']!.min = state.origYMin;
        chart.options.scales!['y']!.max = state.origYMax;
      }
    }
    chart.update('none');

    opts.onZoomChange?.({ xStart: 0, xEnd: 1, yStart: 0, yEnd: 1 });
  });

  return state;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function xTrackRect(chart: Chart, opts: ScrollbarZoomOptions): TrackRect | null {
  const a = chart.chartArea;
  if (!a) return null;
  const trackH = opts.trackSize ?? 6;
  const offset = opts.xOffset ?? 20;
  const pos = opts.xPosition ?? 'top';
  const cy = pos === 'top' ? a.top - offset : a.bottom + offset;
  return { x: a.left, y: cy - trackH / 2, w: a.right - a.left, h: trackH, center: cy };
}

function yTrackRect(chart: Chart, opts: ScrollbarZoomOptions): TrackRect | null {
  const a = chart.chartArea;
  if (!a) return null;
  const trackW = opts.trackSize ?? 6;
  const offset = opts.yOffset ?? 16;
  const pos = opts.yPosition ?? 'right';
  const cx = pos === 'right' ? a.right + offset : a.left - offset;
  return { x: cx - trackW / 2, y: a.top, w: trackW, h: a.bottom - a.top, center: cx };
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

function hitTest(
  chart: Chart,
  state: PluginState,
  opts: ScrollbarZoomOptions,
  mx: number,
  my: number,
): DragTarget {
  const axes = opts.axes ?? 'both';
  const hr = (opts.handleRadius ?? 10) + 2; // add small tolerance

  if (axes === 'x' || axes === 'both') {
    const xt = xTrackRect(chart, opts);
    if (xt) {
      const lx = xt.x + state.xS * xt.w;
      const rx = xt.x + state.xE * xt.w;
      if (Math.hypot(mx - lx, my - xt.center) <= hr) return 'xL';
      if (Math.hypot(mx - rx, my - xt.center) <= hr) return 'xR';
      if (mx >= lx && mx <= rx && Math.abs(my - xt.center) <= hr) return 'xT';
    }
  }

  if (axes === 'y' || axes === 'both') {
    const yt = yTrackRect(chart, opts);
    if (yt) {
      const ty = yt.y + state.yS * yt.h;
      const by = yt.y + state.yE * yt.h;
      if (Math.hypot(mx - yt.center, my - ty) <= hr) return 'yT';
      if (Math.hypot(mx - yt.center, my - by) <= hr) return 'yB';
      if (my >= ty && my <= by && Math.abs(mx - yt.center) <= hr) return 'yThumb';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Zoom application
// ---------------------------------------------------------------------------

function applyX(chart: Chart, state: PluginState) {
  const labels = chart.data.labels as string[];
  if (!labels?.length) return;
  const n = labels.length - 1;
  chart.options.scales!['x']!.min = Math.max(0, Math.round(state.xS * n));
  chart.options.scales!['x']!.max = Math.min(n, Math.round(state.xE * n));
}

function applyY(chart: Chart, state: PluginState, opts: ScrollbarZoomOptions) {
  if (state.origYMin === undefined || state.origYMax === undefined) return;
  const range = state.origYMax - state.origYMin;
  chart.options.scales!['y']!.max = state.origYMax - state.yS * range;
  chart.options.scales!['y']!.min = state.origYMax - state.yE * range;

  if (opts.preserveYTicks !== false && state.origYTicks) {
    const ticks = state.origYTicks;
    (chart.options.scales!['y'] as any).afterBuildTicks = (axis: any) => {
      axis.ticks = axis.ticks.filter((t: any) => ticks.has(t.value));
    };
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function drawScrollbars(chart: Chart, state: PluginState, opts: ScrollbarZoomOptions) {
  const { ctx, chartArea } = chart;
  if (!chartArea) return;

  const colors = resolveColors(opts);
  const trackSize = opts.trackSize ?? 6;
  const handleR = opts.handleRadius ?? 10;
  const axes = opts.axes ?? 'both';

  ctx.save();

  // --- X scrollbar ---
  if (axes === 'x' || axes === 'both') {
    const xt = xTrackRect(chart, opts);
    if (xt) {
      drawTrack(ctx, xt.x, xt.y, xt.w, xt.h, trackSize, colors.track);
      const thumbX = xt.x + state.xS * xt.w;
      const thumbW = (state.xE - state.xS) * xt.w;
      drawThumb(ctx, thumbX, xt.y, thumbW, xt.h, trackSize, colors.thumb);
      drawHandle(ctx, thumbX, xt.center, handleR, true, colors);
      drawHandle(ctx, thumbX + thumbW, xt.center, handleR, true, colors);
    }
  }

  // --- Y scrollbar ---
  if (axes === 'y' || axes === 'both') {
    const yt = yTrackRect(chart, opts);
    if (yt) {
      drawTrack(ctx, yt.x, yt.y, yt.w, yt.h, trackSize, colors.track);
      const thumbY = yt.y + state.yS * yt.h;
      const thumbH = (state.yE - state.yS) * yt.h;
      drawThumb(ctx, yt.x, thumbY, yt.w, thumbH, trackSize, colors.thumb);
      drawHandle(ctx, yt.center, thumbY, handleR, false, colors);
      drawHandle(ctx, yt.center, thumbY + thumbH, handleR, false, colors);
    }
  }

  ctx.restore();
}

function drawTrack(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  trackSize: number, color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, trackSize / 2);
  ctx.fill();
}

function drawThumb(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  trackSize: number, color: string,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, trackSize / 2);
  ctx.fill();
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  radius: number,
  horizontal: boolean,
  colors: Required<ScrollbarColors>,
) {
  // Circle
  ctx.fillStyle = colors.handleFill;
  ctx.strokeStyle = colors.handleStroke;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Grip lines
  ctx.strokeStyle = colors.grip;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(cx - 3, cy - 4); ctx.lineTo(cx - 3, cy + 4);
    ctx.moveTo(cx, cy - 4);     ctx.lineTo(cx, cy + 4);
    ctx.moveTo(cx + 3, cy - 4); ctx.lineTo(cx + 3, cy + 4);
  } else {
    ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx + 4, cy - 3);
    ctx.moveTo(cx - 4, cy);     ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx - 4, cy + 3); ctx.lineTo(cx + 4, cy + 3);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default ScrollbarZoomPlugin;
export { ScrollbarZoomPlugin };
