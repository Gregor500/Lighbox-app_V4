import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Border, Point2 } from '../geometry/types';
import { FrameLine, calculateHolesForLine } from '../geometry/frame';

interface FrameEditorProps {
  borders: Border[];
  frameLines: FrameLine[];
  onFrameLinesChange: (lines: FrameLine[]) => void;
  materialThickness: number;
  holeSpacing: number;
  holeDiameter: number;
}

export function FrameEditor({ borders, frameLines, onFrameLinesChange, materialThickness, holeSpacing, holeDiameter }: FrameEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState<FrameLine | null>(null);
  const [snapOrtho, setSnapOrtho] = useState(false);
  const [snapNear, setSnapNear] = useState(false);
  const [snapIncrement, setSnapIncrement] = useState(false);
  const [mousePos, setMousePos] = useState<Point2>({ x: 0, y: 0 });

  // Calculate bounding box for viewBox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  borders.forEach(b => {
    b.polygon.points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  });

  // Add padding
  let padding = 100;
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 300; maxY = 150;
  }

  const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;

  const getMouseCoords = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    const CTM = svg.getScreenCTM();
    if (!CTM) return { x: 0, y: 0 };
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - CTM.e) / CTM.a,
      y: (clientY - CTM.f) / CTM.d
    };
  };

  const applySnapping = (p: Point2, startPoint?: Point2): Point2 => {
    let snapped = { ...p };
    
    if (snapIncrement) {
      const inc = 10; // 10mm increment
      snapped.x = Math.round(snapped.x / inc) * inc;
      snapped.y = Math.round(snapped.y / inc) * inc;
    }
    
    if (snapNear) {
      let minDist = 20; // 20 units snap radius
      let bestPoint: Point2 | null = null;
      
      // Snap to frame lines (any point on the segment)
      frameLines.forEach(line => {
        const a = line.start;
        const b = line.end;
        const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
        let t = 0;
        if (l2 > 0) {
          t = ((snapped.x - a.x) * (b.x - a.x) + (snapped.y - a.y) * (b.y - a.y)) / l2;
          t = Math.max(0, Math.min(1, t));
        }
        const closest = {
          x: a.x + t * (b.x - a.x),
          y: a.y + t * (b.y - a.y)
        };
        
        const dx = closest.x - snapped.x;
        const dy = closest.y - snapped.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < minDist) {
          minDist = dist;
          bestPoint = closest;
        }
      });
      
      if (bestPoint) {
        snapped = { ...bestPoint };
      }
    }
    
    if (snapOrtho && startPoint) {
      const dx = Math.abs(snapped.x - startPoint.x);
      const dy = Math.abs(snapped.y - startPoint.y);
      if (dx > dy) {
        snapped.y = startPoint.y;
      } else {
        snapped.x = startPoint.x;
      }
    }
    
    return snapped;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const wp = getMouseCoords(e);
    const snapped = applySnapping(wp);
    
    if (!isDrawing) {
      setIsDrawing(true);
      setCurrentLine({ start: snapped, end: snapped });
    } else if (currentLine) {
      onFrameLinesChange([...frameLines, { start: currentLine.start, end: snapped }]);
      setIsDrawing(false);
      setCurrentLine(null);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    const wp = getMouseCoords(e);
    setMousePos(wp);
    
    if (isDrawing && currentLine) {
      const snapped = applySnapping(wp, currentLine.start);
      setCurrentLine({ ...currentLine, end: snapped });
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsDrawing(false);
      setCurrentLine(null);
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4 bg-gray-100 p-2 rounded-lg">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={snapOrtho} onChange={e => setSnapOrtho(e.target.checked)} />
          Ortho
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={snapNear} onChange={e => setSnapNear(e.target.checked)} />
          Near
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={snapIncrement} onChange={e => setSnapIncrement(e.target.checked)} />
          Increment
        </label>
        <button 
          onClick={() => {
            if (frameLines.length > 0) {
              onFrameLinesChange(frameLines.slice(0, -1));
            }
          }}
          disabled={frameLines.length === 0}
          className="ml-auto px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-xs font-bold disabled:opacity-50"
        >
          Undo Last Line
        </button>
        <button 
          onClick={() => {
            onFrameLinesChange([]);
            setIsDrawing(false);
            setCurrentLine(null);
          }}
          className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-xs font-bold"
        >
          Clear Frame
        </button>
      </div>
      
      <div className="w-full aspect-[2/1] bg-gray-100 border border-gray-300 rounded overflow-hidden relative">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="w-full h-full cursor-crosshair"
          style={{ touchAction: 'none' }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
        >
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Fill path for all borders using evenodd to cut out holes */}
          <path
            d={borders.filter(b => !b.id.endsWith('_orig')).map(border => {
              const pts = border.polygon.points;
              if (pts.length < 3) return '';
              return `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ') + ' Z';
            }).join(' ')}
            fill="rgba(0, 0, 255, 0.1)"
            fillRule="evenodd"
          />

          {/* Strokes for borders */}
          {[...borders].sort((a, b) => (a.role === 'perimeter' ? -1 : 1)).map(border => {
            const pts = border.polygon.points;
            if (pts.length < 3) return null;
            const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
            
            return (
              <polygon
                key={border.id}
                points={pointsStr}
                fill="none"
                stroke={border.id.endsWith('_orig') ? '#ef4444' : (border.role === 'hole' ? '#22c55e' : '#3b82f6')}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Frame Lines and Material Thickness */}
          {[...frameLines, currentLine].filter(Boolean).map((line, i) => {
            if (!line) return null;
            return (
              <g key={i}>
                {/* Material Thickness */}
                <line
                  x1={line.start.x}
                  y1={line.start.y}
                  x2={line.end.x}
                  y2={line.end.y}
                  stroke="rgba(59, 130, 246, 0.2)"
                  strokeWidth={materialThickness}
                  strokeLinecap="square"
                />
                {/* Centerline */}
                <line
                  x1={line.start.x}
                  y1={line.start.y}
                  x2={line.end.x}
                  y2={line.end.y}
                  stroke="#3b82f6"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                {/* Holes */}
                {calculateHolesForLine(line, materialThickness, holeSpacing).map((hole, j) => (
                  <circle
                    key={j}
                    cx={hole.x}
                    cy={hole.y}
                    r={holeDiameter / 2}
                    fill="#ef4444"
                  />
                ))}
              </g>
            );
          })}

          {/* Snapping Cursor */}
          {(snapIncrement || snapNear || snapOrtho) && (
            <circle
              cx={applySnapping(mousePos, currentLine?.start).x}
              cy={applySnapping(mousePos, currentLine?.start).y}
              r="4"
              fill="#10b981"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        <div className="absolute top-2 left-2 bg-white/80 px-2 py-1 rounded text-xs font-mono shadow">
          Frame Editor (Click to draw centerlines, Esc to cancel)
        </div>
      </div>
    </div>
  );
}
