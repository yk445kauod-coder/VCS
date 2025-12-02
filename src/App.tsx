
import React, { useState, useEffect } from 'react';
import { Teacher, Lesson, UserRole, UserProfile } from './types';
import { saveUserToDB, getUserFromDB, subscribeToTeachers, subscribeToLessons, saveTeacherToDB, saveLessonToDB, deleteTeacherFromDB } from './services/firebase';
import TeacherBuilder from './components/TeacherBuilder';
import LessonCreator from './components/LessonCreator';
import LessonOutputView from './components/LessonOutputView';
import WelcomeScreen from './components/WelcomeScreen';
import SchoolSchedule from './components/SchoolSchedule';
import SchoolManager from './components/SchoolManager';
import CommunityFeed from './components/CommunityFeed';
import { Cloud, Menu, X, Users, Sparkles, History, Calendar, School, Globe, LogOut } from 'lucide-react';
import TeachersView from './views/TeachersView';
import HistoryView from './views/HistoryView';

type View = 'create' | 'teachers' | 'history' | 'schedule' | 'school' | 'community';

const App: React.FC = () => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [view, setView] = useState<View>('schedule');
  const [userRole, setUserRole] = useState<UserRole>('student');
  
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load User from LocalStorage then fetch from Firebase
  useEffect(() => {
    const storedId = localStorage.getItem('vcs_uid');
    if (storedId) {
       getUserFromDB(storedId).then(profile => {
         if (profile) {
           setUserProfile(profile);
           setUserRole(profile.role);
         } else {
           // Clear invalid ID
           localStorage.removeItem('vcs_uid');
         }
       });
    }
  }, []);

  // Fetch Data when profile is loaded
  useEffect(() => {
    if (userProfile) {
      // Load teachers
      const unsubscribeTeachers = subscribeToTeachers(userProfile.id, userProfile.schoolId, setTeachers);
      // Load lessons
      const unsubscribeLessons = subscribeToLessons(userProfile.id, userProfile.schoolId, setLessons);

      return () => {
        unsubscribeTeachers();
        unsubscribeLessons();
      };
    }
  }, [userProfile]);

  const handleProfileCreate = (profile: UserProfile) => {
    localStorage.setItem('vcs_uid', profile.id);
    saveUserToDB(profile); // This also saves credentials
    setUserProfile(profile);
    setUserRole(profile.role);
  };

  const handleLogout = () => {
    if (confirm('هل تريد تسجيل الخروج؟')) {
      localStorage.removeItem('vcs_uid');
      setUserProfile(null);
      // Full reload to clear all state
      window.location.reload();
    }
  };

  const NavItem = ({ id, label, icon: Icon, description }: { id: View, label: string, icon: any, description?: string }) => (
    <button
      onClick={() => {
        setView(id);
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
  
  const renderView = () => {
    switch (view) {
      case 'community':
        return <CommunityFeed user={userProfile} />;
      case 'school':
        return <SchoolManager user={userProfile} />;
      case 'schedule':
        return <SchoolSchedule teachers={teachers} userRole={userRole} schoolId={userProfile.schoolId} />;
      case 'create':
        return <LessonCreator teachers={teachers} ownerId={userProfile.id} schoolId={userProfile.schoolId} />;
      case 'teachers':
        return <TeachersView userProfile={userProfile} teachers={teachers} setView={setView} />;
      case 'history':
        return <HistoryView lessons={lessons} teachers={teachers} userRole={userRole} />;
      default:
        return <SchoolSchedule teachers={teachers} userRole={userRole} schoolId={userProfile.schoolId} />;
    }
  };

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
        fixed inset-y-0 right-0 z-40 w-72 transform transition-transform duration-300 ease-in-out
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
            <NavItem id="create" label="درس جديد" description="أنشئ محتوى ذكي" icon={Sparkles} />
            <NavItem id="teachers" label="المعلمون" description="المعلمون الشخصيون" icon={Users} />
            <NavItem id="history" label="المكتبة" description="أرشيف الدروس" icon={History} />
          </nav>
        </div>
        
        <div className="p-6">
             <button 
               onClick={handleLogout}
               className="flex items-center gap-2 text-red-400 hover:text-red-600 text-sm font-bold w-full p-2"
             >
                 <LogOut size={16} /> تسجيل الخروج
             </button>
        </div>
      </aside>
      
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}


      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-65px)] md:h-screen scroll-smooth">
        <div className="max-w-6xl mx-auto space-y-8 pb-10 transition-all duration-300 ease-in-out">
          
          <div key={view} className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
            {renderView()}
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;
