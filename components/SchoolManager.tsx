
import React, { useState, useEffect } from 'react';
import { School, UserProfile } from '../types';
import { createSchool, joinSchoolRequest, getMySchool, approveStudent, rejectStudent, getUserFromDB, getSchoolById } from '../services/firebase';
import { School as SchoolIcon, Users, Check, Copy, Loader2, X, Clock } from 'lucide-react';

interface Props {
  user: UserProfile;
}

const SchoolManager: React.FC<Props> = ({ user }) => {
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Create State
  const [schoolName, setSchoolName] = useState('');
  const [schoolDesc, setSchoolDesc] = useState('');
  
  // Join State
  const [joinCode, setJoinCode] = useState('');
  const [joinStatus, setJoinStatus] = useState('');
  const [pendingSchoolName, setPendingSchoolName] = useState('');

  // Management State
  const [pendingStudentsDetails, setPendingStudentsDetails] = useState<UserProfile[]>([]);

  // 1. Fetch User's Current School Status
  useEffect(() => {
    const unsubscribe = getMySchool(user.id, (data) => {
      setSchool(data);
      setLoading(false);
    });

    // Check if user has a pending request
    if (user.pendingSchoolId && !user.schoolId) {
        getSchoolById(user.pendingSchoolId).then(s => {
            if (s) setPendingSchoolName(s.name);
        });
    }
    
    return () => unsubscribe();
  }, [user.id, user.pendingSchoolId, user.schoolId]);

  // 2. Fetch Details of Pending Students (For Owners)
  useEffect(() => {
    if (school && school.ownerId === user.id && school.pendingStudents) {
        const fetchDetails = async () => {
            const users = await Promise.all(
                school.pendingStudents.map(id => getUserFromDB(id))
            );
            setPendingStudentsDetails(users.filter(u => u !== null) as UserProfile[]);
        };
        fetchDetails();
    } else {
        setPendingStudentsDetails([]);
    }
  }, [school, user.id]);

  const handleCreate = () => {
    if (!schoolName) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newSchool: School = {
      id: Date.now().toString(),
      ownerId: user.id,
      name: schoolName,
      description: schoolDesc || '', // Ensure no undefined
      code,
      students: [],
      pendingStudents: []
    };
    createSchool(newSchool, user.id);
  };

  const handleJoin = async () => {
    if (!joinCode) return;
    setJoinStatus('جاري البحث...');
    try {
      const name = await joinSchoolRequest(joinCode.trim(), user.id);
      setJoinStatus('');
      setPendingSchoolName(name);
    } catch (err: any) {
      setJoinStatus(`خطأ: ${err.message}`);
    }
  };

  if (loading) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto text-indigo-500" /></div>;

  // Case 1: User Has a School (Joined or Owned)
  if (school) {
    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
           <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-900 to-violet-900 p-10 text-white relative">
                 <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[url('https://www.transparenttextures.com/patterns/school-supplies.png')]"></div>
                 
                 <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-6">
                    <div>
                       <div className="flex items-center gap-3 mb-2">
                          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                             <SchoolIcon size={28} />
                          </div>
                          <span className="text-indigo-200 font-bold tracking-wider uppercase text-sm">المدرسة الافتراضية</span>
                       </div>
                       <h2 className="text-4xl font-extrabold mb-3">{school.name}</h2>
                       <p className="text-indigo-100 text-lg max-w-2xl">{school.description}</p>
                    </div>

                    {school.ownerId === user.id && (
                      <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl flex flex-col items-center border border-white/20 hover:bg-white/20 transition-colors">
                         <span className="text-xs text-indigo-200 uppercase font-bold mb-1">رمز الانضمام</span>
                         <div 
                           className="flex items-center gap-3 cursor-pointer group" 
                           onClick={() => {
                               navigator.clipboard.writeText(school.code);
                               alert('تم نسخ كود المدرسة');
                           }}
                         >
                            <span className="text-3xl font-mono font-bold tracking-widest text-white group-hover:text-yellow-300 transition-colors">{school.code}</span>
                            <Copy size={20} className="text-indigo-300 group-hover:text-white" />
                         </div>
                      </div>
                    )}
                 </div>

                 <div className="flex gap-8 mt-10 relative z-10">
                    <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-full">
                       <Users size={20} className="text-emerald-400" />
                       <span className="font-bold">{school.students ? school.students.length : 0} طالب</span>
                    </div>
                    {school.ownerId === user.id && (
                       <div className="flex items-center gap-3 bg-black/20 px-4 py-2 rounded-full border border-yellow-500/30">
                         <div className={`w-2 h-2 bg-yellow-400 rounded-full ${school.pendingStudents?.length ? 'animate-pulse' : ''}`} />
                         <span className="font-bold text-yellow-100">{school.pendingStudents ? school.pendingStudents.length : 0} طلبات معلقة</span>
                       </div>
                    )}
                 </div>
              </div>

              {/* Management Area (Owner Only) */}
              {school.ownerId === user.id && (
                <div className="p-8 bg-slate-50 border-t border-slate-100">
                  <h3 className="font-bold text-xl text-slate-800 mb-6 flex items-center gap-2">
                      <Users className="text-indigo-600" />
                      إدارة طلبات الانضمام
                      {school.pendingStudents?.length > 0 && (
                          <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full animate-pulse">{school.pendingStudents.length}</span>
                      )}
                  </h3>
                  
                  {pendingStudentsDetails.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pendingStudentsDetails.map(student => (
                        <div key={student.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-indigo-300 transition-colors">
                           <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                  {student.name[0]}
                              </div>
                              <div>
                                  <p className="font-bold text-slate-800">{student.name}</p>
                                  <p className="text-xs text-slate-500">{student.gradeLevel}</p>
                              </div>
                           </div>
                           <div className="flex gap-2">
                             <button 
                               onClick={() => approveStudent(school.id, student.id)}
                               className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-500 hover:text-white transition-all"
                               title="قبول"
                             >
                               <Check size={18} />
                             </button>
                             <button 
                               onClick={() => rejectStudent(school.id, student.id)}
                               className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                               title="رفض"
                             >
                               <X size={18} />
                             </button>
                           </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                        <p className="text-slate-400">لا توجد طلبات انضمام جديدة في الوقت الحالي.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Student View Inside School */}
              {school.ownerId !== user.id && (
                <div className="p-10 text-center">
                  <div className="inline-block p-4 bg-indigo-50 rounded-full mb-4 text-indigo-600">
                      <SchoolIcon size={40} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">مرحباً بك في {school.name}</h3>
                  <p className="text-slate-500 max-w-lg mx-auto">
                    أنت الآن عضو رسمي. يمكنك تصفح الجدول الدراسي، حضور الدروس، والتفاعل مع زملائك في المجتمع.
                  </p>
                </div>
              )}
           </div>
        </div>
    );
  }

  // Case 2: User has a Pending Request
  if (pendingSchoolName || user.pendingSchoolId) {
      return (
          <div className="max-w-2xl mx-auto mt-10">
              <div className="bg-white p-10 rounded-3xl border border-yellow-200 shadow-xl text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-yellow-400 animate-pulse" />
                  <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mx-auto mb-6 text-yellow-500">
                      <Clock size={40} />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-800 mb-4">طلبك قيد المراجعة</h2>
                  <p className="text-slate-600 text-lg mb-6">
                      لقد أرسلت طلباً للانضمام إلى <span className="font-bold text-indigo-600">{pendingSchoolName || 'المدرسة'}</span>.
                      <br/>
                      يرجى انتظار موافقة المسؤول للدخول.
                  </p>
                  <div className="inline-flex items-center gap-2 text-sm text-slate-400 bg-slate-50 px-4 py-2 rounded-full">
                      سيتم تحديث الصفحة تلقائياً عند القبول
                  </div>
              </div>
          </div>
      );
  }

  // Case 3: No School - Create or Join
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
      <div className="text-center mb-8">
         <h1 className="text-4xl font-extrabold text-slate-800 mb-2">إدارة المدرسة</h1>
         <p className="text-slate-500">انضم إلى مجتمعك التعليمي أو قم بإنشاء مجتمع جديد</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         {/* Join School */}
         <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
            
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-6 relative z-10">
               <Users size={32} />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2 relative z-10">انضم لمدرسة موجودة</h3>
            <p className="text-slate-500 mb-8 relative z-10">أدخل كود المدرسة الذي حصلت عليه من معلمك.</p>
            
            <div className="space-y-4 relative z-10">
              <input 
                type="text" 
                placeholder="كود المدرسة (مثال: X7Y2Z)"
                className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-emerald-500 outline-none transition-all uppercase font-mono font-bold text-center tracking-widest"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
              />
              <button 
                onClick={handleJoin}
                disabled={!joinCode}
                className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg ${
                    joinCode ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                إرسال طلب الانضمام
              </button>
              {joinStatus && <p className="text-sm font-bold text-center text-indigo-600 bg-indigo-50 p-3 rounded-xl animate-pulse">{joinStatus}</p>}
            </div>
         </div>

         {/* Create School (Teachers Only) */}
         {user.isRealTeacher ? (
           <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-lg hover:shadow-xl transition-shadow relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700" />
              
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-6 relative z-10">
                 <SchoolIcon size={32} />
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2 relative z-10">أنشئ مدرستك الخاصة</h3>
              <p className="text-slate-500 mb-8 relative z-10">مكان واحد لطلابك، دروسك، وجدولك الدراسي.</p>
              
              <div className="space-y-4 relative z-10">
                <input 
                  type="text" 
                  placeholder="اسم المدرسة"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none transition-all font-bold"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                />
                <input 
                  type="text" 
                  placeholder="وصف مختصر (اختياري)"
                  className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-transparent focus:bg-white focus:border-indigo-500 outline-none transition-all"
                  value={schoolDesc}
                  onChange={(e) => setSchoolDesc(e.target.value)}
                />
                <button 
                  onClick={handleCreate}
                  disabled={!schoolName}
                  className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg ${
                    schoolName ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  إنشاء المدرسة
                </button>
              </div>
           </div>
         ) : (
           <div className="bg-slate-50 p-8 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center opacity-70 hover:opacity-100 transition-opacity">
              <SchoolIcon size={48} className="text-slate-300 mb-4" />
              <h3 className="font-bold text-xl text-slate-600 mb-2">خاص بالمعلمين</h3>
              <p className="text-slate-400 max-w-xs">فقط حسابات المعلمين يمكنها إنشاء مدارس جديدة.</p>
           </div>
         )}
      </div>
    </div>
  );
};

export default SchoolManager;
