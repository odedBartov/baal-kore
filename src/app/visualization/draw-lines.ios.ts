// ponytail: written against UIKit but not built or run (iOS needs macOS, see docs/ios.md).
import { Color, ImageSource } from '@nativescript/core';
import type { DrawnLine } from './draw-lines';

export function drawLines(width: number, height: number, lines: DrawnLine[]): ImageSource {
  UIGraphicsBeginImageContextWithOptions(CGSizeMake(width, height), false, 0);
  for (const l of lines) {
    const path = UIBezierPath.bezierPath();
    for (const run of l.runs) {
      run.forEach(([x, y], i) => (i ? path.addLineToPoint(CGPointMake(x, y)) : path.moveToPoint(CGPointMake(x, y))));
      if (run.length === 1) path.addLineToPoint(CGPointMake(run[0][0] + 0.5, run[0][1]));
    }
    path.lineWidth = l.width;
    path.lineCapStyle = CGLineCap.kCGLineCapRound;
    path.lineJoinStyle = CGLineJoin.kCGLineJoinRound;
    new Color(l.color).ios.setStroke();
    path.strokeWithBlendModeAlpha(CGBlendMode.kCGBlendModeNormal, l.opacity);
  }
  const img = UIGraphicsGetImageFromCurrentImageContext();
  UIGraphicsEndImageContext();
  return new ImageSource(img);
}
