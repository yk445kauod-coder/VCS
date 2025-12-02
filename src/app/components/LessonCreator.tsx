
import React, { useState, useRef, useEffect } from 'react';
import { Teacher, Lesson, LessonLength } from '../types';
import { generateLessonContent } from '../services/geminiService';
import { saveLessonToDB } from '../services/firebase';
import LessonOutputView from './LessonOutputView';
import { Upload, Sparkles, AlertCircle, Search, ArrowRight, Globe, Loader2 } from 'lucide-react';

interface Props {
  teachers: Teacher[];
  ownerId: string;
  schoolId: string | null | undefined;
}

const LessonCreator: React.FC<Props> = ({ teachers, ownerId, schoolId }) => {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [lessonLength, setLessonLength] = useState<LessonLength>('standard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Set default teacher when list loads
  useEffect(() => {
    if (teachers.length > 0 && !selectedTeacherId) {
        setSelectedTeacherId(teachers[0].id);
    }
  }, [teachers, selectedTeacherId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setContent(event.target?.result as string);
    reader.readAsText(file);
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError("Please provide a topic for the lesson.");
      return;
    }
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    if (!teacher) {
        setError("Please select a teacher first.");
        return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const output = await generateLessonContent(teacher, content, topic, useSearch, lessonLength);
      const newLesson: Lesson = {
        id: Date.now().toString(),
        teacherId: teacher.id,
        ownerId: ownerId,
        schoolId: schoolId || null,
        topic,
        originalContent: content,
        length: lessonLength,
        output,
        createdAt: Date.now(),
      };
      await saveLessonToDB(newLesson);
      setCurrentLesson(newLesson);
    } catch (err: any) {
      console.error("Lesson generation failed:", err);
      setError(err.message || "An unknown error occurred during lesson generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (teachers.length === 0) {
    return (
        <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-slate-200">
            <h3 className="text-xl font-bold text-slate-700">لا يوجد معلمون متاحون</h3>
            <p className="text-slate-500 mt-2 max-w-md mx-auto">
              لإنشاء درس، يجب أن يكون هناك معلم واحد على الأقل. يمكنك إنشاء معلمك الخاص من شاشة "المعلمون".
            </p>
        </div>
    );
  }

  if (currentLesson) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
           <button 
              onClick={() => setCurrentLesson(null)}
              className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 px-4 py-2 hover:bg-indigo-50 rounded-xl transition-colors"
           >
              <ArrowRight size={18} /> العودة للاستوديو
           </button>
           <div className="flex items-center gap-3">
               <h2 className="text-xl font-bold text-slate-800 truncate">{currentLesson.topic}</h2>
               {currentLesson.output?.groundingUrls && (
                  <span className="bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1">
                      <Globe size={12} /> Live
                  </span>
               )}
           </div>
        </div>

        {currentLesson.output && (
          <LessonOutputView 
              output={currentLesson.output} 
              teacherId={currentLesson.teacherId}
          />
        )}
      </div>
    );
  }

  return (
    <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
      <div className="mb-8 border-b border-slate-100 pb-6">
          <h2 className="text-3xl font-extrabold text-slate-800 mb-2">استوديو الدروس الذكي</h2>
          <p className="text-slate-500">اختر معلمك، حدد الموضوع، ودع الذكاء الاصطناعي يبدع.</p>
      </div>
      
      <div className="space-y-8">
        {/* Teacher Selector */}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-4">1. اختر المعلم</label>
          <div className="flex gap-4 overflow-x-auto pb-4 px-1 snap-x no-scrollbar">
            {teachers.map(teacher => {
                const isSelected = selectedTeacherId === teacher.id;
                return (
                  <button
                  key={teacher.id}
                  onClick={() => setSelectedTeacherId(teacher.id)}
                  className={`
                      relative flex-shrink-0 w-40 p-4 rounded-2xl border-2 transition-all snap-start text-center group
                      ${isSelected 
                          ? 'border-indigo-500 bg-indigo-50 shadow-md ring-2 ring-indigo-200 ring-offset-2' 
                          : 'border-slate-100 bg-white hover:border-indigo-200 hover:shadow-sm'}
                  `}
                  >
                  <div className={`w-16 h-16 mx-auto rounded-2xl ${teacher.avatarColor} flex items-center justify-center text-white text-3xl shadow-md mb-3 transition-transform group-hover:scale-110`}>
                      {teacher.avatarIcon || teacher.name[0]}
                  </div>
                  <div className="font-bold text-slate-800 truncate text-sm">{teacher.name}</div>
                  <div className="text-xs text-slate-500 truncate mt-1">{teacher.subject}</div>
                  {isSelected && <div className="absolute top-3 right-3 w-3 h-3 bg-indigo-500 rounded-full ring-2 ring-white" />}
                  </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Topic Input */}
          <div>
            <label htmlFor="lesson-topic" className="block text-sm font-bold text-slate-700 mb-2">2. موضوع الدرس</label>
            <input
              id="lesson-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full rounded-2xl border-slate-200 bg-slate-50 p-4 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all font-semibold"
              placeholder="عن ماذا تريد أن نتحدث اليوم؟"
            />
          </div>

          {/* Length Selector */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">3. عمق الشرح</label>
            <div className="grid grid-cols-3 gap-3">
               {(['brief', 'standard', 'detailed'] as const).map(len => (
                 <button 
                   key={len}
                   onClick={() => setLessonLength(len)}
                   className={`py-3 rounded-xl text-sm font-bold border-2 capitalize ${lessonLength === len ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-100'}`}
                 >
                   {len === 'brief' ? 'مختصر' : len === 'standard' ? 'قياسي' : 'مفصل'}
                 </button>
               ))}
            </div>
          </div>
        </div>

        {/* Content Input */}
        <div>
            <label htmlFor="lesson-content" className="block text-sm font-bold text-slate-700 mb-2">4. المادة العلمية (اختياري)</label>
            <div className="relative">
              <textarea
                id="lesson-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                className="w-full rounded-2xl border-slate-200 bg-slate-50 p-4 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-sm resize-none"
                placeholder="أضف ملاحظاتك أو انسخ نصًا هنا. سيستخدم الذكاء الاصطناعي هذا المحتوى كأساس للدرس."
              />
              <div className="absolute bottom-3 left-3 flex gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md,.text" />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 shadow-sm"
                >
                    <Upload size={14} /> رفع ملف
                </button>
              </div>
            </div>
        </div>

        {/* Search Toggle */}
        <div 
          onClick={() => setUseSearch(!useSearch)}
          className={`flex items-center gap-4 p-5 rounded-2xl border-2 transition-all cursor-pointer group ${
              useSearch ? 'bg-indigo-50 border-indigo-500 shadow-sm' : 'bg-white border-slate-200 hover:border-indigo-300'
          }`}
        >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${useSearch ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Search size={24} />
            </div>
            <div className="flex-1">
                <h4 className={`font-bold text-lg ${useSearch ? 'text-indigo-900' : 'text-slate-700'}`}>البحث المباشر (Google)</h4>
                <p className="text-sm text-slate-500">استخدم بيانات حية من الويب لإثراء الدرس بمعلومات حديثة ودقيقة.</p>
            </div>
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${useSearch ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                {useSearch && <Sparkles size={14} className="text-white" />}
            </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-bold flex items-center gap-3">
            <AlertCircle size={20} />
            {error}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className={`w-full py-5 rounded-2xl font-bold text-xl text-white flex justify-center items-center gap-3 transition-all transform active:scale-[0.98] disabled:cursor-not-allowed ${
            isGenerating 
            ? 'bg-slate-400' 
            : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:shadow-xl hover:shadow-indigo-200'
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 size={24} className="animate-spin" />
              جاري صناعة المعرفة...
            </>
          ) : (
            <>
              <Sparkles size={24} />
              توليد الدرس الآن
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default LessonCreator;

    