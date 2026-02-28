import React, { useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { decodeDXF } from '../geometry/decode';
import { Border, DEFAULT_TOLERANCES, Diagnostic } from '../geometry/types';

interface DxfDropzoneProps {
  onBordersLoaded: (borders: Border[]) => void;
  children?: React.ReactNode;
}

export function DxfDropzone({ onBordersLoaded, children }: DxfDropzoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);

  const onDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files as Iterable<File>).filter(f => f.name.toLowerCase().endsWith('.dxf'));
    
    if (files.length === 0) {
      alert('Please drop valid .dxf files');
      return;
    }

    try {
      const filePromises = files.map(file => {
        return new Promise<Border[]>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const text = event.target?.result as string;
            const diagnostics: Diagnostic[] = [];
            const borders = decodeDXF(text, DEFAULT_TOLERANCES, diagnostics);
            resolve(borders);
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsText(file);
        });
      });

      const results = await Promise.all(filePromises);
      const allBorders = results.flat();

      if (allBorders.length > 0) {
        onBordersLoaded(allBorders);
      } else {
        alert('No valid geometry found in DXF files.');
      }
    } catch (error) {
      console.error(error);
      alert('Error reading DXF files.');
    }
  }, [onBordersLoaded]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className="relative w-full"
    >
      {children}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-blue-50/90 border-2 border-dashed border-blue-400 rounded-lg text-blue-600 transition-colors">
          <UploadCloud className="w-12 h-12 mb-2" />
          <span className="font-medium text-lg">Drop DXF file(s) here</span>
          <span className="text-sm mt-1">Appends to current geometry</span>
        </div>
      )}
      {!children && (
        <div className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-blue-400 transition-colors cursor-pointer">
          <UploadCloud className="w-8 h-8 mb-2" />
          <span className="font-medium">Drag & Drop DXF file(s) here</span>
          <span className="text-xs mt-1">Appends to current geometry</span>
        </div>
      )}
    </div>
  );
}
