// Anti-aliased polylines rendered into one image. Implementations: draw-lines.android.ts, draw-lines.ios.ts.
import type { ImageSource } from '@nativescript/core';

export interface DrawnLine {
  runs: [number, number][][]; // polylines in DIPs
  color: string; // #rrggbb
  width: number; // DIPs
  opacity: number; // 0..1, uniform over the whole line (overlaps do not darken)
}

export function drawLines(width: number, height: number, lines: DrawnLine[]): ImageSource;
