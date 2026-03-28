import { useState } from 'react';
import { LetterGenerator } from './components/LetterGenerator';
import { BoxGenerator } from './components/BoxGenerator';
import { Type, Box } from 'lucide-react';

export default function App() {
  const [mode, setMode] = useState<'letter' | 'box'>('letter');

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col font-mono text-sm text-gray-800">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Lightbox Engine</h1>
        </div>
        <nav className="flex gap-2 bg-gray-100 p-1 rounded-lg border border-gray-200">
          <button 
            onClick={() => setMode('letter')} 
            className={`px-4 py-1.5 rounded-md font-medium transition-colors flex items-center gap-2 ${mode === 'letter' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Type size={16} /> Letter Shape Generator
          </button>
          <button 
            onClick={() => setMode('box')} 
            className={`px-4 py-1.5 rounded-md font-medium transition-colors flex items-center gap-2 ${mode === 'box' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
          >
            <Box size={16} /> Box Generator
          </button>
        </nav>
      </header>

      {mode === 'letter' ? <LetterGenerator /> : <BoxGenerator />}
    </div>
  );
}
