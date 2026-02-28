import React, { useState, useRef, useEffect } from 'react';
import { Border, Point2 } from '../geometry/types';

interface GeometryEditorProps {
  borders: Border[];
  onChange?: (borders: Border[]) => void;
  readonly?: boolean;
  title?: string;
}

export function GeometryEditor({ borders, onChange, readonly, title }: GeometryEditorProps) {
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

  // Add padding
  const padding = 50;
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
        
        {borders.map(border => {
          const pts = border.polygon.points;
          if (pts.length < 3) return null;
          const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
          
          return (
            <g key={border.id}>
              <polygon
                points={pointsStr}
                fill={border.role === 'hole' ? 'rgba(255, 0, 0, 0.1)' : 'rgba(0, 0, 255, 0.1)'}
                stroke={border.role === 'hole' ? '#ef4444' : '#3b82f6'}
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
      </svg>
      <div className="absolute top-2 left-2 bg-white/80 px-2 py-1 rounded text-xs font-mono shadow">
        {title || (readonly ? 'Geometry Preview' : 'Interactive Geometry Editor')}
      </div>
    </div>
  );
}
