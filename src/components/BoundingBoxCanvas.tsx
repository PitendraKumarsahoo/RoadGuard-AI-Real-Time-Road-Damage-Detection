import { useEffect, useRef } from 'react';
import type { RoadDetection } from '../types/detection';
import { formatDamageLabel, getSeverityColors } from '../utils/severity';

interface BoundingBoxCanvasProps {
  detections: RoadDetection[];
  sourceWidth: number;
  sourceHeight: number;
  fitMode?: 'cover' | 'contain';
}

export function BoundingBoxCanvas({
  detections,
  sourceWidth,
  sourceHeight,
  fitMode = 'cover',
}: BoundingBoxCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderBoxes = () => {
      const rect = canvas.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;
      if (!cw || !ch) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      if (!detections.length || !sourceWidth || !sourceHeight) return;

      const scale =
        fitMode === 'contain'
          ? Math.min(cw / sourceWidth, ch / sourceHeight)
          : Math.max(cw / sourceWidth, ch / sourceHeight);

      const drawW = sourceWidth * scale;
      const drawH = sourceHeight * scale;
      const offsetX = (cw - drawW) / 2;
      const offsetY = (ch - drawH) / 2;

      for (const det of detections) {
        const colors = getSeverityColors(det.severity);
        const x = offsetX + det.bbox.x * drawW;
        const y = offsetY + det.bbox.y * drawH;
        const w = det.bbox.width * drawW;
        const h = det.bbox.height * drawH;

        // Subtle fill tint inside detected damage region
        ctx.fillStyle = `${colors.stroke}1A`;
        ctx.fillRect(x, y, w, h);

        // Main bounding box outline
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x, y, w, h);

        // Crisp corner ticks for outdoor visibility
        const tick = Math.min(14, w * 0.25, h * 0.25);
        ctx.lineWidth = 4;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(x, y + tick);
        ctx.lineTo(x, y);
        ctx.lineTo(x + tick, y);
        // Top-right
        ctx.moveTo(x + w - tick, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + tick);
        // Bottom-right
        ctx.moveTo(x + w, y + h - tick);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w - tick, y + h);
        // Bottom-left
        ctx.moveTo(x + tick, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + h - tick);
        ctx.stroke();

        // Label strip above or inside top of bounding box
        const pct = Math.round(det.confidence * 100);
        const simPrefix = det.isSimulated ? '[SIM] ' : '';
        const label = `${simPrefix}${formatDamageLabel(det.type)} · ${pct}% · ${det.severity}`;

        ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
        const textMetrics = ctx.measureText(label);
        const padX = 8;
        const labelW = textMetrics.width + padX * 2;
        const labelH = 24;

        const labelX = Math.max(4, Math.min(cw - labelW - 4, x));
        const labelY = y - labelH - 4 >= 4 ? y - labelH - 4 : Math.max(4, y + 4);

        ctx.fillStyle = colors.badgeBg;
        ctx.beginPath();
        ctx.roundRect(labelX, labelY, labelW, labelH, 6);
        ctx.fill();

        ctx.fillStyle = colors.badgeText;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, labelX + padX, labelY + labelH / 2);
      }
    };

    renderBoxes();
    const observer = new ResizeObserver(renderBoxes);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [detections, sourceWidth, sourceHeight, fitMode]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Road damage bounding box overlay"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
