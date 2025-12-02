
import React, { useState } from 'react';
import { Key, ArrowRight, BookOpen } from 'lucide-react';

interface Props {
  onApiKeySet: (apiKey: string) => void;
}

const ApiKeyManager: React.FC<Props> = ({ onApiKeySet }) => {
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length < 20) { // Basic validation for API key length
      setError('Please enter a valid Gemini API key.');
      return;
    }
    setError('');
    onApiKeySet(apiKey.trim());
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-2xl w-full bg-white rounded-3xl p-8 md:p-12 shadow-2xl border border-slate-200">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
            <Key size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 mb-2">مطلوب مفتاح Gemini API</h1>
          <p className="text-slate-500">لتشغيل الميزات الذكية في التطبيق، يرجى تقديم مفتاح واجهة برمجة التطبيقات الخاص بك من Google AI Studio.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input 
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-semibold text-center tracking-widest"
              placeholder="...أدخل مفتاح API هنا"
            />
          </div>
          {error && <p className="text-red-500 text-sm font-bold text-center">{error}</p>}
          <button 
            type="submit"
            disabled={!apiKey.trim()}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all transform hover:scale-[1.02] shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:shadow-none"
          >
            حفظ المفتاح والمتابعة
            <ArrowRight size={20} />
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200">
          <h3 className="text-lg font-bold text-slate-700 mb-3 text-center flex items-center justify-center gap-2">
            <BookOpen size={20} className="text-slate-400" />
            كيف أحصل على مفتاح؟
          </h3>
          <ol className="list-decimal list-inside space-y-3 text-slate-600 bg-slate-50 p-6 rounded-2xl text-sm">
            <li>اذهب إلى <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">Google AI Studio</a>.</li>
            <li>انقر على زر "Create API key in new project".</li>
            <li>انسخ المفتاح الذي تم إنشاؤه والصقه في الحقل أعلاه.</li>
            <li className="font-bold text-red-500">ملاحظة: لا تشارك مفتاحك الخاص مع أي شخص. يتم تخزينه محليًا في متصفحك فقط.</li>
          </ol>
        </div>

      </div>
    </div>
  );
};

export default ApiKeyManager;
