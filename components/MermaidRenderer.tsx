import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface MermaidRendererProps {
  chart: string;
}

const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: 'neutral',
      securityLevel: 'loose',
    });
  }, []);

  useEffect(() => {
    const renderChart = async () => {
      if (containerRef.current && chart) {
        try {
          // Unique ID for each render to avoid conflicts
          const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
          const { svg } = await mermaid.render(id, chart);
          containerRef.current.innerHTML = svg;
        } catch (error) {
          console.error("Mermaid render error:", error);
          containerRef.current.innerHTML = '<p class="text-red-500 text-sm">فشل في رسم المخطط. قد يكون الكود غير صالح.</p>';
        }
      }
    };

    renderChart();
  }, [chart]);

  return <div ref={containerRef} className="overflow-x-auto p-4 bg-white rounded-lg border border-slate-200 flex justify-center" />;
};

export default MermaidRenderer;