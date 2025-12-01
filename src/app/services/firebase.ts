
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove, update, get, child, Unsubscribe } from "firebase/database";
import { UserProfile, Teacher, Lesson, School, CommunityPost } from "../types";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "vcs-demo-424113.firebaseapp.com",
    databaseURL: "https://vcs-demo-424113-default-rtdb.firebaseio.com",
    projectId: "vcs-demo-424113",
    storageBucket: "vcs-demo-424113.appspot.com",
    messagingSenderId: "360702442220",
    appId: "1:360702442220:web:1931327666c07299a9a541",
    measurementId: "G-L5B9S8B642"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- User Operations ---
export const saveUserToDB = (user: UserProfile) => {
  const { password, ...userToSave } = user; // Don't save password if you don't need to re-verify it on server.
  set(ref(db, 'users/' + user.id), userToSave);
  // In a real app, the password would be hashed and handled by Firebase Auth.
  // For this demo, we store it to simulate login.
  set(ref(db, 'user_credentials/' + user.id), { password: user.password });
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

    return { ...user, password: creds.password };
};

// --- School Operations ---
export const createSchool = (school: School, userId: string) => {
  const updates: any = {};
  updates['/schools/' + school.id] = school;
  updates[`/users/${userId}/schoolId`] = school.id; // Automatically make creator a member
  update(ref(db), updates);
};

export const getSchoolById = async (schoolId: string): Promise<School | null> => {
  const snapshot = await get(ref(db, `schools/${schoolId}`));
  if (snapshot.exists()) {
    return snapshot.val();
  }
  return null;
};

export const joinSchoolRequest = (schoolCode: string, userId: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    get(ref(db, 'schools')).then((snapshot) => {
      if (snapshot.exists()) {
        const schools = snapshot.val();
        const schoolId = Object.keys(schools).find(key => schools[key].code === schoolCode);
        
        if (schoolId) {
          const school = schools[schoolId];
          const pending = school.pendingStudents || [];
          if (!pending.includes(userId) && !(school.students || []).includes(userId)) {
             pending.push(userId);
             
             const updates: any = {};
             updates[`schools/${schoolId}/pendingStudents`] = pending;
             updates[`users/${userId}/pendingSchoolId`] = schoolId;
             
             update(ref(db), updates)
                .then(() => resolve(school.name))
                .catch(err => reject(err));
          } else {
             reject(new Error("أنت بالفعل عضو أو الطلب قيد الانتظار"));
          }
        } else {
          reject(new Error("كود المدرسة غير صحيح"));
        }
      } else {
        reject(new Error("لا توجد مدارس"));
      }
    });
  });
};

export const approveStudent = (schoolId: string, studentId: string) => {
  get(ref(db, `schools/${schoolId}`)).then(snapshot => {
    if (snapshot.exists()) {
      const school = snapshot.val();
      const pending = (school.pendingStudents || []).filter((id: string) => id !== studentId);
      const students = (school.students || []);
      if (!students.includes(studentId)) {
        students.push(studentId);
      }
      
      const updates: any = {};
      updates[`schools/${schoolId}/pendingStudents`] = pending;
      updates[`schools/${schoolId}/students`] = students;
      updates[`users/${studentId}/schoolId`] = schoolId;
      updates[`users/${studentId}/pendingSchoolId`] = null;
      
      update(ref(db), updates);
    }
  });
};

export const rejectStudent = (schoolId: string, studentId: string) => {
  get(ref(db, `schools/${schoolId}`)).then(snapshot => {
    if (snapshot.exists()) {
      const school = snapshot.val();
      const pending = (school.pendingStudents || []).filter((id: string) => id !== studentId);
      
      const updates: any = {};
      updates[`schools/${schoolId}/pendingStudents`] = pending;
      updates[`users/${studentId}/pendingSchoolId`] = null;

      update(ref(db), updates);
    }
  });
};

export const getMySchool = (userId: string, callback: (school: School | null) => void): Unsubscribe => {
  const userRef = ref(db, `users/${userId}`);
  return onValue(userRef, (userSnapshot) => {
      const user = userSnapshot.val();
      if (user && user.schoolId) {
          const schoolRef = ref(db, `schools/${user.schoolId}`);
          onValue(schoolRef, (schoolSnapshot) => {
              callback(schoolSnapshot.val());
          });
      } else {
          callback(null);
      }
  });
};

// --- Teacher Operations ---
export const saveTeacherToDB = (teacher: Teacher) => {
  set(ref(db, 'teachers/' + teacher.id), teacher);
};

export const subscribeToTeachers = (userId: string, schoolId: string | null | undefined, callback: (teachers: Teacher[]) => void): Unsubscribe => {
  const teachersRef = ref(db, 'teachers');
  return onValue(teachersRef, (snapshot) => {
    const data = snapshot.val();
    const loadedTeachers: Teacher[] = [];
    if (data) {
      Object.values(data).forEach((t: any) => {
        // Show teachers owned by user OR teachers belonging to user's school
        if (t.ownerId === userId || (schoolId && t.schoolId === schoolId)) {
          loadedTeachers.push(t);
        }
      });
    }
    callback(loadedTeachers);
  });
};

// --- Lesson Operations ---
export const saveLessonToDB = (lesson: Lesson) => {
  set(ref(db, 'lessons/' + lesson.id), lesson);
};

export const subscribeToLessons = (userId: string, schoolId: string | null | undefined, callback: (lessons: Lesson[]) => void): Unsubscribe => {
  const lessonsRef = ref(db, 'lessons');
  return onValue(lessonsRef, (snapshot) => {
    const data = snapshot.val();
    const loadedLessons: Lesson[] = [];
    if (data) {
        Object.values(data).forEach((l: any) => {
            // Show lessons created by the user
            if (l.ownerId === userId) {
                loadedLessons.push(l);
            } 
            // If the user is in a school, also show lessons created by the school owner (the 'real teacher')
            else if (schoolId && l.schoolId === schoolId) {
                // Future enhancement: Only show lessons from the designated school teachers.
                // For now, any lesson associated with the school is visible.
                 loadedLessons.push(l); 
            }
        });
    }
    callback(loadedLessons.sort((a,b) => b.createdAt - a.createdAt));
  });
};


// --- Community Feed Operations ---
export const subscribeToCommunity = (callback: (posts: CommunityPost[]) => void): Unsubscribe => {
  const communityRef = ref(db, 'community_posts');
  return onValue(communityRef, (snapshot) => {
      const data = snapshot.val();
      const posts: CommunityPost[] = data ? Object.values(data) : [];
      callback(posts.sort((a,b) => b.createdAt - a.createdAt));
  });
};

export const publishPost = (post: CommunityPost) => {
    set(ref(db, 'community_posts/' + post.id), post);
};
