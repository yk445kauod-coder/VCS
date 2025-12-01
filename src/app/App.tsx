
import React, { useState, useEffect } from 'react';
import { Teacher, Lesson, UserRole, UserProfile } from './types';
import { saveUserToDB, getUserFromDB, subscribeToTeachers, subscribeToLessons, saveTeacherToDB, saveLessonToDB } from './services/firebase';
import TeacherBuilder from './components/TeacherBuilder';
import LessonCreator from './components/LessonCreator';
import LessonOutputView from './components/LessonOutputView';
import WelcomeScreen from './components/WelcomeScreen';
import SchoolSchedule from './components/SchoolSchedule';
import SchoolManager from './components/SchoolManager';
import CommunityFeed from './components/CommunityFeed';
import { GraduationCap, Users, PlusCircle, History, Menu, X, UserCog, User, Sparkles, LayoutDashboard, Calendar, LogOut, Globe, School, Cloud } from 'lucide-react';

const App: React.FC = () => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'create' | 'teachers' | 'history' | 'schedule' | 'school' | 'community'>('schedule');
  const [userRole, setUserRole] = useState<UserRole>('student');
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  
  const [editingTeacher, setEditingTeacher] = useState<Teacher | undefined>(undefined);
  const [selectedHistoryLesson, setSelectedHistoryLesson] = useState<Lesson | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load User from LocalStorage then fetch from Firebase
  useEffect(() => {
    const storedId = localStorage.getItem('vt_uid');
    if (storedId) {
       getUserFromDB(storedId).then(profile => {
         if (profile) {
           setUserProfile(profile);
           setUserRole(profile.role);
         }
       });
    }
  }, []);

  // Fetch Data when profile is loaded
  useEffect(() => {
    if (userProfile) {
      // Load teachers
      subscribeToTeachers(userProfile.id, userProfile.schoolId, (data) => setTeachers(data));
      // Load lessons
      subscribeToLessons(userProfile.id, userProfile.schoolId, (data) => setLessons(data));
    }
  }, [userProfile]);

  const handleProfileCreate = (profile: UserProfile) => {
    localStorage.setItem('vt_uid', profile.id);
    saveUserToDB(profile);
    setUserProfile(profile);
    setUserRole(profile.role);
  };

  const handleSaveTeacher = (teacher: Teacher) => {
    // Add owner ID and ensure schoolId is null if undefined (Firebase doesn't accept undefined)
    const t = { 
        ...teacher, 
        ownerId: userProfile!.id, 
        schoolId: userProfile?.schoolId || null 
    };
    saveTeacherToDB(t);
    setEditingTeacher(undefined);
    setView('teachers');
  };

  const NavItem = ({ id, label, icon: Icon, description }: { id: typeof view, label: string, icon: any, description?: string }) => (
    <button
      onClick={() => {
        setView(id);
        setSelectedHistoryLesson(null);
        setEditingTeacher(undefined);
        setMobileMenuOpen(false);
      }}
      className={`group flex items-center gap-4 w-full px-5 py-4 rounded-2xl transition-all duration-300 text-right relative overflow-hidden ${
        view === id 
          ? 'bg-gradient-to-l from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200' 
          : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
      }`}
    >
      <div className={`p-2 rounded-xl ${view === id ? 'bg-white/20' : 'bg-slate-100 group-hover:bg-white'}`}>
         <Icon size={22} />
      </div>
      <div>
        <span className="font-bold text-base block">{label}</span>
        {description && <span className={`text-xs block mt-0.5 ${view === id ? 'text-indigo-100' : 'text-slate-400'}`}>{description}</span>}
      </div>
      {view === id && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/30" />}
    </button>
  );

  if (!userProfile) {
      return <WelcomeScreen onComplete={handleProfileCreate} />;
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans" dir="rtl">
      
      {/* Mobile Header */}
      <div className="md:hidden glass-panel border-b border-white/50 p-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg text-white">
               <Cloud size={20} />
            </div>
            <span className="font-extrabold text-xl text-slate-800 tracking-tight">VCS</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 bg-slate-100 rounded-full text-slate-600">
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 right-0 z-20 w-72 transform transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 glass-panel md:bg-white/50 border-l border-white/50
        ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'}
        flex flex-col
      `}>
        <div className="p-8 flex-1">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-200">
               <Cloud size={28} />
            </div>
            <div>
               <h1 className="font-extrabold text-2xl text-slate-800 leading-none">VCS</h1>
               <span className="text-[10px] font-bold text-indigo-500 tracking-wide uppercase">Virtual Cloud School</span>
            </div>
          </div>
          
          <div className="mb-6 p-4 bg-white/60 rounded-2xl border border-white flex items-center gap-3 shadow-sm">
             <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-lg">
                {userProfile.name[0]}
             </div>
             <div className="overflow-hidden">
                <p className="font-bold text-slate-800 truncate">{userProfile.name}</p>
                <p className="text-xs text-slate-500 truncate">{userProfile.isRealTeacher ? 'المعلم' : userProfile.gradeLevel}</p>
             </div>
          </div>

          <nav className="space-y-3">
            <NavItem id="community" label="المجتمع" description="تواصل مع الجميع" icon={Globe} />
            <NavItem id="school" label="إدارة المدرسة" description="انضم أو أنشئ" icon={School} />
            <NavItem id="schedule" label="الجدول الدراسي" description="حصصك اليومية" icon={Calendar} />
            
            {/* Unlocked for students too! */}
            <NavItem id="create" label="درس جديد" description="أنشئ محتوى ذكي" icon={Sparkles} />
            <NavItem id="teachers" label="المعلمون" description="المعلمون الشخصيون" icon={Users} />
            
            <NavItem id="history" label="المكتبة" description="أرشيف الدروس" icon={History} />
          </nav>
        </div>
        
        <div className="p-6">
             <button 
               onClick={() => {
                   if(confirm('هل تريد تسجيل الخروج؟')) {
                       localStorage.removeItem('vt_uid');
                       window.location.reload();
                   }
               }}
               className="flex items-center gap-2 text-red-400 hover:text-red-600 text-sm font-bold w-full p-2"
             >
                 <LogOut size={16} /> تسجيل الخروج
             </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-65px)] md:h-screen scroll-smooth">
        <div className="max-w-6xl mx-auto space-y-8 pb-10 transition-all duration-300 ease-in-out">
          
          <div key={view} className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
          
            {view === 'community' && <CommunityFeed user={userProfile} />}

            {view === 'school' && <SchoolManager user={userProfile} />}

            {view === 'schedule' && (
                <SchoolSchedule teachers={teachers} userRole={userRole} />
            )}

            {/* Allow everyone to create content now */}
            {view === 'create' && (
               <LessonCreator teachers={teachers} userRole={userRole} ownerId={userProfile.id} schoolId={userProfile.schoolId} />
            )}

            {/* Allow everyone to create/view teachers */}
            {view === 'teachers' && (
              <div className="space-y-8">
                {!editingTeacher ? (
                  <>
                    <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                      <div>
                          <h2 className="text-3xl font-bold text-slate-800 mb-1">
                             {userProfile.isRealTeacher ? 'طاقم التدريس' : 'معلمي الخاص'}
                          </h2>
                          <p className="text-slate-500">
                             {userProfile.isRealTeacher ? 'إدارة وتخصيص شخصيات الذكاء الاصطناعي للمدرسة' : 'قم بإنشاء معلمك الخاص للمساعدة في الدراسة'}
                          </p>
                      </div>
                      <button
                        onClick={() => setEditingTeacher({
                          id: Date.now().toString(), ownerId: '', name: '', subject: '', personality: undefined as any, avatarColor: '', avatarIcon: undefined
                        })}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 font-bold flex items-center gap-2 shadow-lg shadow-indigo-200 transition-all hover:scale-105"
                      >
                        <PlusCircle size={20} /> إضافة معلم
                      </button>
                    </div>

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
                  </>
                ) : (
                  <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                      <TeacherBuilder 
                      existingTeacher={editingTeacher}
                      onSave={handleSaveTeacher}
                      onCancel={() => setEditingTeacher(undefined)}
                      />
                  </div>
                )}
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-6">
                {!selectedHistoryLesson ? (
                  <>
                    <div className="bg-gradient-to-r from-indigo-900 to-violet-900 p-8 rounded-3xl text-white shadow-xl mb-8 relative overflow-hidden">
                        <div className="relative z-10">
                          <h2 className="text-3xl font-bold mb-2">
                              أرشيف الدروس
                          </h2>
                          <p className="text-indigo-200">
                              مكتبتك الشاملة للدروس والمراجعات.
                          </p>
                        </div>
                        <History className="absolute left-8 bottom-[-20px] text-white opacity-10 w-40 h-40 transform -rotate-12" />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      {lessons.length > 0 ? lessons.map(lesson => (
                        <div key={lesson.id} className="group bg-white p-5 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-lg transition-all flex justify-between items-center cursor-pointer" onClick={() => setSelectedHistoryLesson(lesson)}>
                          <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl shadow-sm ${teachers.find(t => t.id === lesson.teacherId)?.avatarColor || 'bg-slate-300'} text-white`}>
                                {teachers.find(t => t.id === lesson.teacherId)?.avatarIcon || '📚'}
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">{lesson.topic}</h3>
                                <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                                    <span className="flex items-center gap-1"><User size={14}/> {teachers.find(t => t.id === lesson.teacherId)?.name}</span>
                                    <span>•</span>
                                    <span>{new Date(lesson.createdAt).toLocaleDateString('ar-EG')}</span>
                                </div>
                            </div>
                          </div>
                        </div>
                      )) : (
                          <div className="text-center py-10 text-slate-400">لا توجد دروس محفوظة بعد</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <button 
                      onClick={() => setSelectedHistoryLesson(null)}
                      className="group flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors bg-white px-4 py-2 rounded-full shadow-sm w-fit"
                    >
                      <span className="transform group-hover:translate-x-1 transition-transform">→</span> 
                      العودة للمكتبة
                    </button>
                    
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                      <div>
                          <h2 className="text-3xl font-extrabold text-slate-900 mb-2">{selectedHistoryLesson.topic}</h2>
                      </div>
                    </div>

                    {selectedHistoryLesson.output && (
                      <LessonOutputView 
                        output={selectedHistoryLesson.output} 
                        userRole={userRole} 
                        teacherId={selectedHistoryLesson.teacherId}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
