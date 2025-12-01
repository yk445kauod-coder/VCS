import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Code, Play } from 'lucide-react';

interface Props {
  code: string;
}

const InteractivePlayground: React.FC<Props> = ({ code }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        // Inject the code into a robust HTML template with Playpen Sans font and Tailwind Config
        doc.write(`
          <!DOCTYPE html>
          <html dir="rtl">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <script src="https://cdn.tailwindcss.com"></script>
              <script>
                tailwind.config = {
                  theme: {
                    extend: {
                      fontFamily: {
                        sans: ['"Playpen Sans"', 'cursive', 'sans-serif'],
                      },
                    },
                  },
                }
              </script>
              <link href="https://fonts.googleapis.com/css2?family=Playpen+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
              <style>
                body { 
                  background-color: #ffffff; 
                  color: #1e293b; 
                  font-family: 'Playpen Sans', cursive; 
                  padding: 24px; 
                  height: 100vh;
                  box-sizing: border-box;
                }
                /* Custom scrollbar for inside iframe */
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
              </style>
            </head>
            <body class="font-sans">
              <div id="root" class="h-full">${code}</div>
              <script>
                // Basic error catching to display in the preview
                window.onerror = function(msg, url, line) {
                  const errDiv = document.createElement('div');
                  errDiv.className = 'fixed bottom-4 right-4 bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg shadow-lg text-sm font-bold z-50';
                  errDiv.textContent = 'Error: ' + msg;
                  document.body.appendChild(errDiv);
                  return false;
                };
              </script>
            </body>
          </html>
        `);
        doc.close();
      }
    }
  }, [code, key]);

  return (
    <div className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl flex flex-col h-[600px] ring-4 ring-slate-100 mt-4">
      <div className="flex items-center justify-between px-5 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
             <div className="w-3 h-3 rounded-full bg-red-500" />
             <div className="w-3 h-3 rounded-full bg-amber-500" />
             <div className="w-3 h-3 rounded-full bg-emerald-500" />
          </div>
          <div className="h-4 w-[1px] bg-slate-600 mx-1"></div>
          <div className="flex items-center gap-2 text-slate-300">
            <Code size={14} className="text-indigo-400" />
            <span className="text-xs font-mono font-bold tracking-wide">interactive_session.html</span>
          </div>
        </div>
        <button 
          onClick={() => setKey(k => k + 1)} 
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold text-white transition-all group"
          title="إعادة تشغيل الكود"
        >
          <RefreshCw size={12} className="group-hover:rotate-180 transition-transform duration-500" />
          <span>إعادة تشغيل</span>
        </button>
      </div>
      <div className="flex-1 bg-white relative">
        <iframe
          key={key}
          ref={iframeRef}
          className="w-full h-full border-none"
          sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
          title="Interactive Element"
        />
      </div>
    </div>
  );
};

export default InteractivePlayground;