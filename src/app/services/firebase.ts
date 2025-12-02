
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove, update, get, child, Unsubscribe } from "firebase/database";
import { UserProfile, Teacher, Lesson, School, CommunityPost, ScheduleItem } from "../types";

// IMPORTANT: Replace this with your actual Firebase configuration
// This configuration is intended for demonstration purposes only.
const firebaseConfig = {
    apiKey: "AIzaSyBjZhFt0AAxdTBmZrwr1Yk0tX4a4Ln81C0",
    authDomain: "vcs-6d905.firebaseapp.com",
    databaseURL: "https://vcs-6d905-default-rtdb.firebaseio.com",
    projectId: "vcs-6d905",
    storageBucket: "vcs-6d905.appspot.com",
    messagingSenderId: "549325931380",
    appId: "1:549325931380:web:ba969cbe0238012f41e221"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- User Operations ---
export const saveUserToDB = (user: UserProfile) => {
  const { password, ...userToSave } = user;
  // Save public user profile
  set(ref(db, `users/${user.id}`), userToSave);
  // Save credentials separately for pseudo-auth.
  // In a real app, use Firebase Authentication.
  if (password) {
    set(ref(db, `user_credentials/${user.id}`), { password: password });
  }
};

export const getUserFromDB = async (userId: string): Promise<UserProfile | null> => {
  const snapshot = await get(child(ref(db), `users/${userId}`));
  if (snapshot.exists()) {
    return snapshot.val();
  }
  return null;
};

export const checkUserCredentials = async (username: string): Promise<UserProfile | null> => {
    const userSnap = await get(child(ref(db), `users/${username}`));
    if (!userSnap.exists()) return null;

    const credsSnap = await get(child(ref(db), `user_credentials/${username}`));
    if (!credsSnap.exists()) return null;
    
    const user = userSnap.val();
    const creds = credsSnap.val();

    return { ...user, password: creds.password, id: username };
};


// --- School Operations ---
export const createSchool = async (school: School, userId: string) => {
  const updates: Record<string, any> = {};
  updates[`/schools/${school.id}`] = school;
  updates[`/users/${userId}/schoolId`] = school.id;
  updates[`/users/${userId}/role`] = 'creator'; // Promote user to creator
  await update(ref(db), updates);
};

export const getSchoolById = async (schoolId: string): Promise<School | null> => {
  const snapshot = await get(ref(db, `schools/${schoolId}`));
  return snapshot.exists() ? snapshot.val() : null;
};

export const joinSchoolRequest = async (schoolCode: string, userId: string): Promise<string> => {
    const snapshot = await get(ref(db, 'schools'));
    if (!snapshot.exists()) throw new Error("No schools found in the database.");

    const schools = snapshot.val();
    const schoolId = Object.keys(schools).find(key => schools[key].code === schoolCode);
    
    if (!schoolId) throw new Error("Invalid school code.");

    const school = schools[schoolId];
    if ((school.students || []).includes(userId)) throw new Error("You are already a member of this school.");
    if ((school.pendingStudents || []).includes(userId)) throw new Error("Your request is already pending approval.");

    const updates: Record<string, any> = {};
    updates[`/schools/${schoolId}/pendingStudents`] = [...(school.pendingStudents || []), userId];
    updates[`/users/${userId}/pendingSchoolId`] = schoolId;
    
    await update(ref(db), updates);
    return school.name;
};

export const approveStudent = async (schoolId: string, studentId: string) => {
  const schoolSnapshot = await get(ref(db, `schools/${schoolId}`));
  if (!schoolSnapshot.exists()) return;

  const school = schoolSnapshot.val();
  const pending = (school.pendingStudents || []).filter((id: string) => id !== studentId);
  const students = [...(school.students || [])];
  if (!students.includes(studentId)) {
    students.push(studentId);
  }
  
  const updates: Record<string, any> = {};
  updates[`/schools/${schoolId}/pendingStudents`] = pending;
  updates[`/schools/${schoolId}/students`] = students;
  updates[`/users/${studentId}/schoolId`] = schoolId;
  updates[`/users/${studentId}/pendingSchoolId`] = null; // Use null to remove the field
  
  await update(ref(db), updates);
};

export const rejectStudent = async (schoolId: string, studentId: string) => {
  const schoolSnapshot = await get(ref(db, `schools/${schoolId}`));
  if (!schoolSnapshot.exists()) return;
  
  const school = schoolSnapshot.val();
  const pending = (school.pendingStudents || []).filter((id: string) => id !== studentId);
  
  const updates: Record<string, any> = {};
  updates[`/schools/${schoolId}/pendingStudents`] = pending;
  updates[`/users/${studentId}/pendingSchoolId`] = null;

  await update(ref(db), updates);
};

export const getMySchool = (userId: string, callback: (school: School | null) => void): Unsubscribe => {
  const userRef = ref(db, `users/${userId}`);
  let schoolUnsubscribe: Unsubscribe | null = null;

  const userUnsubscribe = onValue(userRef, (userSnapshot) => {
    if (schoolUnsubscribe) schoolUnsubscribe(); // Unsubscribe from previous school listener
    
    const user = userSnapshot.val();
    if (user && user.schoolId) {
        const schoolRef = ref(db, `schools/${user.schoolId}`);
        schoolUnsubscribe = onValue(schoolRef, (schoolSnapshot) => {
            callback(schoolSnapshot.exists() ? schoolSnapshot.val() : null);
        });
    } else {
        callback(null);
    }
  });

  // Return a function that unsubscribes from both
  return () => {
    userUnsubscribe();
    if (schoolUnsubscribe) schoolUnsubscribe();
  };
};

// --- Teacher Operations ---
export const saveTeacherToDB = (teacher: Teacher) => {
  // Ensure schoolId is not undefined
  const teacherToSave = { ...teacher, schoolId: teacher.schoolId || null };
  set(ref(db, `teachers/${teacher.id}`), teacherToSave);
};

export const deleteTeacherFromDB = (teacherId: string) => {
  remove(ref(db, `teachers/${teacherId}`));
};

export const subscribeToTeachers = (userId: string, schoolId: string | null | undefined, callback: (teachers: Teacher[]) => void): Unsubscribe => {
  const teachersRef = ref(db, 'teachers');
  return onValue(teachersRef, (snapshot) => {
    const data = snapshot.val();
    const loadedTeachers: Teacher[] = [];
    if (data) {
      for (const key in data) {
        const t = data[key];
        // Teacher is personal to the user OR belongs to the user's school
        if (t.ownerId === userId || (schoolId && t.schoolId === schoolId)) {
          loadedTeachers.push({ id: key, ...t });
        }
      }
    }
    callback(loadedTeachers);
  }, { onlyOnce: false });
};


// --- Lesson Operations ---
export const saveLessonToDB = (lesson: Lesson) => {
  set(ref(db, `lessons/${lesson.id}`), lesson);
};

export const subscribeToLessons = (userId: string, schoolId: string | null | undefined, callback: (lessons: Lesson[]) => void): Unsubscribe => {
  const lessonsRef = ref(db, 'lessons');
  return onValue(lessonsRef, (snapshot) => {
    const data = snapshot.val();
    const loadedLessons: Lesson[] = [];
    if (data) {
      for (const key in data) {
        const l = data[key];
        // Lesson was created by user OR belongs to user's school
        if (l.ownerId === userId || (schoolId && l.schoolId === schoolId)) {
          loadedLessons.push({ id: key, ...l });
        }
      }
    }
    callback(loadedLessons.sort((a,b) => b.createdAt - a.createdAt));
  });
};

// --- Community Feed Operations ---
export const subscribeToCommunity = (schoolId: string | null | undefined, callback: (posts: CommunityPost[]) => void): Unsubscribe => {
  if (!schoolId) {
    callback([]);
    return () => {}; // No-op unsubscribe
  }
  const communityRef = ref(db, `community_posts/${schoolId}`);
  return onValue(communityRef, (snapshot) => {
      const data = snapshot.val();
      const posts: CommunityPost[] = data ? Object.values(data) : [];
      callback(posts.sort((a, b) => b.createdAt - a.createdAt));
  });
};

export const publishPost = (schoolId: string, post: CommunityPost) => {
    set(ref(db, `community_posts/${schoolId}/${post.id}`), post);
};

// --- Schedule Operations ---
export const subscribeToSchedule = (schoolId: string | null | undefined, callback: (items: ScheduleItem[]) => void): Unsubscribe => {
  if (!schoolId) {
    callback([]);
    return () => {};
  }
  const scheduleRef = ref(db, `schedules/${schoolId}`);
  return onValue(scheduleRef, (snapshot) => {
    const data = snapshot.val();
    const items: ScheduleItem[] = data ? Object.values(data) : [];
    callback(items);
  });
};

export const saveScheduleItemToDB = (schoolId: string, item: ScheduleItem) => {
  set(ref(db, `schedules/${schoolId}/${item.id}`), item);
};

export const deleteScheduleItemFromDB = (schoolId: string, itemId: string) => {
  remove(ref(db, `schedules/${schoolId}/${itemId}`));
};

    