import { Plugin } from 'chart.js';

/** Color values for scrollbar components. */
interface ScrollbarColors {
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
type XPosition = 'top' | 'bottom';
/** Position of the Y scrollbar relative to the chart area. */
type YPosition = 'left' | 'right';
/** Which axes have scrollbars. */
type ScrollbarAxes = 'x' | 'y' | 'both';
/** Full plugin options — every field is optional with sensible defaults. */
interface ScrollbarZoomOptions {
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
    onZoomChange?: (range: {
        xStart: number;
        xEnd: number;
        yStart: number;
        yEnd: number;
    }) => void;
}
declare const ScrollbarZoomPlugin: Plugin<'line' | 'bar'>;

export { type ScrollbarAxes, type ScrollbarColors, type ScrollbarZoomOptions, ScrollbarZoomPlugin, type XPosition, type YPosition, ScrollbarZoomPlugin as default };
