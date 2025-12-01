import React, { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Move } from 'lucide-react';

interface DiagramRendererProps {
  content: string;
}

const DiagramRenderer: React.FC<DiagramRendererProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Sanitize and prepare SVG content
  const cleanContent = React.useMemo(() => {
    // Basic cleanup to ensure SVG renders safely and fits container
    let svg = content.trim();
    if (!svg.includes('<svg')) return null;
    
    // Ensure 100% width/height for responsiveness if not set
    if (!svg.includes('width=')) {
        svg = svg.replace('<svg', '<svg width="100%" height="100%"');
    }
    
    return svg;
  }, [content]);

  if (!cleanContent) {
    return (
        <div className="flex items-center justify-center h-64 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <p className="text-slate-400 font-bold">المخطط غير متوفر أو التنسيق غير مدعوم</p>
        </div>
    );
  }

  return (
    <div className={`relative bg-white rounded-xl border border-slate-200 overflow-hidden transition-all duration-500 ${isFullScreen ? 'fixed inset-4 z-50 shadow-2xl' : 'h-[500px] shadow-sm'}`}>
      
      {/* Controls Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white/90 backdrop-blur-sm p-1.5 rounded-lg shadow-md border border-slate-100">
        <button 
          onClick={() => setScale(s => Math.min(s + 0.1, 3))}
          className="p-2 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"
          title="تكبير"
        >
          <ZoomIn size={18} />
        </button>
        <button 
          onClick={() => setScale(s => Math.max(s - 0.1, 0.5))}
          className="p-2 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"
          title="تصغير"
        >
          <ZoomOut size={18} />
        </button>
        <button 
          onClick={() => setScale(1)}
          className="p-2 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"
          title="إعادة تعيين"
        >
          <Move size={18} />
        </button>
        <div className="h-px bg-slate-200 my-1" />
        <button 
          onClick={() => setIsFullScreen(!isFullScreen)}
          className={`p-2 hover:bg-indigo-50 rounded-md transition-colors ${isFullScreen ? 'text-indigo-600' : 'text-slate-600'}`}
          title="ملء الشاشة"
        >
          <Maximize size={18} />
        </button>
      </div>

      {/* Diagram Container */}
      <div 
        ref={containerRef}
        className="w-full h-full overflow-auto flex items-center justify-center p-8 bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] bg-slate-50"
      >
        <div 
           className="diagram-container transition-transform duration-200 origin-center"
           style={{ transform: `scale(${scale})` }}
           dangerouslySetInnerHTML={{ __html: cleanContent }}
        />
      </div>

      {isFullScreen && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-sm font-bold backdrop-blur-md">
            اضغط ESC للخروج
        </div>
      )}
    </div>
  );
};

export default DiagramRenderer;