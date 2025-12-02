
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
  username: string;
  password?: string; // For login simulation only
  name: string;
  gradeLevel: string;
  role: UserRole;
  isRealTeacher?: boolean;
  schoolId?: string | null;
  pendingSchoolId?: string | null;
  createdAt: number;
}

export interface School {
  id: string;
  ownerId: string;
  name: string;
  code: string;
  description: string;
  students: string[];
  pendingStudents: string[];
}

export interface Teacher {
  id: string;
  ownerId: string;
  name: string;
  subject: string;
  personality: TeacherPersonality;
  avatarColor: string;
  avatarIcon?: string;
  schoolId?: string | null;
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

export interface LessonOutput {
  explanation: string;
  summary: string;
  visualDiagram: string;
  interactiveElement?: string | null;
  quiz: QuizQuestion[];
  slides: SlideContent[];
  infographicData: string[];
  groundingUrls?: GroundingSource[];
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
  day: string;
  timeSlot: string;
  teacherId: string;
  subject: string;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  likes: number;
  comments: { authorId: string; authorName: string; text: string }[];
  createdAt: number;
}

    