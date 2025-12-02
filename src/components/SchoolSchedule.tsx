
import React, { useState, useEffect } from 'react';
import { Teacher, ScheduleItem, UserRole } from '../types';
import { subscribeToSchedule, saveScheduleItemToDB, deleteScheduleItemFromDB } from '../services/firebase';
import { Calendar, Clock, User, Plus, Trash2, BrainCircuit, Loader2 } from 'lucide-react';

interface Props {
  teachers: Teacher[];
  userRole: UserRole;
  schoolId: string | null | undefined;
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const TIMES = ['08:00 ص', '09:00 ص', '10:00 ص', '11:00 ص', '12:00 م', '01:00 م'];

const SchoolSchedule: React.FC<Props> = ({ teachers, userRole, schoolId }) => {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  
  // Add mode state
  const [isAdding, setIsAdding] = useState(false);
  const [newTime, setNewTime] = useState(TIMES[0]);
  const [newTeacherId, setNewTeacherId] = useState('');
  const [newSubject, setNewSubject] = useState('');

  useEffect(() => {
    if (!schoolId) {
        setLoading(false);
        return;
    }
    setLoading(true);
    const unsubscribe = subscribeToSchedule(schoolId, (data) => {
        setSchedule(data);
        setLoading(false);
    });
    return () => unsubscribe();
  }, [schoolId]);

  useEffect(() => {
    if (teachers.length > 0 && !newTeacherId) {
      const firstTeacher = teachers[0];
      setNewTeacherId(firstTeacher.id);
      setNewSubject(firstTeacher.subject);
    }
  }, [teachers, newTeacherId]);

  const handleAdd = () => {
    if (!newTeacherId || !newSubject || !schoolId) return;
    const newItem: ScheduleItem = {
      id: Date.now().toString(),
      day: selectedDay,
      timeSlot: newTime,
      teacherId: newTeacherId,
      subject: newSubject
    };
    saveScheduleItemToDB(schoolId, newItem);
    setIsAdding(false); // Close the add form
  };

  const handleDelete = (id: string) => {
    if (!schoolId) return;
    if (confirm('هل أنت متأكد من حذف هذه الحصة؟')) {
        deleteScheduleItemFromDB(schoolId, id);
    }
  };

  const filteredSchedule = schedule.filter(s => s.day === selectedDay).sort((a, b) => TIMES.indexOf(a.timeSlot) - TIMES.indexOf(b.timeSlot));

  if (!schoolId) {
    return (
        <div className="max-w-3xl mx-auto space-y-8 text-center bg-white p-10 rounded-3xl border-2 border-dashed border-slate-200">
             <BrainCircuit size={48} className="mx-auto text-slate-300" />
            <h2 className="text-2xl font-bold text-slate-700">الجدول الدراسي غير متاح</h2>
            <p className="text-slate-500">
                يجب أن تكون عضوًا في مدرسة لعرض جدولها الدراسي.
            </p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <Calendar className="text-indigo-600" />
             جدول الحصص الأسبوعي
           </h2>
           <p className="text-slate-500">نظم وقتك ودراستك مع مدرسة المستقبل</p>
        </div>
        
        {/* Day Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full no-scrollbar">
          {DAYS.map(day => (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                selectedDay === day ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Timetable List */}
        <div className="lg:col-span-2 space-y-4">
           {loading && <div className="p-10 text-center"><Loader2 className="animate-spin text-indigo-500 mx-auto" /></div>}
           {!loading && filteredSchedule.length === 0 && (
             <div className="text-center py-16 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
               <p className="text-slate-400 font-bold">لا توجد حصص مجدولة لهذا اليوم</p>
             </div>
           )}
           {!loading && filteredSchedule.map(item => {
               const teacher = teachers.find(t => t.id === item.teacherId);
               return (
                 <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex items-center gap-4">
                       <div className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center font-bold border ${teacher ? teacher.avatarColor?.replace('bg-', 'bg-') + '/10' : 'bg-indigo-50'} text-indigo-600`}>
                          <Clock size={16} className="mb-1 opacity-50" />
                          <span className="text-xs">{item.timeSlot}</span>
                       </div>
                       <div>
                          <h3 className="font-bold text-lg text-slate-800">{item.subject}</h3>
                          {teacher ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <User size={14} />
                              {teacher.name}
                            </div>
                           ) : (
                            <div className="text-sm text-red-500">معلم غير معروف</div>
                           )}
                       </div>
                    </div>
                    {userRole === 'creator' && (
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all">
                           <Trash2 size={18} />
                        </button>
                    )}
                 </div>
               );
             })
           }
        </div>

        {/* Add Class Form (Creator Only) */}
        {userRole === 'creator' && (
          <div className="bg-white p-6 rounded-3xl h-fit border border-slate-100 shadow-sm sticky top-4">
            {!isAdding ? (
                 <button 
                    onClick={() => setIsAdding(true)}
                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                >
                    <Plus size={18} /> إضافة حصة ليوم {selectedDay}
                </button>
            ) : (
                <>
                <h3 className="font-bold text-indigo-900 mb-4 flex items-center gap-2">
                <Plus size={18} /> إضافة حصة جديدة
                </h3>
                
                <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-indigo-400 uppercase mb-1">التوقيت</label>
                    <div className="grid grid-cols-2 gap-2">
                    {TIMES.map(t => (
                        <button
                        key={t}
                        onClick={() => setNewTime(t)}
                        className={`py-2 rounded-lg text-xs font-bold border ${newTime === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}
                        >
                        {t}
                        </button>
                    ))}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-indigo-400 uppercase mb-1">المعلم</label>
                    <select 
                    className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    value={newTeacherId}
                    onChange={(e) => {
                        const selectedId = e.target.value;
                        setNewTeacherId(selectedId);
                        const t = teachers.find(tea => tea.id === selectedId);
                        if (t) setNewSubject(t.subject);
                    }}
                    >
                    {teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name} - {t.subject}</option>
                    ))}
                    </select>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={() => setIsAdding(false)}
                        className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                        إلغاء
                    </button>
                    <button 
                        onClick={handleAdd}
                        className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                    >
                        إضافة
                    </button>
                </div>
                </div>
                </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolSchedule;
