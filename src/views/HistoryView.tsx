import React, { useState } from 'react';
import { Lesson, Teacher, UserRole } from '../types';
import LessonOutputView from '../components/LessonOutputView';
import { History, User, ArrowRight, BookOpen } from 'lucide-react';

interface Props {
    lessons: Lesson[];
    teachers: Teacher[];
    userRole: UserRole;
}

const HistoryView: React.FC<Props> = ({ lessons, teachers, userRole }) => {
    const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);

    if (selectedLesson) {
        return (
            <div className="space-y-6">
                <button 
                  onClick={() => setSelectedLesson(null)}
                  className="group flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors bg-white px-4 py-2 rounded-full shadow-sm w-fit"
                >
                  <span className="transform transition-transform rtl:group-hover:-translate-x-1 ltr:group-hover:translate-x-1">→</span> 
                  العودة للمكتبة
                </button>
                
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h2 className="text-3xl font-extrabold text-slate-900 mb-2">{selectedLesson.topic}</h2>
                </div>

                {selectedLesson.output && (
                  <LessonOutputView 
                    output={selectedLesson.output} 
                    teacherId={selectedLesson.teacherId}
                  />
                )}
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-900 to-violet-900 p-8 rounded-3xl text-white shadow-xl mb-8 relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-3xl font-bold mb-2">
                      أرشيف الدروس
                  </h2>
                  <p className="text-indigo-200">
                      مكتبتك الشاملة للدروس والمراجعات السابقة.
                  </p>
                </div>
                <History className="absolute left-8 bottom-[-20px] text-white opacity-10 w-40 h-40 transform -rotate-12" />
            </div>

            {lessons.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                    {lessons.map(lesson => {
                        const teacher = teachers.find(t => t.id === lesson.teacherId);
                        return (
                            <div 
                                key={lesson.id} 
                                className="group bg-white p-5 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-lg transition-all flex justify-between items-center cursor-pointer" 
                                onClick={() => setSelectedLesson(lesson)}
                            >
                                <div className="flex items-center gap-4 overflow-hidden">
                                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl shadow-sm ${teacher?.avatarColor || 'bg-slate-300'} text-white shrink-0`}>
                                        {teacher?.avatarIcon || '📚'}
                                    </div>
                                    <div className="overflow-hidden">
                                        <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate">{lesson.topic}</h3>
                                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                                            {teacher && <span className="flex items-center gap-1 shrink-0"><User size={14}/> {teacher.name}</span>}
                                            {teacher && <span>•</span>}
                                            <span>{new Date(lesson.createdAt).toLocaleDateString('ar-EG')}</span>
                                        </div>
                                    </div>
                                </div>
                                <ArrowRight className="text-slate-300 group-hover:text-indigo-500 transition-transform group-hover:translate-x-1 shrink-0" />
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="text-center py-16 text-slate-400 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
                    <BookOpen size={40} className="mx-auto text-slate-300 mb-4" />
                    <p className="font-bold">لا توجد دروس محفوظة بعد</p>
                    <p className="text-sm mt-1">عندما تقوم بإنشاء درس، سيظهر هنا.</p>
                </div>
            )}
        </div>
    );
};

export default HistoryView;
