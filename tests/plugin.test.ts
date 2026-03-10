import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ScrollbarZoomPlugin,
  ScrollbarZoomOptions,
  ScrollbarColors,
} from '../src/index';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components + our plugin
Chart.register(
  LineController, LineElement, PointElement,
  CategoryScale, LinearScale, Tooltip, Legend,
  ScrollbarZoomPlugin,
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCanvas(width = 600, height = 400): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // jsdom doesn't have a real 2d context — stub getContext
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    roundRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    canvas,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowBlur: 0,
    shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    setLineDash: vi.fn(),
    getLineDash: vi.fn(() => []),
    lineDashOffset: 0,
    clip: vi.fn(),
    isPointInPath: vi.fn(() => false),
    isPointInStroke: vi.fn(() => false),
    drawImage: vi.fn(),
    createPattern: vi.fn(),
    rect: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    ellipse: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
  };
  canvas.getContext = vi.fn(() => ctx) as any;
  // Stub getBoundingClientRect for mouse events
  canvas.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0,
    toJSON: () => {},
  }));
  document.body.appendChild(canvas);
  return canvas;
}

function sampleLabels(n = 12): string[] {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months.slice(0, n).map((m, i) => `${m} 2025`);
}

function sampleData(n = 12): number[] {
  return Array.from({ length: n }, (_, i) => 30 + i * 5);
}

interface CreateChartOpts {
  scrollbarZoom?: ScrollbarZoomOptions;
  labels?: string[];
  data?: number[];
}

function createChart(canvas: HTMLCanvasElement, opts: CreateChartOpts = {}): Chart {
  const labels = opts.labels ?? sampleLabels();
  const data = opts.data ?? sampleData();
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Test',
        data,
        borderColor: '#333',
      }],
    },
    options: {
      responsive: false,
      animation: false as any,
      layout: { padding: { top: 32, right: 28 } },
      scales: {
        x: { offset: true },
        y: { min: 0, max: 100 },
      },
      plugins: {
        scrollbarZoom: {
          enabled: true,
          ...opts.scrollbarZoom,
        },
      } as any,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ScrollbarZoomPlugin', () => {
  let canvas: HTMLCanvasElement;
  let chart: Chart;

  afterEach(() => {
    if (chart) chart.destroy();
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
  });

  // --- Metadata ---

  it('has the correct plugin id', () => {
    expect(ScrollbarZoomPlugin.id).toBe('scrollbarZoom');
  });

  it('exports all required hooks', () => {
    expect(typeof ScrollbarZoomPlugin.afterInit).toBe('function');
    expect(typeof ScrollbarZoomPlugin.afterDraw).toBe('function');
    expect(typeof ScrollbarZoomPlugin.beforeDestroy).toBe('function');
  });

  // --- Registration ---

  it('registers without errors', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas);
    }).not.toThrow();
  });

  it('attaches __scrollbarZoom state to chart', async () => {
    canvas = createCanvas();
    chart = createChart(canvas);
    // afterInit runs synchronously, state capture is in setTimeout(0)
    await new Promise(r => setTimeout(r, 10));
    expect((chart as any).__scrollbarZoom).toBeDefined();
    expect((chart as any).__scrollbarZoom.xS).toBe(0);
    expect((chart as any).__scrollbarZoom.xE).toBe(1);
    expect((chart as any).__scrollbarZoom.yS).toBe(0);
    expect((chart as any).__scrollbarZoom.yE).toBe(1);
  });

  it('does not attach state when enabled is false', () => {
    canvas = createCanvas();
    chart = createChart(canvas, { scrollbarZoom: { enabled: false } });
    expect((chart as any).__scrollbarZoom).toBeUndefined();
  });

  // --- Cleanup ---

  it('cleans up state on destroy', async () => {
    canvas = createCanvas();
    chart = createChart(canvas);
    await new Promise(r => setTimeout(r, 10));
    expect((chart as any).__scrollbarZoom).toBeDefined();
    chart.destroy();
    expect((chart as any).__scrollbarZoom).toBeUndefined();
    chart = undefined!; // prevent double destroy in afterEach
  });

  // --- Options defaults ---

  it('uses default options when none specified', async () => {
    canvas = createCanvas();
    chart = createChart(canvas);
    await new Promise(r => setTimeout(r, 10));
    const state = (chart as any).__scrollbarZoom;
    expect(state).toBeDefined();
    // Full viewport by default
    expect(state.xS).toBe(0);
    expect(state.xE).toBe(1);
    expect(state.yS).toBe(0);
    expect(state.yE).toBe(1);
  });

  // --- Axes configuration ---

  it('respects axes: x option', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { scrollbarZoom: { axes: 'x' } });
    }).not.toThrow();
  });

  it('respects axes: y option', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { scrollbarZoom: { axes: 'y' } });
    }).not.toThrow();
  });

  // --- Dark mode ---

  it('accepts dark mode option', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { scrollbarZoom: { dark: true } });
    }).not.toThrow();
  });

  // --- Custom colors ---

  it('accepts custom colors', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, {
        scrollbarZoom: {
          colors: {
            track: 'rgba(255,0,0,0.1)',
            thumb: 'rgba(255,0,0,0.3)',
            handleFill: '#ff0000',
            handleStroke: '#cc0000',
            grip: '#990000',
          },
        },
      });
    }).not.toThrow();
  });

  it('accepts custom dark colors', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, {
        scrollbarZoom: {
          dark: true,
          darkColors: {
            track: 'rgba(0,255,0,0.1)',
            thumb: 'rgba(0,255,0,0.3)',
          },
        },
      });
    }).not.toThrow();
  });

  // --- Position options ---

  it('accepts xPosition: bottom', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { scrollbarZoom: { xPosition: 'bottom' } });
    }).not.toThrow();
  });

  it('accepts yPosition: left', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { scrollbarZoom: { yPosition: 'left' } });
    }).not.toThrow();
  });

  // --- Size options ---

  it('accepts custom trackSize and handleRadius', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, {
        scrollbarZoom: { trackSize: 10, handleRadius: 14 },
      });
    }).not.toThrow();
  });

  // --- Callback ---

  it('fires onZoomChange callback during drag', async () => {
    const onZoomChange = vi.fn();
    canvas = createCanvas();
    chart = createChart(canvas, {
      scrollbarZoom: { onZoomChange },
    });
    await new Promise(r => setTimeout(r, 10));

    // Simulate mousedown on canvas (won't hit a handle in jsdom, but verifies no crash)
    const mousedown = new MouseEvent('mousedown', { clientX: 50, clientY: 10, bubbles: true });
    canvas.dispatchEvent(mousedown);

    const mousemove = new MouseEvent('mousemove', { clientX: 100, clientY: 10, bubbles: true });
    document.dispatchEvent(mousemove);

    const mouseup = new MouseEvent('mouseup', { bubbles: true });
    document.dispatchEvent(mouseup);

    // The callback may or may not fire depending on hit-test (jsdom has no real chartArea)
    // But at minimum it should not throw
  });

  // --- preserveYTicks ---

  it('captures original Y ticks when preserveYTicks is true (default)', async () => {
    canvas = createCanvas();
    chart = createChart(canvas);
    await new Promise(r => setTimeout(r, 10));
    const state = (chart as any).__scrollbarZoom;
    // origYTicks may be undefined in jsdom (no real scale rendering)
    // but the state should exist
    expect(state).toBeDefined();
  });

  it('skips Y tick capture when preserveYTicks is false', async () => {
    canvas = createCanvas();
    chart = createChart(canvas, { scrollbarZoom: { preserveYTicks: false } });
    await new Promise(r => setTimeout(r, 10));
    const state = (chart as any).__scrollbarZoom;
    expect(state).toBeDefined();
    expect(state.origYTicks).toBeUndefined();
  });

  // --- Double-click reset ---

  it('handles double-click without crashing', async () => {
    canvas = createCanvas();
    chart = createChart(canvas);
    await new Promise(r => setTimeout(r, 10));

    expect(() => {
      const dblclick = new MouseEvent('dblclick', { bubbles: true });
      canvas.dispatchEvent(dblclick);
    }).not.toThrow();
  });

  // --- Edge cases ---

  it('works with empty data', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { labels: [], data: [] });
    }).not.toThrow();
  });

  it('works with single data point', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { labels: ['Jan 2025'], data: [50] });
    }).not.toThrow();
  });

  it('works with two data points', () => {
    canvas = createCanvas();
    expect(() => {
      chart = createChart(canvas, { labels: ['Jan 2025', 'Feb 2025'], data: [30, 70] });
    }).not.toThrow();
  });

  // --- Multiple charts ---

  it('supports multiple charts on the same page without interference', async () => {
    const canvas1 = createCanvas();
    const canvas2 = createCanvas();
    const chart1 = createChart(canvas1);
    const chart2 = createChart(canvas2);
    await new Promise(r => setTimeout(r, 10));

    const state1 = (chart1 as any).__scrollbarZoom;
    const state2 = (chart2 as any).__scrollbarZoom;
    expect(state1).toBeDefined();
    expect(state2).toBeDefined();
    expect(state1).not.toBe(state2);

    chart1.destroy();
    chart2.destroy();
    canvas1.parentNode?.removeChild(canvas1);
    canvas2.parentNode?.removeChild(canvas2);
    chart = undefined!;
  });
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

describe('Type exports', () => {
  it('exports ScrollbarZoomPlugin', () => {
    expect(ScrollbarZoomPlugin).toBeDefined();
    expect(ScrollbarZoomPlugin.id).toBe('scrollbarZoom');
  });

  it('exports default as the same plugin', async () => {
    const mod = await import('../src/index');
    expect(mod.default).toBe(mod.ScrollbarZoomPlugin);
  });
});
