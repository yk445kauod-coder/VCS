import React from 'react';
import { LessonOutput } from '../types';
import DiagramRenderer from './DiagramRenderer';
import { StickyNote, Lightbulb, Map } from 'lucide-react';

interface Props {
  output: LessonOutput;
}

const SmartBoard: React.FC<Props> = ({ output }) => {
  return (
    <div className="bg-[#2d3748] p-3 rounded-2xl shadow-2xl border-8 border-[#1a202c] relative overflow-hidden ring-4 ring-slate-200">
      <div className="bg-[#2d3748] h-full w-full rounded-lg p-6 relative">
          
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-5 pointer-events-none" 
              style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
          </div>

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
            
            {/* Sticky Notes Section */}
            <div className="space-y-8">
              <div className="bg-[#fef3c7] p-6 shadow-xl -rotate-1 transform transition hover:rotate-0 hover:scale-[1.02] duration-300 relative">
                 <div className="w-32 h-8 bg-[#fcd34d] opacity-50 absolute -top-4 left-[30%] rotate-2" />
                 <div className="flex items-center gap-2 mb-4 border-b-2 border-yellow-500/20 pb-2">
                    <Lightbulb className="text-yellow-600 fill-yellow-600" size={24} />
                    <h3 className="font-bold text-2xl text-slate-800 font-handwriting">نقاط ذهبية</h3>
                 </div>
                 <p className="font-medium text-lg text-slate-800 leading-relaxed font-handwriting">
                   {output.summary}
                 </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                 {output.infographicData.map((fact, i) => (
                    <div key={i} className={`p-4 shadow-lg flex items-center gap-4 ${
                        i % 2 === 0 ? 'bg-[#ccfbf1] rotate-1' : 'bg-[#e0e7ff] -rotate-1'
                    }`}>
                       <span className="font-black text-3xl opacity-20">#{i + 1}</span>
                       <p className="font-bold text-slate-700">{fact}</p>
                    </div>
                 ))}
              </div>
            </div>

            {/* Diagram Section */}
            <div className="flex flex-col h-full bg-white/90 backdrop-blur-sm p-2 rounded-xl shadow-xl transform rotate-1 border-4 border-white/50">
                <div className="bg-white rounded-lg p-4 h-full border border-slate-100 flex flex-col">
                    <div className="flex items-center justify-center gap-2 mb-4 pb-2 border-b border-dashed border-slate-300 shrink-0">
                        <Map className="text-indigo-500" />
                        <h3 className="font-bold text-slate-600 uppercase tracking-widest text-sm">Flow Diagram</h3>
                    </div>
                    <div className="flex-1 overflow-hidden">
                       <DiagramRenderer content={output.visualDiagram || output.mermaidCode || ''} />
                    </div>
                </div>
            </div>
          </div>
      </div>
      
      {/* Tray */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-4 bg-[#1a202c] px-6 py-2 rounded-b-xl shadow-lg border-t border-slate-700">
          <div className="w-16 h-2 bg-red-400 rounded-full shadow-[0_0_5px_rgba(248,113,113,0.5)]"></div>
          <div className="w-16 h-2 bg-blue-400 rounded-full shadow-[0_0_5px_rgba(96,165,250,0.5)]"></div>
          <div className="w-16 h-2 bg-green-400 rounded-full shadow-[0_0_5px_rgba(74,222,128,0.5)]"></div>
          <div className="w-10 h-6 bg-slate-500 rounded-sm ml-4 shadow-md border-b-4 border-slate-700"></div>
      </div>
    </div>
  );
};

export default SmartBoard;