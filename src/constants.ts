import { TeacherPersonality } from "./types";

// Tailwind CSS color classes for the avatar backgrounds
export const COLORS = [
  'bg-slate-500', 'bg-red-500', 'bg-orange-500', 'bg-amber-500', 
  'bg-yellow-500', 'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 
  'bg-teal-500', 'bg-cyan-500', 'bg-sky-500', 'bg-blue-500', 
  'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500', 
  'bg-pink-500', 'bg-rose-500'
];

// High-quality emoji presets for teacher avatars
export const AVATAR_PRESETS = [
  { color: 'bg-blue-500', icon: '👨‍🏫' },
  { color: 'bg-emerald-500', icon: '👩‍🏫' },
  { color: 'bg-purple-500', icon: '🧙' },
  { color: 'bg-orange-500', icon: '🤖' },
  { color: 'bg-pink-500', icon: '👩‍🔬' },
  { color: 'bg-indigo-500', icon: '👨‍💻' },
  { color: 'bg-teal-500', icon: '🦉' },
  { color: 'bg-amber-500', icon: '🦁' },
  { color: 'bg-cyan-500', icon: '🧠' },
  { color: 'bg-rose-500', icon: '🎨' },
  { color: 'bg-red-500', icon: '🧑‍🚀' },
  { color: 'bg-violet-500', icon: '🧞' },
];

// Helper to map personalities to suggested avatar presets
export const PERSONALITY_DEFAULTS: Record<TeacherPersonality, { color: string, icon: string }> = {
  [TeacherPersonality.Formal]: { color: 'bg-slate-500', icon: '👨‍🏫' },
  [TeacherPersonality.Friendly]: { color: 'bg-emerald-500', icon: '👩‍🏫' },
  [TeacherPersonality.Sarcastic]: { color: 'bg-teal-500', icon: '🦉' },
  [TeacherPersonality.Encouraging]: { color: 'bg-amber-500', icon: '🦁' },
  [TeacherPersonality.Socratic]: { color: 'bg-cyan-500', icon: '🧠' },
  [TeacherPersonality.Simplistic]: { color: 'bg-yellow-500', icon: '🧸' },
};
