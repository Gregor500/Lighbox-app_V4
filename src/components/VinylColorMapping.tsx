import React, { useState, useRef } from 'react';
import { Border, Point2, Element, DEFAULT_TOLERANCES } from '../geometry/types';
import { floodFillAndTrace } from '../geometry/flood-fill';
import { polygonContainsPolygon, polygonArea } from '../geometry/math';

interface VinylColorMappingProps {
  borders: Border[];
  onBordersChange: (borders: Border[]) => void;
  onVinylRegionsChange: (regions: { color: string; elements: Element[] }[]) => void;
}

export function VinylColorMapping({ borders, onBordersChange, onVinylRegionsChange }: VinylColorMappingProps) {
  const [mode, setMode] = useState<'shape' | 'paint'>('shape');
  const [selectedColor, setSelectedColor] = useState<string>('#FF0000');
  const [vinylRegions, setVinylRegions] = useState<{ color: string; elements: Element[] }[]>([]);
  
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

  const padding = 50;
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 300; maxY = 150;
  }
  const viewBox = `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;

  const getMouseCoords = (e: React.MouseEvent | React.TouchEvent) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgP = pt.matrixTransform(ctm.inverse());

    return { x: svgP.x, y: svgP.y };
  };

  const handleShapeClick = (borderId: string) => {
    if (mode !== 'shape') return;
    const newBorders = borders.map(b => {
      if (b.id === borderId) {
        const newRole = b.role === 'perimeter' ? 'hole' : 'perimeter';
        return { ...b, role: newRole as any, manualRole: newRole as any };
      }
      return b;
    });
    onBordersChange(newBorders);
  };

  const handlePaintClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode !== 'paint') return;
    const coords = getMouseCoords(e);
    
    const newPolygon = floodFillAndTrace(borders, coords);
    if (newPolygon && newPolygon.length > 2) {
      // Find holes inside this newPolygon
      const holes: Border[] = [];
      for (const b of borders) {
        if (b.role === 'hole') {
          if (polygonContainsPolygon({ points: newPolygon }, b.polygon, DEFAULT_TOLERANCES)) {
            holes.push(b);
          }
        }
      }
      
      const newElement: Element = {
        id: `vinyl_${Date.now()}`,
        perimeter: {
          id: `p_${Date.now()}`,
          loop: { segments: [] },
          polygon: { points: newPolygon },
          role: 'perimeter',
          depth: 0,
          parentId: null
        },
        holes: holes
      };

      const newRegions = [...vinylRegions];
      let colorGroup = newRegions.find(r => r.color === selectedColor);
      if (!colorGroup) {
        colorGroup = { color: selectedColor, elements: [] };
        newRegions.push(colorGroup);
      }
      colorGroup.elements.push(newElement);
      setVinylRegions(newRegions);
      onVinylRegionsChange(newRegions);
    }
  };

  const clearVinyls = () => {
    setVinylRegions([]);
    onVinylRegionsChange([]);
  };

  const commonColors = ['#FF0000', '#0000FF', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF', '#000000', '#FFFFFF'];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {mode === 'shape' ? (
            <>Click on any closed curve to toggle it between a <strong>Perimeter</strong> (blue) and a <strong>Hole</strong> (white/green). This defines the usable shape.</>
          ) : (
            <>Select a color and click inside regions to fill them with vinyl.</>
          )}
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'shape' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            onClick={() => setMode('shape')}
          >
            1. Define Shape
          </button>
          <button
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'paint' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
            onClick={() => setMode('paint')}
          >
            2. Paint Bucket
          </button>
        </div>
      </div>

      {mode === 'paint' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {commonColors.map(c => (
                <button
                  key={c}
                  className={`w-6 h-6 rounded-full border-2 ${selectedColor === c ? 'border-blue-500 scale-110' : 'border-gray-300'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <div className="h-6 w-px bg-gray-300 mx-1" />
            <input
              type="color"
              value={selectedColor}
              onChange={(e) => setSelectedColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer"
            />
            <span className="text-xs font-mono text-gray-500">{selectedColor}</span>
            <div className="flex-grow" />
            <button onClick={clearVinyls} className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 bg-red-50 rounded">
              Clear Fills
            </button>
          </div>
        </div>
      )}

      <div className="w-full aspect-[2/1] bg-gray-50 border border-gray-300 rounded overflow-hidden relative">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className={`w-full h-full ${mode === 'paint' ? 'cursor-crosshair' : 'cursor-pointer'}`}
          onClick={mode === 'paint' ? handlePaintClick : undefined}
        >
          <defs>
            <pattern id="grid-vinyl" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid-vinyl)" />
          
          {/* Draw filled regions */}
          {vinylRegions.map(region => (
            <g key={region.color}>
              {region.elements.map((elem, i) => (
                <g key={i}>
                  <polygon
                    points={elem.perimeter.polygon.points.map(p => `${p.x},${p.y}`).join(' ')}
                    fill={region.color}
                    fillOpacity={0.8}
                    stroke={region.color}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  {elem.holes.map((hole, j) => (
                    <polygon
                      key={`hole-${j}`}
                      points={hole.polygon.points.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="#FFFFFF"
                      stroke={region.color}
                      strokeWidth="1"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              ))}
            </g>
          ))}

          {/* Fill path for all borders using evenodd to show the actual shape without hiding lines */}
          {mode === 'shape' && (
            <path
              d={borders.map(border => {
                const pts = border.polygon.points;
                if (pts.length < 3) return '';
                return `M ${pts[0].x},${pts[0].y} ` + pts.slice(1).map(p => `L ${p.x},${p.y}`).join(' ') + ' Z';
              }).join(' ')}
              fill="rgba(0, 0, 255, 0.1)"
              fillRule="evenodd"
              className="pointer-events-none"
            />
          )}

          {/* Draw borders for interaction */}
          {[...borders].sort((a, b) => Math.abs(polygonArea(b.polygon)) - Math.abs(polygonArea(a.polygon))).map(border => {
            const pts = border.polygon.points;
            if (pts.length < 3) return null;
            const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
            
            return (
              <polygon
                key={border.id}
                points={pointsStr}
                fill="transparent"
                stroke={border.role === 'hole' ? '#22c55e' : '#3b82f6'}
                strokeWidth={mode === 'shape' ? "2" : "1"}
                vectorEffect="non-scaling-stroke"
                onClick={mode === 'shape' ? (e) => { e.stopPropagation(); handleShapeClick(border.id); } : undefined}
                className={mode === 'shape' ? 'hover:stroke-4 transition-all cursor-pointer' : 'pointer-events-none'}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
