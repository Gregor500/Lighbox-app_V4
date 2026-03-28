import { useState, useEffect } from 'react';
import { runValidationSuite, FullReport } from '../geometry/validation';
import { GeometryEditor } from './GeometryEditor';
import { Border, DEFAULT_TOLERANCES, Element, Point2 } from '../geometry/types';
import { runPipeline } from '../geometry/pipeline';
import { exportToDXF } from '../geometry/export';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Download, Settings, Box } from 'lucide-react';

const getBordersFromElements = (elements: Element[]): Border[] => {
  return elements.flatMap(el => [el.perimeter, ...el.holes]);
};

const getFrameBorders = (elements: Element[]): Border[] => {
  return elements.flatMap(el => (el.frame || []).map(f => ({
    id: f.id,
    polygon: f.stripOutline,
    role: 'perimeter',
    loop: { segments: [{ type: 'line', points: f.stripOutline.points }] },
    depth: 0,
    parentId: null
  } as Border)));
};

const getFrameLines = (elements: Element[]): any[] => {
  return elements.flatMap(el => (el.frame || []).flatMap(f => f.bendMarks));
};

const getFrameHoles = (elements: Element[]): Point2[] => {
  return elements.flatMap(el => (el.frame || []).flatMap(f => f.holes));
};

const getRearFrameBorders = (elements: Element[]): Border[] => {
  return elements.flatMap(el => {
    if (!el.rearFrame) return [];
    const rf = el.rearFrame;
    const polys = [...rf.outerOutline, ...rf.innerOutline, ...rf.centerline];
    return polys.map((p, i) => ({
      id: `${rf.id}_poly_${i}`,
      polygon: p,
      role: 'perimeter',
      loop: { segments: [{ type: 'line', points: p.points }] },
      depth: 0,
      parentId: null
    } as Border));
  });
};

const getRearFrameHoles = (elements: Element[]): Point2[] => {
  return elements.flatMap(el => el.rearFrame?.holes || []);
};

const getBackingHoles = (elements: Element[]): Point2[] => {
  return elements.flatMap(el => el.mountingHoles || []);
};

function generateBoxBorder(width: number, height: number): Border[] {
  return [
    {
      id: 'box_perimeter',
      role: 'perimeter',
      depth: 0,
      parentId: null,
      polygon: {
        points: [
          { x: 0, y: 0 },
          { x: width, y: 0 },
          { x: width, y: height },
          { x: 0, y: height }
        ]
      },
      loop: {
        segments: [
          { type: 'line', points: [{ x: 0, y: 0 }, { x: width, y: 0 }] },
          { type: 'line', points: [{ x: width, y: 0 }, { x: width, y: height }] },
          { type: 'line', points: [{ x: width, y: height }, { x: 0, y: height }] },
          { type: 'line', points: [{ x: 0, y: height }, { x: 0, y: 0 }] }
        ]
      }
    }
  ];
}

export function BoxGenerator() {
  const [boxWidth, setBoxWidth] = useState<number>(500);
  const [boxHeight, setBoxHeight] = useState<number>(300);
  const [report, setReport] = useState<FullReport | null>(null);
  
  // Frontend
  const [glassRouterBitDiameter, setGlassRouterBitDiameter] = useState<number>(3);
  const [backingRouterBitDiameter, setBackingRouterBitDiameter] = useState<number>(3);
  const [materialThickness, setMaterialThickness] = useState<number>(4);
  const [cutDepth, setCutDepth] = useState<number>(0.2);
  const [isCutDepthThrough, setIsCutDepthThrough] = useState<boolean>(true);
  const [attachmentTrimCutDepth, setAttachmentTrimCutDepth] = useState<number>(0.5);
  const [isAttachmentTrimCutDepthHalf, setIsAttachmentTrimCutDepthHalf] = useState<boolean>(true);
  const [attachmentTrimRouterBitDiameter, setAttachmentTrimRouterBitDiameter] = useState<number>(3);
  const [glassType, setGlassType] = useState<string>('Opal');
  const [materialColor, setMaterialColor] = useState<string>('White');
  const [workArea, setWorkArea] = useState<string>('default');
  const [sideDepth, setSideDepth] = useState<number>(100);
  const [sideThickness, setSideThickness] = useState<number>(1.0);
  const [frameFlange, setFrameFlange] = useState<number>(15);
  const [frameHoleSpacing, setFrameHoleSpacing] = useState<number>(50);
  const [rearFrameInset, setRearFrameInset] = useState<number>(20);
  const [rearFrameProfileWidth, setRearFrameProfileWidth] = useState<number>(30);
  const [rearFrameHoleSpacing, setRearFrameHoleSpacing] = useState<number>(200);

  // Calculated
  const filletRadius = glassRouterBitDiameter / 2;

  useEffect(() => {
    const borders = generateBoxBorder(boxWidth, boxHeight);
    const config = {
      glassOffset: 2,
      backingOffset: 2,
      chamferLength: 0, // No chamfer needed for a simple box
      filletRadius,
      frameDepth: sideDepth,
      frameFlange,
      frameHoleSpacing,
      rearFrameInset,
      rearFrameProfileWidth,
      rearFrameHoleSpacing,
      tolerances: DEFAULT_TOLERANCES
    };
    const pipelineResult = runPipeline(borders, config);
    
    const rootCount = pipelineResult.document.elements.length;
    const results = [
      { passed: rootCount > 0, message: `Root count: ${rootCount}` },
      { passed: true, message: `Pipeline executed successfully` }
    ];

    setReport({ results, pipelineResult });
  }, [boxWidth, boxHeight, filletRadius, sideDepth, frameFlange, frameHoleSpacing, rearFrameInset, rearFrameProfileWidth, rearFrameHoleSpacing]);

  const getWorkAreaDimensions = () => {
    if (workArea === '2500x1250') return { width: 2500, height: 1250 };
    if (workArea === '3000x1500') return { width: 3000, height: 1500 };
    return null;
  };

  const handleDownload = (type: 'glass' | 'backing' | 'vinyl' | 'frame' | string) => {
    if (!report) return;
    
    const workAreaDims = getWorkAreaDimensions();

    if (type === 'frame') {
      const elements = report.pipelineResult.backing;
      const dxfStr = exportToDXF(elements, {
        type: 'frame',
        routerBitDiameter: 0,
        materialThickness,
        cutDepth: isCutDepthThrough ? 'Through' : cutDepth,
        glassType,
        materialColor,
        workArea: workAreaDims,
        attachmentTrimCutDepth: isAttachmentTrimCutDepthHalf ? 'Half' : attachmentTrimCutDepth,
        attachmentTrimRouterBitDiameter,
        sideDepth,
        sideThickness
      });
      const blob = new Blob([dxfStr], { type: 'application/dxf' });
      saveAs(blob, `frame_export.dxf`);
      return;
    }

    if (type === 'rearFrame') {
      const elements = report.pipelineResult.backing;
      const dxfStr = exportToDXF(elements, {
        type: 'rearFrame',
        routerBitDiameter: 0,
        materialThickness,
        cutDepth: isCutDepthThrough ? 'Through' : cutDepth,
        glassType,
        materialColor,
        workArea: workAreaDims,
        attachmentTrimCutDepth: isAttachmentTrimCutDepthHalf ? 'Half' : attachmentTrimCutDepth,
        attachmentTrimRouterBitDiameter,
        sideDepth,
        sideThickness
      });
      const blob = new Blob([dxfStr], { type: 'application/dxf' });
      saveAs(blob, `rear_frame_export.dxf`);
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
      sideDepth: type === 'frame' ? sideDepth : undefined,
      sideThickness: type === 'frame' ? sideThickness : undefined
    });
    const blob = new Blob([dxfStr], { type: 'application/dxf' });
    saveAs(blob, `${type}_export.dxf`);
  };

  const handleExtractAll = async () => {
    if (!report) return;
    const zip = new JSZip();
    const workAreaDims = getWorkAreaDimensions();
    
    ['glass', 'backing', 'vinyl', 'frame', 'rearFrame'].forEach(type => {
      const elements = (type === 'frame' || type === 'rearFrame') ? report.pipelineResult.backing : report.pipelineResult[type as keyof typeof report.pipelineResult] as any;
      
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
        sideDepth: type === 'frame' ? sideDepth : undefined,
        sideThickness: type === 'frame' ? sideThickness : undefined
      });
      zip.file(`${type}_export.dxf`, dxfStr);
    });

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'box_exports.zip');
  };

  if (!report) return <div>Loading...</div>;

  const { pipelineResult } = report;

  return (
    <div className="flex flex-col font-mono text-sm text-gray-800">
      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        <div className="flex flex-col lg:flex-row gap-6">
          
          {/* Left Panel: Controls & Actions */}
          <div className="w-full lg:w-72 flex-shrink-0 flex flex-col gap-6 sticky top-24 self-start">
            
            <section className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm flex flex-col gap-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Box size={18}/> Box Dimensions</h2>
              
              <div className="flex gap-2">
                <label className="flex flex-col gap-1 flex-1">
                  <span className="font-semibold text-xs">Width (mm)</span>
                  <input type="number" min="50" step="10" value={boxWidth} onChange={e => setBoxWidth(Number(e.target.value))} className="border border-gray-300 p-1 rounded text-xs bg-white w-full" />
                </label>
                <label className="flex flex-col gap-1 flex-1">
                  <span className="font-semibold text-xs">Height (mm)</span>
                  <input type="number" min="50" step="10" value={boxHeight} onChange={e => setBoxHeight(Number(e.target.value))} className="border border-gray-300 p-1 rounded text-xs bg-white w-full" />
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
                  <span className="font-semibold text-xs">Frame Flange (mm)</span>
                  <span className="text-gray-600 font-bold text-xs">{frameFlange}</span>
                </div>
                <input type="range" min="5" max="50" step="1" value={frameFlange} onChange={e => setFrameFlange(Number(e.target.value))} className="w-full" />
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-xs">Frame Hole Spacing (mm)</span>
                  <span className="text-gray-600 font-bold text-xs">{frameHoleSpacing}</span>
                </div>
                <input type="range" min="20" max="200" step="5" value={frameHoleSpacing} onChange={e => setFrameHoleSpacing(Number(e.target.value))} className="w-full" />
              </label>

              <h3 className="font-bold mt-2 border-b border-gray-200 pb-1 text-green-800">Rear Support Frame</h3>

              <label className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-xs">Frame Inset (mm)</span>
                  <span className="text-gray-600 font-bold text-xs">{rearFrameInset}</span>
                </div>
                <input type="range" min="0" max="100" step="1" value={rearFrameInset} onChange={e => setRearFrameInset(Number(e.target.value))} className="w-full" />
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-xs">Profile Width (mm)</span>
                  <span className="text-gray-600 font-bold text-xs">{rearFrameProfileWidth}</span>
                </div>
                <input type="range" min="10" max="100" step="1" value={rearFrameProfileWidth} onChange={e => setRearFrameProfileWidth(Number(e.target.value))} className="w-full" />
              </label>

              <label className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-xs">Hole Spacing (mm)</span>
                  <span className="text-gray-600 font-bold text-xs">{rearFrameHoleSpacing}</span>
                </div>
                <input type="range" min="50" max="500" step="10" value={rearFrameHoleSpacing} onChange={e => setRearFrameHoleSpacing(Number(e.target.value))} className="w-full" />
              </label>

              <h3 className="font-bold mt-2 border-b border-gray-200 pb-1 text-green-800">Manufacturing</h3>
              
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-xs">Work Area</span>
                <select value={workArea} onChange={e => setWorkArea(e.target.value)} className="border border-gray-300 p-1 rounded text-xs bg-white">
                  <option value="default">Default (none)</option>
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
              </div>
            </section>
          </div>

          {/* Main Content */}
          <div className="flex-grow flex flex-col gap-8 min-w-0">
            <section className="flex flex-col gap-4">
              <div className="flex justify-between items-end border-b border-gray-300 pb-1">
                <h2 className="text-xl font-semibold">Box Preview</h2>
              </div>
              
              <GeometryEditor borders={generateBoxBorder(boxWidth, boxHeight)} readonly title="Box Dimensions Preview" workArea={getWorkAreaDimensions()} />

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
                  <GeometryEditor 
                    borders={getBordersFromElements(pipelineResult.backing)} 
                    extraPoints={getBackingHoles(pipelineResult.backing)}
                    readonly 
                    title="Backing Output" 
                  />
                  <button onClick={() => handleDownload('backing')} className="flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 py-2 rounded transition-colors text-xs font-bold">
                    <Download size={14} /> Download Backing DXF
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <GeometryEditor 
                    borders={getFrameBorders(pipelineResult.backing)} 
                    extraLines={getFrameLines(pipelineResult.backing)}
                    extraPoints={getFrameHoles(pipelineResult.backing)}
                    readonly 
                    title="Side Frame Output" 
                  />
                  <button onClick={() => handleDownload('frame')} className="flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 py-2 rounded transition-colors text-xs font-bold">
                    <Download size={14} /> Download Side Frame DXF
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  <GeometryEditor 
                    borders={getRearFrameBorders(pipelineResult.backing)} 
                    extraPoints={getRearFrameHoles(pipelineResult.backing)}
                    readonly 
                    title="Rear Support Frame Output" 
                  />
                  <button onClick={() => handleDownload('rearFrame')} className="flex items-center justify-center gap-2 bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 py-2 rounded transition-colors text-xs font-bold">
                    <Download size={14} /> Download Rear Frame DXF
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
