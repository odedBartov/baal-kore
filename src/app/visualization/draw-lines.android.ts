import { ImageSource, Screen } from '@nativescript/core';
import type { DrawnLine } from './draw-lines';

export function drawLines(width: number, height: number, lines: DrawnLine[]): ImageSource {
  const s = Screen.mainScreen.scale, G = android.graphics;
  const bmp = G.Bitmap.createBitmap(Math.max(1, Math.round(width * s)), Math.max(1, Math.round(height * s)), G.Bitmap.Config.ARGB_8888);
  const canvas = new G.Canvas(bmp);
  for (const l of lines) {
    const paint = new G.Paint(G.Paint.ANTI_ALIAS_FLAG);
    paint.setStyle(G.Paint.Style.STROKE);
    paint.setStrokeWidth(l.width * s);
    paint.setStrokeCap(G.Paint.Cap.ROUND);
    paint.setStrokeJoin(G.Paint.Join.ROUND);
    paint.setColor(G.Color.parseColor(l.color));
    paint.setAlpha(Math.round(255 * l.opacity));
    const path = new G.Path(); // one path per line, so overlapping segments share a single alpha
    for (const run of l.runs) {
      run.forEach(([x, y], i) => (i ? path.lineTo(x * s, y * s) : path.moveTo(x * s, y * s)));
      if (run.length === 1) path.lineTo(run[0][0] * s + 0.5, run[0][1] * s); // a lone frame still shows as a dot
    }
    canvas.drawPath(path, paint);
  }
  return new ImageSource(bmp);
}
