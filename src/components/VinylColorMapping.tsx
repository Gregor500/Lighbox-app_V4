import React, { useState, useRef, useEffect } from 'react';
import { Border, Point2 } from '../geometry/types';
import { floodFillAndTrace } from '../geometry/flood-fill';

interface VinylColorMappingProps {
  borders: Border[];
  onBordersChange: (borders: Border[]) => void;
  onVinylRegionsChange: (regions: { color: string; polygons: Point2[][] }[]) => void;
}

export function VinylColorMapping({ borders, onBordersChange, onVinylRegionsChange }: VinylColorMappingProps) {
  const [mode, setMode] = useState<'shape' | 'paint'>('shape');
  const [selectedColor, setSelectedColor] = useState<string>('#FF0000');
  const [vinylRegions, setVinylRegions] = useState<{ color: string; polygons: Point2[][] }[]>([]);
  
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
      const newRegions = [...vinylRegions];
      let colorGroup = newRegions.find(r => r.color === selectedColor);
      if (!colorGroup) {
        colorGroup = { color: selectedColor, polygons: [] };
        newRegions.push(colorGroup);
      }
      colorGroup.polygons.push(newPolygon);
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
    <div className="flex flex-col gap-4 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Vinyl Color Mapping</h3>
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

      {mode === 'shape' && (
        <div className="text-sm text-gray-600">
          Click on any closed curve to toggle it between a <strong>Perimeter</strong> (blue) and a <strong>Hole</strong> (red). This defines the usable shape.
        </div>
      )}

      {mode === 'paint' && (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-gray-600">
            Select a color and click inside regions to fill them with vinyl.
          </div>
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
              {region.polygons.map((poly, i) => (
                <polygon
                  key={i}
                  points={poly.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={region.color}
                  fillOpacity={0.8}
                  stroke={region.color}
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ))}

          {/* Draw borders */}
          {borders.map(border => {
            const pts = border.polygon.points;
            if (pts.length < 3) return null;
            const pointsStr = pts.map(p => `${p.x},${p.y}`).join(' ');
            
            return (
              <polygon
                key={border.id}
                points={pointsStr}
                fill={mode === 'shape' ? (border.role === 'hole' ? 'rgba(255, 0, 0, 0.1)' : 'rgba(0, 0, 255, 0.1)') : 'none'}
                stroke={border.role === 'hole' ? '#ef4444' : '#3b82f6'}
                strokeWidth={mode === 'shape' ? "2" : "1"}
                vectorEffect="non-scaling-stroke"
                onClick={mode === 'shape' ? (e) => { e.stopPropagation(); handleShapeClick(border.id); } : undefined}
                className={mode === 'shape' ? 'hover:stroke-4 transition-all' : 'pointer-events-none opacity-50'}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
