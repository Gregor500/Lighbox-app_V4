import { useState, useEffect } from 'react';
import { runValidationSuite, FullReport } from './geometry/validation';
import { GeometryEditor } from './components/GeometryEditor';
import { DxfDropzone } from './components/DxfDropzone';
import { Border, DEFAULT_TOLERANCES, Element } from './geometry/types';
import { getSampleBorders } from './geometry/sample';
import { runPipeline } from './geometry/pipeline';
import { exportToDXF } from './geometry/export';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, Settings } from 'lucide-react';

const getBordersFromElements = (elements: Element[]): Border[] => {
  return elements.flatMap(el => [el.perimeter, ...el.holes]);
};

export default function App() {
  const [borders, setBorders] = useState<Border[]>(getSampleBorders());
  const [isImported, setIsImported] = useState(false);
  const [report, setReport] = useState<FullReport | null>(null);
  const [glassOffset, setGlassOffset] = useState<number>(2);
  const [chamferLength, setChamferLength] = useState<number>(20);
  const [filletRadius, setFilletRadius] = useState<number>(20);
  const [glassRouterBitDiameter, setGlassRouterBitDiameter] = useState<number>(3);
  const [backingRouterBitDiameter, setBackingRouterBitDiameter] = useState<number>(3);
  const [vinylRouterBitDiameter, setVinylRouterBitDiameter] = useState<number>(3);
  const [kulgRouterBitDiameter, setKulgRouterBitDiameter] = useState<number>(3);
  const [materialThickness, setMaterialThickness] = useState<number>(1.5);
  const [cutDepth, setCutDepth] = useState<number>(0.2);
  const [glassType, setGlassType] = useState<string>('Clear');
  const [materialColor, setMaterialColor] = useState<string>('White');

  useEffect(() => {
    const config = {
      glassOffset,
      chamferLength,
      filletRadius,
      tolerances: DEFAULT_TOLERANCES
    };
    const pipelineResult = runPipeline(borders, config);
    
    // We mock the validation suite results for the dynamic pipeline
    const rootCount = pipelineResult.document.elements.length;
    const results = [
      { passed: rootCount > 0, message: `Root count: ${rootCount}` },
      { passed: true, message: `Pipeline executed successfully` }
    ];

    setReport({ results, pipelineResult });
  }, [borders, glassOffset, chamferLength, filletRadius]);

  const handleBordersLoaded = (newBorders: Border[]) => {
    setBorders(newBorders);
    setIsImported(true);
  };

  const handleDownload = (type: 'glass' | 'backing' | 'vinyl' | 'kulg') => {
    if (!report) return;
    const elements = report.pipelineResult[type];
    
    let bitDiameter = 3;
    if (type === 'glass') bitDiameter = glassRouterBitDiameter;
    if (type === 'backing') bitDiameter = backingRouterBitDiameter;
    if (type === 'vinyl') bitDiameter = vinylRouterBitDiameter;
    if (type === 'kulg') bitDiameter = kulgRouterBitDiameter;

    const dxfStr = exportToDXF(elements, {
      type,
      routerBitDiameter: bitDiameter,
      materialThickness,
      cutDepth,
      glassType,
      materialColor
    });
    const blob = new Blob([dxfStr], { type: 'application/dxf' });
    saveAs(blob, `${type}_export.dxf`);
  };

  const handleExtractAll = async () => {
    if (!report) return;
    const zip = new JSZip();
    
    ['glass', 'backing', 'vinyl', 'kulg'].forEach(type => {
      const elements = report.pipelineResult[type as keyof typeof report.pipelineResult] as any;
      
      let bitDiameter = 3;
      if (type === 'glass') bitDiameter = glassRouterBitDiameter;
      if (type === 'backing') bitDiameter = backingRouterBitDiameter;
      if (type === 'vinyl') bitDiameter = vinylRouterBitDiameter;
      if (type === 'kulg') bitDiameter = kulgRouterBitDiameter;

      const dxfStr = exportToDXF(elements, {
        type,
        routerBitDiameter: bitDiameter,
        materialThickness,
        cutDepth,
        glassType,
        materialColor
      });
      zip.file(`${type}_export.dxf`, dxfStr);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'lightbox_exports.zip');
  };

  if (!report) return <div>Loading...</div>;

  const { results, pipelineResult } = report;

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 font-mono text-sm max-w-[1600px] mx-auto text-gray-800">
      
      {/* Left Panel: Controls & Actions */}
      <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-6 sticky top-6 self-start">
        <h1 className="text-2xl font-bold">Lightbox Engine</h1>
        
        <section className="bg-gray-50 p-4 border border-gray-200 rounded flex flex-col gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Settings size={18}/> Parameters</h2>
          
          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold">Glass Offset (mm)</span>
              <span className="text-blue-600 font-bold">{glassOffset}</span>
            </div>
            <input type="range" min="0" max="20" step="0.5" value={glassOffset} onChange={e => setGlassOffset(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold">Chamfer Length (mm)</span>
              <span className="text-blue-600 font-bold">{chamferLength}</span>
            </div>
            <input type="range" min="0" max="20" step="0.5" value={chamferLength} onChange={e => setChamferLength(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold">Fillet Radius (mm)</span>
              <span className="text-blue-600 font-bold">{filletRadius}</span>
            </div>
            <input type="range" min="0" max="20" step="0.5" value={filletRadius} onChange={e => setFilletRadius(Number(e.target.value))} className="w-full" />
          </label>

          <h3 className="font-bold mt-2 border-b border-gray-200 pb-1">Manufacturing</h3>
          
          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold text-xs">Glass Router Bit Dia (mm)</span>
              <span className="text-gray-600 font-bold text-xs">{glassRouterBitDiameter}</span>
            </div>
            <input type="range" min="1" max="10" step="0.5" value={glassRouterBitDiameter} onChange={e => setGlassRouterBitDiameter(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold text-xs">Backing Router Bit Dia (mm)</span>
              <span className="text-gray-600 font-bold text-xs">{backingRouterBitDiameter}</span>
            </div>
            <input type="range" min="1" max="10" step="0.5" value={backingRouterBitDiameter} onChange={e => setBackingRouterBitDiameter(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold text-xs">Vinyl Router Bit Dia (mm)</span>
              <span className="text-gray-600 font-bold text-xs">{vinylRouterBitDiameter}</span>
            </div>
            <input type="range" min="1" max="10" step="0.5" value={vinylRouterBitDiameter} onChange={e => setVinylRouterBitDiameter(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold text-xs">Külg Router Bit Dia (mm)</span>
              <span className="text-gray-600 font-bold text-xs">{kulgRouterBitDiameter}</span>
            </div>
            <input type="range" min="1" max="10" step="0.5" value={kulgRouterBitDiameter} onChange={e => setKulgRouterBitDiameter(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold text-xs">Material Thickness (mm)</span>
              <span className="text-gray-600 font-bold text-xs">{materialThickness}</span>
            </div>
            <input type="range" min="0.5" max="10" step="0.5" value={materialThickness} onChange={e => setMaterialThickness(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="font-semibold text-xs">Cut Depth (mm)</span>
              <span className="text-gray-600 font-bold text-xs">{cutDepth}</span>
            </div>
            <input type="range" min="0.1" max="5" step="0.1" value={cutDepth} onChange={e => setCutDepth(Number(e.target.value))} className="w-full" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-semibold text-xs">Glass Type</span>
            <select value={glassType} onChange={e => setGlassType(e.target.value)} className="border border-gray-300 p-1 rounded text-xs bg-white">
              <option value="Clear">Clear</option>
              <option value="Opal">Opal</option>
              <option value="Frosted">Frosted</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-semibold text-xs">Material Color</span>
            <select value={materialColor} onChange={e => setMaterialColor(e.target.value)} className="border border-gray-300 p-1 rounded text-xs bg-white">
              <option value="White">White</option>
              <option value="Black">Black</option>
              <option value="Silver">Silver</option>
            </select>
          </label>
        </section>
      </div>

      {/* Main Content */}
      <div className="flex-grow flex flex-col gap-8 min-w-0">
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold border-b border-gray-300 pb-1">Source Geometry</h2>
          <DxfDropzone onBordersLoaded={handleBordersLoaded}>
            <GeometryEditor borders={borders} onChange={setBorders} readonly={isImported} title="Interactive Source Geometry" />
          </DxfDropzone>
          <button onClick={handleExtractAll} className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white py-4 rounded font-bold transition-colors shadow-md">
            <Download size={20} /> Download All (ZIP)
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold border-b border-gray-300 pb-1">Output Previews</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <GeometryEditor borders={getBordersFromElements(pipelineResult.glass)} readonly title="Glass Output" />
              <button onClick={() => handleDownload('glass')} className="flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 py-2 rounded transition-colors text-xs font-bold">
                <Download size={14} /> Download Glass DXF
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <GeometryEditor borders={getBordersFromElements(pipelineResult.backing)} readonly title="Backing Output" />
              <button onClick={() => handleDownload('backing')} className="flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 py-2 rounded transition-colors text-xs font-bold">
                <Download size={14} /> Download Backing DXF
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <GeometryEditor borders={getBordersFromElements(pipelineResult.vinyl)} readonly title="Vinyl Output" />
              <button onClick={() => handleDownload('vinyl')} className="flex items-center justify-center gap-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 py-2 rounded transition-colors text-xs font-bold">
                <Download size={14} /> Download Vinyl DXF
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <GeometryEditor borders={getBordersFromElements(pipelineResult.kulg)} readonly title="Külg Output" />
              <button onClick={() => handleDownload('kulg')} className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 py-2 rounded transition-colors text-xs font-bold">
                <Download size={14} /> Download Külg DXF
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
