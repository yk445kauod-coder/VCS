
import React, { useState } from 'react';
import { Teacher, UserProfile } from '../types';
import { saveTeacherToDB, deleteTeacherFromDB } from '../services/firebase';
import TeacherBuilder from '../components/TeacherBuilder';
import { PlusCircle, Users } from 'lucide-react';

interface Props {
    userProfile: UserProfile;
    teachers: Teacher[];
}

const TeachersView: React.FC<Props> = ({ userProfile, teachers }) => {
    const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

    const handleSaveTeacher = (teacher: Teacher) => {
        const teacherToSave: Teacher = { 
            ...teacher, 
            ownerId: userProfile.id,
            // Assign to school only if the user is a designated "real teacher" (creator)
            schoolId: userProfile.isRealTeacher ? userProfile.schoolId || null : null 
        };
        saveTeacherToDB(teacherToSave);
        setEditingTeacher(null);
    };

    const handleDeleteTeacher = (id: string) => {
        deleteTeacherFromDB(id);
        setEditingTeacher(null);
    };

    // This state determines if we are in "create" mode.
    const isCreating = editingTeacher !== null && !editingTeacher.id;

    if (editingTeacher) {
        return (
            <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                <TeacherBuilder 
                    existingTeacher={isCreating ? null : editingTeacher}
                    onSave={handleSaveTeacher}
                    onCancel={() => setEditingTeacher(null)}
                    onDelete={handleDeleteTeacher}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                <div>
                    <h2 className="text-3xl font-bold text-slate-800 mb-1">
                        {userProfile.isRealTeacher ? 'طاقم التدريس' : 'معلموك الافتراضيون'}
                    </h2>
                    <p className="text-slate-500">
                        {userProfile.isRealTeacher ? 'إدارة وتخصيص شخصيات الذكاء الاصطناعي للمدرسة.' : 'قم بإنشاء معلمك الخاص للمساعدة في الدراسة.'}
                    </p>
                </div>
                <button
                    onClick={() => setEditingTeacher({} as Teacher)} // Open builder with an empty teacher object to signify creation
                    className="px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all hover:scale-105 shrink-0"
                >
                    <PlusCircle size={20} /> إضافة معلم
                </button>
            </div>

            {teachers.length === 0 ? (
                <div className="text-center py-16 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
                    <Users size={40} className="mx-auto text-slate-300 mb-4"/>
                    <p className="text-slate-500 font-bold">لم تقم بإنشاء أي معلمين بعد.</p>
                    <p className="text-slate-400 mt-1">انقر على "إضافة معلم" للبدء.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                    {teachers.map(t => (
                        <div key={t.id} className="group bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-100 transition-all duration-300 relative overflow-hidden">
                            <div className={`absolute top-0 right-0 w-full h-24 opacity-10 ${t.avatarColor}`} />
                            <div className="relative z-10 flex flex-col items-center text-center mt-4">
                                <div className={`w-20 h-20 rounded-2xl ${t.avatarColor} flex items-center justify-center text-white text-4xl shadow-lg mb-4 transform group-hover:scale-110 transition-transform`}>
                                    {t.avatarIcon || t.name[0]}
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 mb-1">{t.name}</h3>
                                <p className="text-indigo-500 font-medium text-sm bg-indigo-50 px-3 py-1 rounded-full mb-4">{t.subject}</p>
                                
                                <div className="w-full bg-slate-50 rounded-xl p-3 mb-6">
                                    <span className="text-xs text-slate-400 block uppercase tracking-wider font-bold mb-1">الشخصية</span>
                                    <span className="text-sm font-semibold text-slate-700">{t.personality}</span>
                                </div>

                                <button 
                                    onClick={() => setEditingTeacher(t)}
                                    className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
                                >
                                    تعديل الملف
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TeachersView;
