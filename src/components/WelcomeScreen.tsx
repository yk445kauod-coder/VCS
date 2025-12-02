import React, { useState } from 'react';
import { UserProfile } from '../types';
import { checkUserCredentials } from '../services/firebase';
import { Cloud, ArrowRight, User, UserCog, Lock, Loader2 } from 'lucide-react';

interface Props {
  onComplete: (profile: UserProfile) => void;
}

const WelcomeScreen: React.FC<Props> = ({ onComplete }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form Fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [isRealTeacher, setIsRealTeacher] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // --- LOGIN LOGIC ---
        if (!username || !password) throw new Error("Please enter a username and password.");
        
        const user = await checkUserCredentials(username);
        if (!user) {
          throw new Error("Username not found.");
        }
        if (user.password !== password) {
          throw new Error("Incorrect password.");
        }

        onComplete(user);

      } else {
        // --- SIGNUP LOGIC ---
        if (!name.trim() || !username.trim() || !password.trim()) throw new Error("All fields are required.");
        if (!isRealTeacher && !gradeLevel.trim()) throw new Error("Please enter your grade level.");

        const existing = await checkUserCredentials(username);
        if (existing) throw new Error("This username is already taken.");

        const newUser: UserProfile = {
          id: username, // Use username as the unique ID
          username,
          password,
          name,
          gradeLevel: isRealTeacher ? 'Teacher' : gradeLevel,
          role: isRealTeacher ? 'creator' : 'student',
          isRealTeacher,
          createdAt: Date.now()
        };
        
        onComplete(newUser);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const resetForms = () => {
    setError('');
    setName('');
    setUsername('');
    setPassword('');
    setGradeLevel('');
    setIsRealTeacher(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/30 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-pink-500/30 rounded-full blur-3xl"></div>

        <div className="relative z-10 text-center space-y-6">
          <div className="w-20 h-20 bg-white rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-4">
            <Cloud size={40} className="text-indigo-600" />
          </div>
          
          <div>
            <h1 className="text-3xl font-extrabold text-white mb-1">VCS</h1>
            <p className="text-indigo-200 font-medium text-sm">المدرسة السحابية الافتراضية</p>
          </div>

          <div className="flex bg-black/20 p-1 rounded-xl mb-4">
             <button 
               onClick={() => { setIsLogin(true); resetForms(); }}
               className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${isLogin ? 'bg-white text-indigo-900 shadow-md' : 'text-indigo-200 hover:text-white'}`}
             >
               تسجيل الدخول
             </button>
             <button 
               onClick={() => { setIsLogin(false); resetForms(); }}
               className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${!isLogin ? 'bg-white text-indigo-900 shadow-md' : 'text-indigo-200 hover:text-white'}`}
             >
               حساب جديد
             </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 text-right">
            
            {/* Login & Signup Fields */}
            <div>
              <div className="relative">
                <User className="absolute right-4 top-3.5 text-indigo-300" size={18} />
                <input 
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                  className="w-full pr-12 pl-4 py-3 bg-white/5 border border-indigo-300/30 rounded-xl text-white placeholder-indigo-300/50 focus:bg-white/10 focus:border-white focus:outline-none transition-all font-bold text-left ltr"
                  placeholder="username"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <Lock className="absolute right-4 top-3.5 text-indigo-300" size={18} />
                <input 
                  type="password"
                  required
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-12 pl-4 py-3 bg-white/5 border border-indigo-300/30 rounded-xl text-white placeholder-indigo-300/50 focus:bg-white/10 focus:border-white focus:outline-none transition-all font-bold text-left"
                  placeholder="********"
                />
              </div>
            </div>

            {/* Signup Only Fields */}
            {!isLogin && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <div>
                    <input 
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-indigo-300/30 rounded-xl text-white placeholder-indigo-300/50 focus:bg-white/10 focus:border-white focus:outline-none transition-all font-bold text-right"
                    placeholder="الاسم الكامل (للعرض)"
                    />
                </div>

                {!isRealTeacher && (
                    <div>
                    <input 
                        type="text"
                        required={!isRealTeacher}
                        value={gradeLevel}
                        onChange={(e) => setGradeLevel(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-indigo-300/30 rounded-xl text-white placeholder-indigo-300/50 focus:bg-white/10 focus:border-white focus:outline-none transition-all font-bold text-right"
                        placeholder="المرحلة الدراسية (مثال: الصف 10)"
                    />
                    </div>
                )}

                <div className="flex gap-4 pt-2">
                    <button 
                        type="button"
                        onClick={() => setIsRealTeacher(false)}
                        className={`flex-1 p-3 rounded-xl border transition-all flex flex-col items-center gap-2 ${!isRealTeacher ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-indigo-200'}`}
                    >
                        <User size={20} />
                        <span className="text-xs font-bold">أنا طالب</span>
                    </button>
                    <button 
                        type="button"
                        onClick={() => setIsRealTeacher(true)}
                        className={`flex-1 p-3 rounded-xl border transition-all flex flex-col items-center gap-2 ${isRealTeacher ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-indigo-200'}`}
                    >
                        <UserCog size={20} />
                        <span className="text-xs font-bold">أنا معلم</span>
                    </button>
                </div>
              </div>
            )}

            {error && (
               <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-xl text-red-200 text-xs font-bold text-center">
                   {error}
               </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-white text-indigo-900 rounded-xl font-extrabold text-lg hover:bg-indigo-50 transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin" /> : (
                  <>
                    {isLogin ? 'دخول' : 'إنشاء الحساب'}
                    <ArrowRight size={20} />
                  </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;
