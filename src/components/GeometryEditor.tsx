import React, { useState, useRef, useEffect } from 'react';
import { Border, Point2, LineSegment, DEFAULT_TOLERANCES } from '../geometry/types';
import { polygonsIntersect, polygonContainsPolygon } from '../geometry/math';

interface GeometryEditorProps {
  borders: Border[];
  onChange?: (borders: Border[]) => void;
  readonly?: boolean;
  title?: string;
  workArea?: { width: number; height: number } | null;
  extraPoints?: Point2[];
  extraLines?: LineSegment[];
}

export function GeometryEditor({ borders, onChange, readonly, title, workArea, extraPoints, extraLines }: GeometryEditorProps) {
  const [dragging, setDragging] = useState<{ borderId: string; pointIndex: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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

  if (extraPoints) {
    extraPoints.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
  }

  if (extraLines) {
    extraLines.forEach(l => {
      minX = Math.min(minX, l.p1.x, l.p2.x);
      minY = Math.min(minY, l.p1.y, l.p2.y);
      maxX = Math.max(maxX, l.p1.x, l.p2.x);
      maxY = Math.max(maxY, l.p1.y, l.p2.y);
    });
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Add padding
  let padding = 50;
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 300; maxY = 150;
  }

  if (workArea) {
    minX = Math.min(minX, cx - workArea.width / 2);
    minY = Math.min(minY, cy - workArea.height / 2);
    maxX = Math.max(maxX, cx + workArea.width / 2);
    maxY = Math.max(maxY, cy + workArea.height / 2);
    padding = 100; // Add more padding if work area is shown
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

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent, borderId: string, pointIndex: number) => {
    if (readonly) return;
    e.preventDefault();
    setDragging({ borderId, pointIndex });
  };

  useEffect(() => {
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const coords = getMouseCoords(e);
      
      const newBorders = borders.map(b => {
        if (b.id === dragging.borderId) {
          const newPoints = [...b.polygon.points];
          newPoints[dragging.pointIndex] = { x: coords.x, y: coords.y };
          return {
            ...b,
            polygon: { points: newPoints },
            loop: { segments: [{ type: 'line' as const, points: newPoints }] }
          };
        }
        return b;
      });

      // Validate the move
      const draggedBorder = newBorders.find(b => b.id === dragging.borderId);
      if (draggedBorder) {
        let isValid = true;
        
        // Check intersections with other borders
        for (const other of newBorders) {
          if (other.id === draggedBorder.id) continue;
          
          if (polygonsIntersect(draggedBorder.polygon, other.polygon)) {
            isValid = false;
            break;
          }
        }

        // Check containment
        if (isValid) {
          const perimeter = newBorders.find(b => b.role === 'perimeter');
          if (perimeter) {
            if (draggedBorder.role === 'hole') {
              if (!polygonContainsPolygon(perimeter.polygon, draggedBorder.polygon, DEFAULT_TOLERANCES)) {
                isValid = false;
              }
            } else if (draggedBorder.role === 'perimeter') {
              for (const hole of newBorders.filter(b => b.role === 'hole')) {
                if (!polygonContainsPolygon(draggedBorder.polygon, hole.polygon, DEFAULT_TOLERANCES)) {
                  isValid = false;
                  break;
                }
              }
            }
          }
        }

        if (!isValid) return; // Ignore the move if it causes an intersection or containment violation
      }

      if (onChange) onChange(newBorders);
    };

    const handlePointerUp = () => {
      setDragging(null);
    };

    if (dragging) {
      window.addEventListener('mousemove', handlePointerMove, { passive: false });
      window.addEventListener('touchmove', handlePointerMove, { passive: false });
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchend', handlePointerUp);
    }

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [dragging, borders, onChange]);

  return (
    <div className="w-full aspect-[2/1] bg-gray-100 border border-gray-300 rounded overflow-hidden relative">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-full cursor-crosshair"
        style={{ touchAction: 'none' }}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {workArea && (
          <rect 
            x={cx - workArea.width / 2} 
            y={cy - workArea.height / 2} 
            width={workArea.width} 
            height={workArea.height} 
            fill="none" 
            stroke="#9ca3af" 
            strokeWidth="2" 
            strokeDasharray="10,10"
            vectorEffect="non-scaling-stroke"
          />
        )}

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

        {/* Strokes and interactive points */}
        {[...borders].sort((a, b) => (a.role === 'perimeter' ? -1 : 1)).map(border => {
          const pts = border.polygon.points;
          if (pts.length < 3) return null;
          const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
          
          return (
            <g key={border.id}>
              <polygon
                points={pointsStr}
                fill="none"
                stroke={border.id.endsWith('_orig') ? '#ef4444' : (border.role === 'hole' ? '#22c55e' : '#3b82f6')}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              {!readonly && pts.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="6"
                  fill="white"
                  stroke="#1f2937"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  className="cursor-move hover:fill-blue-200 transition-colors"
                  onMouseDown={(e) => handlePointerDown(e, border.id, i)}
                  onTouchStart={(e) => handlePointerDown(e, border.id, i)}
                />
              ))}
            </g>
          );
        })}

        {/* Extra Lines (e.g., bend marks) */}
        {extraLines && extraLines.map((line, i) => (
          <line
            key={`line-${i}`}
            x1={line.p1.x}
            y1={line.p1.y}
            x2={line.p2.x}
            y2={line.p2.y}
            stroke="#F50057"
            strokeWidth="2"
            strokeDasharray="4,4"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Extra Points (e.g., holes) */}
        {extraPoints && extraPoints.map((p, i) => (
          <circle
            key={`pt-${i}`}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="#FF9100"
            stroke="#E65100"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="absolute top-2 left-2 bg-white/80 px-2 py-1 rounded text-xs font-mono shadow">
        {title || (readonly ? 'Geometry Preview' : 'Interactive Geometry Editor')}
      </div>
    </div>
  );
}
