import React, { useState, useEffect } from 'react';
import { LessonOutput, UserRole, QuizQuestion, Teacher } from '../types';
import MermaidRenderer from './MermaidRenderer';
import SmartBoard from './SmartBoard';
import ChatInterface from './ChatInterface';
import InteractivePlayground from './InteractivePlayground';
import { getTeachers } from '../services/storageService';
import ReactMarkdown from 'react-markdown';
import { Book, Layout, Monitor, ExternalLink, CheckCircle, XCircle, Edit3, Check, Presentation, MessageCircle, Volume2, StopCircle, Code, Play } from 'lucide-react';

interface Props {
  output: LessonOutput;
  userRole?: UserRole;
  teacherId?: string;
}

const LessonOutputView: React.FC<Props> = ({ output, userRole = 'creator', teacherId }) => {
  const [activeTab, setActiveTab] = useState<'explain' | 'board' | 'slides' | 'quiz' | 'chat' | 'interactive'>('explain');
  const [localQuiz, setLocalQuiz] = useState<QuizQuestion[]>(output.quiz);
  const [studentAnswers, setStudentAnswers] = useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [teacher, setTeacher] = useState<Teacher | undefined>(undefined);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    setLocalQuiz(output.quiz);
    setStudentAnswers({});
    setQuizSubmitted(false);
    setScore(0);
    setShowCelebration(false);
    stopSpeaking();
    if (teacherId) {
        setTeacher(getTeachers().find(t => t.id === teacherId));
    }
  }, [output, teacherId]);

  const tabs = [
    { id: 'explain', label: 'الشرح', icon: Book },
    { id: 'board', label: 'السبورة', icon: Presentation },
    { id: 'slides', label: 'الشرائح', icon: Monitor },
    { id: 'interactive', label: 'جرب بنفسك', icon: Code },
    { id: 'quiz', label: 'الاختبار', icon: Layout },
    { id: 'chat', label: 'اسأل', icon: MessageCircle },
  ] as const;

  const handleStudentSelect = (questionIdx: number, option: string) => {
    if (quizSubmitted) return;
    setStudentAnswers(prev => ({ ...prev, [questionIdx]: option }));
  };

  const submitQuiz = () => {
    let calculatedScore = 0;
    localQuiz.forEach((q, idx) => {
      if (studentAnswers[idx] === q.correctAnswer) calculatedScore++;
    });
    setScore(calculatedScore);
    setQuizSubmitted(true);
    if (calculatedScore === localQuiz.length && localQuiz.length > 0) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 5000);
    }
  };

  const speakText = () => {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(output.explanation);
        utterance.lang = 'ar-SA';
        utterance.rate = 1;
        utterance.onend = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
        setIsSpeaking(true);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden relative min-h-[600px] flex flex-col">
      
      {/* Celebration Overlay */}
      {showCelebration && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
             <div className="text-8xl mb-4 animate-bounce drop-shadow-lg">🏆</div>
             <h2 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-500 mb-2">أسطوري!</h2>
             <p className="text-white text-xl font-medium">علامة كاملة، أحسنت يا بطل!</p>
          </div>
      )}

      {/* Floating Tab Navigation */}
      <div className="bg-slate-50/80 backdrop-blur-sm p-2 border-b border-slate-100 sticky top-0 z-10">
        <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar justify-start md:justify-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            // Hide interactive tab if no content
            if (tab.id === 'interactive' && !output.interactiveElement) return null;

            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); stopSpeaking(); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                  isActive 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 scale-105' 
                    : 'text-slate-500 hover:bg-white hover:text-indigo-600'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6 md:p-8 flex-1 bg-white">
        {activeTab === 'explain' && (
          <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-2 duration-500">
            <div className="flex justify-between items-center mb-8">
               <h3 className="text-2xl font-bold text-slate-800">الشرح التفصيلي</h3>
               <button 
                 onClick={isSpeaking ? stopSpeaking : speakText}
                 className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm ${
                     isSpeaking ? 'bg-red-50 text-red-600 border border-red-100 animate-pulse' : 'bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100'
                 }`}
               >
                  {isSpeaking ? <><StopCircle size={18} /> إيقاف</> : <><Volume2 size={18} /> قراءة صوتية</>}
               </button>
            </div>

            <div className="prose prose-lg prose-slate max-w-none prose-headings:font-bold prose-headings:text-indigo-900 prose-p:leading-relaxed prose-p:text-slate-600 prose-li:text-slate-600 prose-strong:text-indigo-700" dir="rtl">
              <ReactMarkdown>{output.explanation}</ReactMarkdown>
            </div>
            
            {output.groundingUrls && output.groundingUrls.length > 0 && (
              <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">المصادر المستخدمة</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {output.groundingUrls.map((source, idx) => (
                    <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all group">
                      <span className="text-indigo-600 font-medium text-sm truncate">{source.title}</span>
                      <ExternalLink size={14} className="text-slate-300 group-hover:text-indigo-500" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'board' && <SmartBoard output={output} />}

        {activeTab === 'interactive' && output.interactiveElement && (
            <div className="h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
                <div className="mb-4 text-center">
                    <h3 className="text-2xl font-bold text-slate-800 mb-1">المعمل التفاعلي</h3>
                    <p className="text-slate-500">
                       {userRole === 'student' ? 'أنت الآن في وضع التحكم! جرب وغير القيم لتفهم الدرس.' : 'قم بتجربة المفاهيم بنفسك وتفاعل مع الكود.'}
                    </p>
                </div>
                {/* The playground is fully functional for all roles including students */}
                <InteractivePlayground code={output.interactiveElement} />
            </div>
        )}

        {activeTab === 'slides' && (
          <div className="grid grid-cols-1 gap-8 max-w-4xl mx-auto">
            {output.slides.map((slide, idx) => (
              <div key={idx} className="aspect-video bg-gradient-to-br from-indigo-900 via-slate-800 to-slate-900 text-white rounded-3xl p-10 flex flex-col shadow-2xl relative overflow-hidden group hover:scale-[1.01] transition-transform duration-500">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl -ml-16 -mb-16 pointer-events-none"></div>
                
                <div className="relative z-10 flex justify-between items-start mb-8">
                    <h3 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-white">{slide.title}</h3>
                    <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center font-bold text-lg bg-white/5 backdrop-blur-sm">
                        {idx + 1}
                    </div>
                </div>
                <div className="relative z-10 flex-1 flex items-center">
                    <ul className="space-y-6 w-full">
                    {slide.points.map((point, pIdx) => (
                        <li key={pIdx} className="flex items-start gap-4 text-xl text-indigo-50 font-light">
                        <div className="mt-2 w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_10px_rgba(129,140,248,0.8)] shrink-0" />
                        {point}
                        </li>
                    ))}
                    </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'quiz' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
            <div className="bg-gradient-to-r from-indigo-500 to-violet-500 p-6 rounded-2xl text-white shadow-lg flex justify-between items-center">
               <div>
                   <h3 className="text-2xl font-bold">اختبار سريع</h3>
                   <p className="opacity-90">أثبت مهارتك في {localQuiz.length} أسئلة</p>
               </div>
               {userRole === 'student' && quizSubmitted && (
                 <div className="bg-white/20 backdrop-blur-md px-6 py-3 rounded-xl font-bold text-2xl">
                   {score} / {localQuiz.length}
                 </div>
               )}
            </div>

            {localQuiz.map((q, qIdx) => (
              <div key={qIdx} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                <h4 className="text-xl font-bold text-slate-800 mb-6 flex gap-3">
                  <span className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0">{qIdx + 1}</span> 
                  {q.question}
                </h4>
                <div className="grid gap-3">
                  {q.options.map((opt, oIdx) => {
                    let style = "border-slate-200 hover:border-indigo-300 hover:bg-slate-50";
                    if (userRole === 'student') {
                        const isSelected = studentAnswers[qIdx] === opt;
                        if (quizSubmitted) {
                            if (opt === q.correctAnswer) style = "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold";
                            else if (isSelected) style = "bg-red-50 border-red-500 text-red-700";
                            else style = "opacity-50 border-slate-100";
                        } else if (isSelected) {
                            style = "bg-indigo-50 border-indigo-500 text-indigo-700 ring-1 ring-indigo-500";
                        }
                    } else if (opt === q.correctAnswer) {
                        style = "bg-emerald-50 border-emerald-500 text-emerald-700";
                    }
                    
                    return (
                      <div 
                        key={oIdx} 
                        onClick={() => userRole === 'student' && !quizSubmitted && handleStudentSelect(qIdx, opt)}
                        className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex justify-between items-center ${style}`}
                      >
                        <span className="font-medium">{opt}</span>
                        {userRole === 'student' && quizSubmitted && opt === q.correctAnswer && <CheckCircle className="text-emerald-500" />}
                        {userRole === 'student' && quizSubmitted && studentAnswers[qIdx] === opt && opt !== q.correctAnswer && <XCircle className="text-red-500" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            
            {userRole === 'student' && (
               <div className="sticky bottom-4 flex justify-center">
                  {!quizSubmitted ? (
                    <button 
                      onClick={submitQuiz}
                      disabled={Object.keys(studentAnswers).length !== localQuiz.length}
                      className={`px-12 py-4 rounded-full font-bold text-lg text-white shadow-xl transition-all transform hover:scale-105 ${
                        Object.keys(studentAnswers).length === localQuiz.length
                        ? 'bg-gradient-to-r from-indigo-600 to-violet-600'
                        : 'bg-slate-300 cursor-not-allowed'
                      }`}
                    >
                      تسليم الإجابات
                    </button>
                  ) : (
                    <button 
                      onClick={() => { setStudentAnswers({}); setQuizSubmitted(false); setScore(0); }}
                      className="px-8 py-3 bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 rounded-full font-bold"
                    >
                      محاولة مرة أخرى
                    </button>
                  )}
               </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
            <div className="h-[600px] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200">
                <ChatInterface teacher={teacher} lessonContext={output.explanation} />
            </div>
        )}
      </div>
    </div>
  );
};

export default LessonOutputView;
