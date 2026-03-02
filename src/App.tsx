import { useState, useEffect } from 'react';
import { runValidationSuite, FullReport } from './geometry/validation';
import { GeometryEditor } from './components/GeometryEditor';
import { DxfDropzone } from './components/DxfDropzone';
import { VinylColorMapping } from './components/VinylColorMapping';
import { Border, DEFAULT_TOLERANCES, Element, Point2 } from './geometry/types';
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
  const [vinylRegions, setVinylRegions] = useState<{ color: string; elements: Element[] }[]>([]);
  const [showVinylMapping, setShowVinylMapping] = useState(false);
  const [currentView, setCurrentView] = useState<'p6' | 'backend'>('p6');
  
  // Backend in the future
  const [glassOffset, setGlassOffset] = useState<number>(2);
  const [backingOffset, setBackingOffset] = useState<number>(2);
  const [chamferLength, setChamferLength] = useState<number>(20);

  // Frontend
  const [glassRouterBitDiameter, setGlassRouterBitDiameter] = useState<number>(3);
  const [backingRouterBitDiameter, setBackingRouterBitDiameter] = useState<number>(3);
  const [materialThickness, setMaterialThickness] = useState<number>(4);
  const [cutDepth, setCutDepth] = useState<number>(0.2);
  const [isCutDepthThrough, setIsCutDepthThrough] = useState<boolean>(false);
  const [attachmentTrimCutDepth, setAttachmentTrimCutDepth] = useState<number>(0.5);
  const [isAttachmentTrimCutDepthHalf, setIsAttachmentTrimCutDepthHalf] = useState<boolean>(false);
  const [attachmentTrimRouterBitDiameter, setAttachmentTrimRouterBitDiameter] = useState<number>(3);
  const [glassType, setGlassType] = useState<string>('Opal');
  const [materialColor, setMaterialColor] = useState<string>('White');
  const [workArea, setWorkArea] = useState<string>('default');
  const [sideDepth, setSideDepth] = useState<number>(100);
  const [sideThickness, setSideThickness] = useState<number>(1.0);

  // Calculated
  const filletRadius = glassRouterBitDiameter / 2;

  useEffect(() => {
    const config = {
      glassOffset,
      backingOffset,
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
  }, [borders, glassOffset, backingOffset, chamferLength, filletRadius]);

  const handleBordersLoaded = (newBorders: Border[]) => {
    setBorders(prev => isImported ? [...prev, ...newBorders] : newBorders);
    setIsImported(true);
  };

  const handleClearGeometry = () => {
    setBorders([]);
    setIsImported(true);
  };

  const getWorkAreaDimensions = () => {
    if (workArea === '2500x1250') return { width: 2500, height: 1250 };
    if (workArea === '3000x1500') return { width: 3000, height: 1500 };
    return null;
  };

  const handleDownload = (type: 'glass' | 'backing' | 'vinyl' | 'kulg' | string) => {
    if (!report) return;
    
    const workAreaDims = getWorkAreaDimensions();

    if (type.startsWith('vinyl_color_')) {
      const color = type.replace('vinyl_color_', '');
      const region = vinylRegions.find(r => r.color === color);
      if (!region) return;
      
      const dxfStr = exportToDXF(region.elements, {
        type: `Vinyl (${color})`,
        routerBitDiameter: 0, // Vinyl doesn't have a router
        materialThickness,
        cutDepth: isCutDepthThrough ? 'Through' : cutDepth,
        glassType,
        materialColor,
        workArea: workAreaDims,
        attachmentTrimCutDepth: isAttachmentTrimCutDepthHalf ? 'Half' : attachmentTrimCutDepth,
        attachmentTrimRouterBitDiameter,
        sideDepth
      });
      const blob = new Blob([dxfStr], { type: 'application/dxf' });
      saveAs(blob, `vinyl_${color.replace('#', '')}_export.dxf`);
      return;
    }

    const elements = report.pipelineResult[type as keyof typeof report.pipelineResult] as any;
    
    let bitDiameter = 0;
    if (type === 'glass') bitDiameter = glassRouterBitDiameter;
    if (type === 'backing') bitDiameter = backingRouterBitDiameter;

    const dxfStr = exportToDXF(elements, {
      type,
      routerBitDiameter: bitDiameter,
      materialThickness,
      cutDepth: isCutDepthThrough ? 'Through' : cutDepth,
      glassType,
      materialColor,
      workArea: workAreaDims,
      attachmentTrimCutDepth: isAttachmentTrimCutDepthHalf ? 'Half' : attachmentTrimCutDepth,
      attachmentTrimRouterBitDiameter,
      sideDepth: type === 'kulg' ? sideDepth : undefined,
      sideThickness: type === 'kulg' ? sideThickness : undefined
    });
    const blob = new Blob([dxfStr], { type: 'application/dxf' });
    saveAs(blob, `${type}_export.dxf`);
  };

  const handleExtractAll = async () => {
    if (!report) return;
    const zip = new JSZip();
    const workAreaDims = getWorkAreaDimensions();
    
    ['glass', 'backing', 'vinyl', 'kulg'].forEach(type => {
      const elements = report.pipelineResult[type as keyof typeof report.pipelineResult] as any;
      
      let bitDiameter = 0;
      if (type === 'glass') bitDiameter = glassRouterBitDiameter;
      if (type === 'backing') bitDiameter = backingRouterBitDiameter;

      const dxfStr = exportToDXF(elements, {
        type,
        routerBitDiameter: bitDiameter,
        materialThickness,
        cutDepth: isCutDepthThrough ? 'Through' : cutDepth,
        glassType,
        materialColor,
        workArea: workAreaDims,
        attachmentTrimCutDepth: isAttachmentTrimCutDepthHalf ? 'Half' : attachmentTrimCutDepth,
        attachmentTrimRouterBitDiameter,
        sideDepth: type === 'kulg' ? sideDepth : undefined,
        sideThickness: type === 'kulg' ? sideThickness : undefined
      });
      zip.file(`${type}_export.dxf`, dxfStr);
    });

    // Add custom vinyl colors
    vinylRegions.forEach(region => {
      const dxfStr = exportToDXF(region.elements, {
        type: `Vinyl (${region.color})`,
        routerBitDiameter: 0,
        materialThickness,
        cutDepth: isCutDepthThrough ? 'Through' : cutDepth,
        glassType,
        materialColor,
        workArea: workAreaDims,
        attachmentTrimCutDepth: isAttachmentTrimCutDepthHalf ? 'Half' : attachmentTrimCutDepth,
        attachmentTrimRouterBitDiameter,
        sideDepth
      });
      zip.file(`vinyl_${region.color.replace('#', '')}_export.dxf`, dxfStr);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'lightbox_exports.zip');
  };

  if (!report) return <div>Loading...</div>;

  const { results, pipelineResult } = report;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-mono text-sm text-gray-800">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight">P6</h1>
        <nav className="flex gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200">
          <button 
            onClick={() => setCurrentView('p6')} 
            className={`px-4 py-1.5 rounded-md font-medium transition-colors ${currentView === 'p6' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Engine
          </button>
          <button 
            onClick={() => setCurrentView('backend')} 
            className={`px-4 py-1.5 rounded-md font-medium transition-colors ${currentView === 'backend' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            Backend Parameters
          </button>
        </nav>
      </header>

      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        {currentView === 'p6' ? (
          <div className="flex flex-col lg:flex-row gap-6">
            
            {/* Left Panel: Controls & Actions */}
            <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-6 sticky top-24 self-start">
              
              <section className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm flex flex-col gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2"><Settings size={18}/> Parameters</h2>
                
                <h3 className="font-bold mt-2 border-b border-gray-200 pb-1 text-green-800">Frontend (Manufacturing)</h3>
                
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-xs">Work Area</span>
                  <select value={workArea} onChange={e => setWorkArea(e.target.value)} className="border border-gray-300 p-1 rounded text-xs bg-white">
                    <option value="default">Default (As-is)</option>
                    <option value="2500x1250">2500 x 1250 mm</option>
                    <option value="3000x1500">3000 x 1500 mm</option>
                  </select>
                </label>

                <div className="flex gap-2">
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="font-semibold text-xs">Thickness</span>
                    <input type="number" min="0.5" step="0.5" value={materialThickness} onChange={e => setMaterialThickness(Number(e.target.value))} className="border border-gray-300 p-1 rounded text-xs bg-white w-full" />
                  </label>
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="font-semibold text-xs">Glass</span>
                    <select value={glassType} onChange={e => setGlassType(e.target.value)} className="border border-gray-300 p-1 rounded text-xs bg-white w-full">
                      <option value="Clear">Clear</option>
                      <option value="Opal">Opal</option>
                      <option value="Frosted">Frosted</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="font-semibold text-xs">Color</span>
                    <select value={materialColor} onChange={e => setMaterialColor(e.target.value)} className="border border-gray-300 p-1 rounded text-xs bg-white w-full">
                      <option value="White">White</option>
                      <option value="Black">Black</option>
                      <option value="Silver">Silver</option>
                    </select>
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-xs">Side Depth (mm)</span>
                    <span className="text-gray-600 font-bold text-xs">{sideDepth}</span>
                  </div>
                  <input type="range" min="30" max="200" step="1" value={sideDepth} onChange={e => setSideDepth(Number(e.target.value))} className="w-full" />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-xs">Side Thickness (mm)</span>
                    <span className="text-gray-600 font-bold text-xs">{sideThickness}</span>
                  </div>
                  <input type="range" min="0.8" max="2.5" step="0.1" value={sideThickness} onChange={e => setSideThickness(Number(e.target.value))} className="w-full" />
                </label>

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
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-xs">Cut Depth (mm)</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={isCutDepthThrough} onChange={e => setIsCutDepthThrough(e.target.checked)} />
                        Through
                      </label>
                      {!isCutDepthThrough && <span className="text-gray-600 font-bold text-xs w-6 text-right">{cutDepth}</span>}
                    </div>
                  </div>
                  {!isCutDepthThrough && (
                    <input type="range" min="0.1" max="5" step="0.1" value={cutDepth} onChange={e => setCutDepth(Number(e.target.value))} className="w-full" />
                  )}
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-xs">Attachment Trim Cut Depth (mm)</span>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={isAttachmentTrimCutDepthHalf} onChange={e => setIsAttachmentTrimCutDepthHalf(e.target.checked)} />
                        Half
                      </label>
                      {!isAttachmentTrimCutDepthHalf && <span className="text-gray-600 font-bold text-xs w-6 text-right">{attachmentTrimCutDepth}</span>}
                    </div>
                  </div>
                  {!isAttachmentTrimCutDepthHalf && (
                    <input type="range" min="0.1" max="5" step="0.1" value={attachmentTrimCutDepth} onChange={e => setAttachmentTrimCutDepth(Number(e.target.value))} className="w-full" />
                  )}
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-xs">Attachment Trim Router Bit Dia (mm)</span>
                    <span className="text-gray-600 font-bold text-xs">{attachmentTrimRouterBitDiameter}</span>
                  </div>
                  <input type="range" min="1" max="10" step="0.5" value={attachmentTrimRouterBitDiameter} onChange={e => setAttachmentTrimRouterBitDiameter(Number(e.target.value))} className="w-full" />
                </label>
        </section>
      </div>

      {/* Main Content */}
      <div className="flex-grow flex flex-col gap-8 min-w-0">
        <section className="flex flex-col gap-4">
          <div className="flex justify-between items-end border-b border-gray-300 pb-1">
            <div className="flex gap-4 items-end">
              <h2 className="text-xl font-semibold">Input Geometry</h2>
              {isImported && borders.length > 0 && (
                <div className="flex bg-gray-100 p-1 rounded-lg mb-1">
                  <button
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${!showVinylMapping ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                    onClick={() => setShowVinylMapping(false)}
                  >
                    Auto (Source)
                  </button>
                  <button
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${showVinylMapping ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                    onClick={() => setShowVinylMapping(true)}
                  >
                    Custom (Mapping)
                  </button>
                </div>
              )}
            </div>
            {isImported && borders.length > 0 && (
              <button onClick={handleClearGeometry} className="text-xs text-red-600 hover:text-red-800 font-semibold mb-1">
                Clear Geometry
              </button>
            )}
          </div>
          
          {!showVinylMapping ? (
            <DxfDropzone onBordersLoaded={handleBordersLoaded}>
              <GeometryEditor borders={borders} onChange={setBorders} readonly={isImported} title="Interactive Source Geometry" workArea={getWorkAreaDimensions()} />
            </DxfDropzone>
          ) : (
            <VinylColorMapping 
              borders={borders} 
              onBordersChange={setBorders} 
              onVinylRegionsChange={setVinylRegions} 
            />
          )}

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
            
            {vinylRegions.map(region => {
              return (
                <div key={region.color} className="flex flex-col gap-2">
                  <GeometryEditor borders={getBordersFromElements(region.elements)} readonly title={`Custom Vinyl (${region.color})`} />
                  <button onClick={() => handleDownload(`vinyl_color_${region.color}`)} className="flex items-center justify-center gap-2 bg-pink-50 hover:bg-pink-100 border border-pink-200 text-pink-700 py-2 rounded transition-colors text-xs font-bold">
                    <Download size={14} /> Download {region.color} DXF
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto mt-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Settings className="text-blue-600" /> Backend Parameters Dashboard</h2>
              <p className="text-gray-500 mb-8">These parameters will be managed by the backend in the future. Adjust them here to preview their effects on the generated DXF files.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-6">
                  <label className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <span className="font-semibold text-base">Glass Offset</span>
                      <span className="text-blue-600 font-bold text-lg">{glassOffset} <span className="text-sm text-gray-500 font-normal">mm</span></span>
                    </div>
                    <input type="range" min="0" max="20" step="0.5" value={glassOffset} onChange={e => setGlassOffset(Number(e.target.value))} className="w-full accent-blue-600" />
                    <p className="text-xs text-gray-500">Distance from the outer perimeter to the glass cut.</p>
                  </label>

                  <label className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <span className="font-semibold text-base">Backing Offset</span>
                      <span className="text-blue-600 font-bold text-lg">{backingOffset} <span className="text-sm text-gray-500 font-normal">mm</span></span>
                    </div>
                    <input type="range" min="0" max="20" step="0.5" value={backingOffset} onChange={e => setBackingOffset(Number(e.target.value))} className="w-full accent-blue-600" />
                    <p className="text-xs text-gray-500">Distance from the outer perimeter to the backing cut.</p>
                  </label>
                </div>

                <div className="flex flex-col gap-6">
                  <label className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <span className="font-semibold text-base">Chamfer Length</span>
                      <span className="text-blue-600 font-bold text-lg">{chamferLength} <span className="text-sm text-gray-500 font-normal">mm</span></span>
                    </div>
                    <input type="range" min="0" max="20" step="0.5" value={chamferLength} onChange={e => setChamferLength(Number(e.target.value))} className="w-full accent-blue-600" />
                    <p className="text-xs text-gray-500">Length of the chamfer applied to sharp corners.</p>
                  </label>

                  <div className="flex flex-col gap-2 p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex justify-between items-end">
                      <span className="font-semibold text-base">Fillet Radius</span>
                      <span className="text-gray-600 font-bold text-lg">{filletRadius} <span className="text-sm text-gray-500 font-normal">mm</span></span>
                    </div>
                    <p className="text-xs text-gray-500">Calculated automatically as half of the Glass Router Bit Diameter.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
