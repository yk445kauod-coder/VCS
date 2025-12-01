
import React, { useState, useRef } from 'react';
import { Teacher, Lesson, UserRole, LessonLength } from '../types';
import { generateLessonContent } from '../services/geminiService';
import { saveLesson } from '../services/storageService';
import LessonOutputView from './LessonOutputView';
import { Upload, Sparkles, AlertCircle, Globe, Search, ArrowRight, BarChart } from 'lucide-react';

interface Props {
  teachers: Teacher[];
  userRole: UserRole;
  ownerId: string;
}

const LessonCreator: React.FC<Props> = ({ teachers, userRole, ownerId }) => {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [useSearch, setUseSearch] = useState(false);
  const [lessonLength, setLessonLength] = useState<LessonLength>('standard');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setContent(event.target?.result as string);
    reader.readAsText(file);
  };

  const handleGenerate = async () => {
    if (!topic || (!content && !useSearch)) {
      setError("يرجى إدخال عنوان الموضوع والمحتوى، أو تفعيل البحث في Google.");
      return;
    }
    const teacher = teachers.find(t => t.id === selectedTeacherId);
    if (!teacher) {
        setError("يرجى إنشاء معلم أولاً.");
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
        topic,
        originalContent: content,
        length: lessonLength,
        output,
        createdAt: Date.now(),
      };
      saveLesson(newLesson);
      setCurrentLesson(newLesson);
    } catch (err: any) {
      setError(err.message || "حدث خطأ ما.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (teachers.length === 0) {
    return (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-slate-300">
            <h3 className="text-xl font-bold text-slate-700">لا يوجد معلمون متاحون</h3>
            <p className="text-slate-500 mt-2">
                {userRole === 'creator' 
                    ? 'اذهب إلى تبويب "المعلمون" لإضافة طاقم التدريس.' 
                    : 'يمكنك إنشاء معلمك الخاص من قائمة المعلمون، أو الانتظار حتى يضيف مشرف المدرسة معلمين.'}
            </p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      {!currentLesson ? (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="mb-8 border-b border-slate-100 pb-6">
                <h2 className="text-3xl font-extrabold text-slate-800 mb-2">استوديو الدروس الذكي</h2>
                <p className="text-slate-500">اختر معلمك، حدد الموضوع، ودع الذكاء الاصطناعي يبدع.</p>
            </div>
            
            <div className="space-y-8">
              {/* Teacher Selector */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-4">1. اختر المعلم</label>
                <div className="flex gap-4 overflow-x-auto pb-4 px-1 snap-x">
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
                  <label className="block text-sm font-bold text-slate-700 mb-2">2. موضوع الدرس</label>
                  <input
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
                     <button 
                       onClick={() => setLessonLength('brief')}
                       className={`py-3 rounded-xl text-sm font-bold border-2 ${lessonLength === 'brief' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-100'}`}
                     >مختصر</button>
                     <button 
                       onClick={() => setLessonLength('standard')}
                       className={`py-3 rounded-xl text-sm font-bold border-2 ${lessonLength === 'standard' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-100'}`}
                     >قياسي</button>
                     <button 
                       onClick={() => setLessonLength('detailed')}
                       className={`py-3 rounded-xl text-sm font-bold border-2 ${lessonLength === 'detailed' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-100'}`}
                     >مفصل جداً</button>
                  </div>
                </div>
              </div>

              {/* Content Input */}
              <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">4. المادة العلمية (اختياري)</label>
                  <div className="relative">
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={5}
                      className="w-full rounded-2xl border-slate-200 bg-slate-50 p-4 focus:bg-white focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none transition-all text-sm resize-none"
                      placeholder="انسخ النص هنا..."
                    />
                    <div className="absolute bottom-3 left-3 flex gap-2">
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md,.json" />
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
                      <h4 className={`font-bold text-lg ${useSearch ? 'text-indigo-900' : 'text-slate-700'}`}>البحث المباشر (Google Grounding)</h4>
                      <p className="text-sm text-slate-500">استخدم بيانات حية من الويب لإثراء الدرس بالمعلومات الحديثة.</p>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${useSearch ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                      {useSearch && <Sparkles size={14} className="text-white" />}
                  </div>
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm font-bold flex items-center gap-3 animate-pulse">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className={`w-full py-5 rounded-2xl font-bold text-xl text-white flex justify-center items-center gap-3 transition-all transform active:scale-[0.98] ${
                  isGenerating 
                  ? 'bg-slate-300 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:shadow-xl hover:shadow-indigo-200'
                }`}
              >
                {isGenerating ? (
                  <>
                    <span className="animate-spin h-6 w-6 border-4 border-white border-t-transparent rounded-full"></span>
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
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
             <button 
                onClick={() => setCurrentLesson(null)}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 px-4 py-2 hover:bg-indigo-50 rounded-xl transition-colors"
             >
                <ArrowRight size={18} /> العودة للاستوديو
             </button>
             <div className="flex items-center gap-3">
                 <h2 className="text-xl font-bold text-slate-800">{currentLesson.topic}</h2>
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
                userRole={userRole}
                teacherId={currentLesson.teacherId}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default LessonCreator;
