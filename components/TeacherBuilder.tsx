import React, { useState, useEffect } from 'react';
import { Teacher, TeacherPersonality } from '../types';
import { COLORS, AVATAR_PRESETS } from '../constants';
import { Save, User, BookOpen, Trash2, AlertCircle, Sparkles } from 'lucide-react';

interface Props {
  onSave: (teacher: Teacher) => void;
  onCancel: () => void;
  existingTeacher?: Teacher;
  onDelete?: (id: string) => void;
}

// Helper to map personalities to visual vibes
const PERSONALITY_DEFAULTS: Record<TeacherPersonality, { color: string, icon: string }> = {
  [TeacherPersonality.Formal]: { color: 'bg-indigo-500', icon: '👨‍🏫' },
  [TeacherPersonality.Friendly]: { color: 'bg-emerald-500', icon: '👩‍🏫' },
  [TeacherPersonality.Sarcastic]: { color: 'bg-purple-500', icon: '🦉' },
  [TeacherPersonality.Encouraging]: { color: 'bg-rose-500', icon: '🦁' },
  [TeacherPersonality.Socratic]: { color: 'bg-teal-500', icon: '🧠' },
  [TeacherPersonality.Simplistic]: { color: 'bg-amber-500', icon: '🧸' },
};

const TeacherBuilder: React.FC<Props> = ({ onSave, onCancel, existingTeacher, onDelete }) => {
  const [name, setName] = useState(existingTeacher?.name || '');
  const [subject, setSubject] = useState(existingTeacher?.subject || '');
  const [personality, setPersonality] = useState<TeacherPersonality>(existingTeacher?.personality || TeacherPersonality.Friendly);
  const [avatarColor, setAvatarColor] = useState(existingTeacher?.avatarColor || AVATAR_PRESETS[0].color);
  const [avatarIcon, setAvatarIcon] = useState(existingTeacher?.avatarIcon || AVATAR_PRESETS[0].icon);
  const [error, setError] = useState<string | null>(null);

  // Auto-suggest avatar when personality changes (only if creating new or user hasn't heavily customized yet)
  const handlePersonalityChange = (newPersonality: TeacherPersonality) => {
    setPersonality(newPersonality);
    if (!existingTeacher) {
        const suggestion = PERSONALITY_DEFAULTS[newPersonality];
        if (suggestion) {
            setAvatarColor(suggestion.color);
            setAvatarIcon(suggestion.icon);
        }
    }
  };

  const handleAvatarSelect = (color: string, icon: string) => {
    setAvatarColor(color);
    setAvatarIcon(icon);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!COLORS.includes(avatarColor)) {
      setError('خطأ: لون الصورة الرمزية غير صالح.');
      return;
    }
    if (!name.trim() || !subject.trim()) {
      setError('يرجى ملء جميع الحقول المطلوبة.');
      return;
    }
    onSave({
      id: existingTeacher?.id || Date.now().toString(),
      name,
      subject,
      personality,
      avatarColor,
      avatarIcon
    });
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-50 to-white px-8 py-6 border-b border-slate-100 flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-extrabold text-slate-800">
             {existingTeacher ? 'تعديل الملف الشخصي' : 'بناء معلم جديد'}
           </h2>
           <p className="text-slate-500 text-sm mt-1">قم بتصميم شخصية المعلم الافتراضي</p>
        </div>
        {existingTeacher && onDelete && (
            <button 
                type="button"
                onClick={() => onDelete(existingTeacher.id)}
                className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                title="حذف المعلم"
            >
                <Trash2 size={20} />
            </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-8 space-y-8">
        
        {/* Avatar Section */}
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
             <Sparkles size={16} className="text-indigo-500"/>
             اختر الأفاتار (المظهر)
          </label>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
            {AVATAR_PRESETS.map((preset, idx) => {
              const isSelected = avatarColor === preset.color && avatarIcon === preset.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAvatarSelect(preset.color, preset.icon)}
                  className={`
                    relative aspect-square rounded-2xl flex items-center justify-center text-4xl transition-all duration-300
                    ${preset.color} 
                    ${isSelected ? 'ring-4 ring-offset-2 ring-indigo-500 scale-105 shadow-xl' : 'hover:scale-105 hover:shadow-lg opacity-80 hover:opacity-100 grayscale-[0.3] hover:grayscale-0'}
                  `}
                >
                  <span className="drop-shadow-sm transform transition-transform">{preset.icon}</span>
                  {isSelected && (
                    <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full p-1.5 shadow-md">
                       <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700">اسم المعلم</label>
            <div className="relative group">
                <User className="absolute right-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pr-12 pl-4 py-3 rounded-xl bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-semibold text-slate-800 placeholder-slate-400"
                placeholder="مثال: الأستاذ أحمد"
                />
            </div>
            </div>

            <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700">التخصص الدراسي</label>
            <div className="relative group">
                <BookOpen className="absolute right-4 top-3.5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                <input
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full pr-12 pl-4 py-3 rounded-xl bg-slate-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-semibold text-slate-800 placeholder-slate-400"
                placeholder="مثال: الفيزياء، التاريخ"
                />
            </div>
            </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-bold text-slate-700">أسلوب التدريس (الشخصية)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
             {Object.values(TeacherPersonality).map((p) => (
               <button
                 key={p}
                 type="button"
                 onClick={() => handlePersonalityChange(p)}
                 className={`px-4 py-3 rounded-xl text-sm font-bold border-2 transition-all ${
                    personality === p 
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700' 
                    : 'border-slate-100 bg-white text-slate-600 hover:border-indigo-200'
                 }`}
               >
                 {p}
               </button>
             ))}
          </div>
          <p className="text-xs text-slate-400 mt-2 pr-1">
             * اختيار الشخصية سيقترح مظهراً مناسباً، لكن يمكنك تغييره.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 text-red-600 bg-red-50 p-4 rounded-xl text-sm font-medium animate-pulse">
             <AlertCircle size={18} />
             {error}
          </div>
        )}

        <div className="flex gap-4 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-6 py-3.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-bold transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="flex-1 px-6 py-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold flex justify-center items-center gap-2 shadow-lg shadow-indigo-200 transition-all hover:translate-y-[-1px]"
          >
            <Save size={20} />
            حفظ المعلم
          </button>
        </div>
      </form>
    </div>
  );
};

export default TeacherBuilder;
