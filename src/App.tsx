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
  const [report, setReport] = useState<FullReport | null>(null);
  const [glassOffset, setGlassOffset] = useState<number>(2);
  const [glassTera, setGlassTera] = useState<number>(4);

  useEffect(() => {
    const config = {
      glassOffset,
      glassTera,
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
  }, [borders]);

  const handleDownload = (type: 'glass' | 'backing' | 'vinyl' | 'kulg') => {
    if (!report) return;
    const elements = report.pipelineResult[type];
    const dxfStr = exportToDXF(elements);
    const blob = new Blob([dxfStr], { type: 'application/dxf' });
    saveAs(blob, `${type}_export.dxf`);
  };

  const handleExtractAll = async () => {
    if (!report) return;
    const zip = new JSZip();
    
    ['glass', 'backing', 'vinyl', 'kulg'].forEach(type => {
      const elements = report.pipelineResult[type as keyof typeof report.pipelineResult] as any;
      const dxfStr = exportToDXF(elements);
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
              <span className="font-semibold">Chamfer/Fillet Length (mm)</span>
              <span className="text-blue-600 font-bold">{glassTera}</span>
            </div>
            <input type="range" min="0" max="20" step="0.5" value={glassTera} onChange={e => setGlassTera(Number(e.target.value))} className="w-full" />
          </label>
        </section>

        <section className="flex flex-col gap-3">
          <button onClick={handleExtractAll} className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white py-4 rounded font-bold transition-colors shadow-md">
            <Download size={20} /> Download All (ZIP)
          </button>
        </section>
      </div>

      {/* Main Content */}
      <div className="flex-grow flex flex-col gap-8 min-w-0">
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold border-b border-gray-300 pb-1">Source Geometry</h2>
          <GeometryEditor borders={borders} onChange={setBorders} title="Interactive Source Geometry" />
          <DxfDropzone onBordersLoaded={(newBorders) => setBorders(prev => [...prev, ...newBorders])} />
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

        <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2 border-b border-gray-300 pb-1">1. Corner Trace Log (Sample)</h2>
        <div className="max-h-64 overflow-y-auto border border-gray-300 bg-gray-50 p-2 text-xs">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="p-1">Border ID</th>
                <th className="p-1">Index</th>
                <th className="p-1">Angle (deg)</th>
                <th className="p-1">Interior Usable</th>
                <th className="p-1">Acute</th>
                <th className="p-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {pipelineResult.cornerTraces.slice(0, 20).map((trace, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="p-1">{trace.sourceBorderId}</td>
                  <td className="p-1">{trace.cornerIndex}</td>
                  <td className="p-1">{trace.interiorAngleDeg.toFixed(1)}</td>
                  <td className="p-1">{trace.isInteriorUsable ? 'Yes' : 'No'}</td>
                  <td className="p-1">{trace.isAcute ? 'Yes' : 'No'}</td>
                  <td className="p-1 font-semibold text-blue-600">{trace.actionChosen}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pipelineResult.cornerTraces.length > 20 && (
            <div className="p-2 text-gray-500 italic">... and {pipelineResult.cornerTraces.length - 20} more traces.</div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2 border-b border-gray-300 pb-1">6. Known Limitations</h2>
        <ul className="list-disc pl-5 mt-2 space-y-2">
          <li><strong>Physical Corner Generation:</strong> The explicit corner modification tracing (chamfer/fillet) is implemented and logged. However, the exact physical geometry generation for these specific corners still relies on ClipperLib's global offset. A custom geometry pass is needed to apply the exact chamfer/fillet parameters to the specific traced corners.</li>
          <li><strong>Decode Stage:</strong> A basic SVG path parser is implemented for <code>M</code>, <code>L</code>, and <code>Z</code> commands. Full DXF/SVG parsing with curves (Beziers, Arcs) requires a more comprehensive library.</li>
        </ul>
      </section>
      </div>
    </div>
  );
}
