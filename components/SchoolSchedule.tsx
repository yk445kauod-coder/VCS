import React, { useState, useEffect } from 'react';
import { Teacher, ScheduleItem, UserRole } from '../types';
import { getSchedule, saveScheduleItem, deleteScheduleItem } from '../services/storageService';
import { Calendar, Clock, User, Plus, Trash2 } from 'lucide-react';

interface Props {
  teachers: Teacher[];
  userRole: UserRole;
}

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const TIMES = ['08:00 ص', '09:00 ص', '10:00 ص', '11:00 ص', '12:00 م', '01:00 م'];

const SchoolSchedule: React.FC<Props> = ({ teachers, userRole }) => {
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [selectedDay, setSelectedDay] = useState(DAYS[0]);
  
  // Add mode state
  const [newTime, setNewTime] = useState(TIMES[0]);
  const [newTeacherId, setNewTeacherId] = useState('');
  const [newSubject, setNewSubject] = useState('');

  useEffect(() => {
    setSchedule(getSchedule());
    if (teachers.length > 0) {
      setNewTeacherId(teachers[0].id);
      setNewSubject(teachers[0].subject);
    }
  }, [teachers]);

  const handleAdd = () => {
    if (!newTeacherId || !newSubject) return;
    const newItem: ScheduleItem = {
      id: Date.now().toString(),
      day: selectedDay,
      timeSlot: newTime,
      teacherId: newTeacherId,
      subject: newSubject
    };
    saveScheduleItem(newItem);
    setSchedule(prev => [...prev, newItem]);
  };

  const handleDelete = (id: string) => {
    deleteScheduleItem(id);
    setSchedule(prev => prev.filter(item => item.id !== id));
  };

  const filteredSchedule = schedule.filter(s => s.day === selectedDay).sort((a, b) => TIMES.indexOf(a.timeSlot) - TIMES.indexOf(b.timeSlot));

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
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto max-w-full">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Timetable List */}
        <div className="lg:col-span-2 space-y-4">
           {filteredSchedule.length === 0 ? (
             <div className="text-center py-16 bg-white/50 rounded-3xl border-2 border-dashed border-slate-200">
               <p className="text-slate-400 font-bold">لا توجد حصص مجدولة لهذا اليوم</p>
             </div>
           ) : (
             filteredSchedule.map(item => {
               const teacher = teachers.find(t => t.id === item.teacherId);
               return (
                 <div key={item.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow group">
                    <div className="flex items-center gap-4">
                       <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-xl flex flex-col items-center justify-center font-bold border border-indigo-100">
                          <Clock size={16} className="mb-1 opacity-50" />
                          <span className="text-xs">{item.timeSlot}</span>
                       </div>
                       <div>
                          <h3 className="font-bold text-lg text-slate-800">{item.subject}</h3>
                          <div className="flex items-center gap-2 text-sm text-slate-500">
                             <User size={14} />
                             {teacher?.name || 'معلم غير معروف'}
                          </div>
                       </div>
                    </div>
                    {userRole === 'creator' && (
                        <button onClick={() => handleDelete(item.id)} className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                           <Trash2 size={18} />
                        </button>
                    )}
                 </div>
               );
             })
           )}
        </div>

        {/* Add Class Form (Creator Only) */}
        {userRole === 'creator' && (
          <div className="bg-indigo-50 p-6 rounded-3xl h-fit border border-indigo-100">
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
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  value={newTeacherId}
                  onChange={(e) => {
                    setNewTeacherId(e.target.value);
                    const t = teachers.find(tea => tea.id === e.target.value);
                    if (t) setNewSubject(t.subject);
                  }}
                >
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} - {t.subject}</option>
                  ))}
                </select>
              </div>

              <button 
                onClick={handleAdd}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all mt-2"
              >
                إضافة للجدول
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolSchedule;
