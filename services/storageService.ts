
import { Teacher, Lesson, UserProfile, ScheduleItem } from '../types';

const TEACHERS_KEY = 'vt_teachers';
const LESSONS_KEY = 'vt_lessons';
const USER_KEY = 'vt_user_profile';
const SCHEDULE_KEY = 'vt_schedule';

// --- User Profile ---
export const getUserProfile = (): UserProfile | null => {
  const stored = localStorage.getItem(USER_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const saveUserProfile = (profile: UserProfile): void => {
  localStorage.setItem(USER_KEY, JSON.stringify(profile));
};

export const clearUserProfile = (): void => {
  localStorage.removeItem(USER_KEY);
};

// --- Teachers ---
export const getTeachers = (): Teacher[] => {
  const stored = localStorage.getItem(TEACHERS_KEY);
  if (!stored) {
    return [];
  }
  return JSON.parse(stored);
};

export const saveTeacher = (teacher: Teacher): void => {
  const teachers = getTeachers();
  const existingIndex = teachers.findIndex(t => t.id === teacher.id);
  if (existingIndex >= 0) {
    teachers[existingIndex] = teacher;
  } else {
    teachers.push(teacher);
  }
  localStorage.setItem(TEACHERS_KEY, JSON.stringify(teachers));
};

export const deleteTeacher = (id: string): void => {
  const teachers = getTeachers().filter(t => t.id !== id);
  localStorage.setItem(TEACHERS_KEY, JSON.stringify(teachers));
};

// --- Lessons ---
export const getLessons = (): Lesson[] => {
  const stored = localStorage.getItem(LESSONS_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveLesson = (lesson: Lesson): void => {
  const lessons = getLessons();
  const existingIndex = lessons.findIndex(l => l.id === lesson.id);
  if (existingIndex >= 0) {
    lessons[existingIndex] = lesson;
  } else {
    lessons.unshift(lesson);
  }
  localStorage.setItem(LESSONS_KEY, JSON.stringify(lessons));
};

export const deleteLesson = (id: string): void => {
  const lessons = getLessons().filter(l => l.id !== id);
  localStorage.setItem(LESSONS_KEY, JSON.stringify(lessons));
};

// --- Schedule ---
export const getSchedule = (): ScheduleItem[] => {
  const stored = localStorage.getItem(SCHEDULE_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveScheduleItem = (item: ScheduleItem): void => {
  const schedule = getSchedule();
  schedule.push(item);
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
};

export const deleteScheduleItem = (id: string): void => {
  const schedule = getSchedule().filter(s => s.id !== id);
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
};
