import React, { useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { decodeDXF } from '../geometry/decode';
import { Border, DEFAULT_TOLERANCES, Diagnostic } from '../geometry/types';

interface DxfDropzoneProps {
  onBordersLoaded: (borders: Border[]) => void;
}

export function DxfDropzone({ onBordersLoaded }: DxfDropzoneProps) {
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.toLowerCase().endsWith('.dxf')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const diagnostics: Diagnostic[] = [];
        const borders = decodeDXF(text, DEFAULT_TOLERANCES, diagnostics);
        if (borders.length > 0) {
          onBordersLoaded(borders);
        } else {
          alert('No valid geometry found in DXF file.');
        }
      };
      reader.readAsText(file);
    } else {
      alert('Please drop a valid .dxf file');
    }
  }, [onBordersLoaded]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      className="w-full h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-blue-400 transition-colors cursor-pointer"
    >
      <UploadCloud className="w-8 h-8 mb-2" />
      <span className="font-medium">Drag & Drop DXF file here</span>
      <span className="text-xs mt-1">Replaces current geometry</span>
    </div>
  );
}
