
export enum TeacherPersonality {
  Formal = "رسمي وأكاديمي",
  Friendly = "ودود ودافئ",
  Sarcastic = "ساخر وذكي",
  Encouraging = "متحمس ومشجع",
  Socratic = "سقراطي وتساؤلي",
  Simplistic = "بسطها لي (للأطفال)"
}

export type UserRole = 'creator' | 'student';
export type LessonLength = 'brief' | 'standard' | 'detailed';

export interface UserProfile {
  id: string; // Firebase ID (Username)
  username: string; // Display/Login Username
  password?: string; // Simple password protection
  name: string;
  gradeLevel: string; // e.g., "الصف العاشر"
  role: UserRole; // Stored role preference
  isRealTeacher?: boolean; // If true, they can create schools
  schoolId?: string | null; // ID of the school they belong to
  pendingSchoolId?: string; // ID of school requested to join
  createdAt: number;
}

export interface School {
  id: string;
  ownerId: string; // The Real Teacher who created it
  name:string;
  code: string; // Unique join code
  description: string;
  students: string[]; // Array of UserProfile IDs
  pendingStudents: string[]; // Array of UserProfile IDs waiting for approval
}

export interface Teacher {
  id: string;
  ownerId: string; // User ID who created this AI teacher
  name: string;
  subject: string;
  personality: TeacherPersonality;
  avatarColor: string;
  avatarIcon?: string;
  schoolId?: string | null; // If part of a school
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
}

export interface SlideContent {
  title: string;
  points: string[];
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface InteractiveElement {
    type: string;
    code: string;
}

export interface LessonOutput {
  explanation: string;
  summary: string;
  visualDiagram: string;
  interactiveElement?: string;
  quiz: QuizQuestion[];
  slides: SlideContent[];
  infographicData: string[];
  groundingUrls?: GroundingSource[];
  mermaidCode?: string;
}

export interface Lesson {
  id: string;
  teacherId: string;
  ownerId: string;
  topic: string;
  originalContent: string;
  length: LessonLength;
  output: LessonOutput | null;
  createdAt: number;
  isPublic?: boolean; // For community sharing
  schoolId?: string | null;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
}

export interface ScheduleItem {
  id: string;
  day: string; // Sunday, Monday, etc.
  timeSlot: string; // "09:00 AM"
  teacherId: string;
  subject: string;
  schoolId?: string; // Global schedule if part of a school
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  lessonId?: string; // Optional attachment
  likes: number;
  comments: { author: string; text: string }[];
  createdAt: number;
}
