import React, { useState, useEffect } from 'react';
import { CommunityPost, UserProfile } from '../types';
import { publishPost, subscribeToCommunity } from '../services/firebase';
import { MessageSquare, Heart, Send, User, BrainCircuit } from 'lucide-react';

interface Props {
  user: UserProfile;
}

const CommunityFeed: React.FC<Props> = ({ user }) => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [newContent, setNewContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user.schoolId) {
        setLoading(false);
        return;
    }
    const unsubscribe = subscribeToCommunity(user.schoolId, (data) => {
      setPosts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user.schoolId]);

  const handlePost = () => {
    if (!newContent.trim() || !user.schoolId) return;
    const post: CommunityPost = {
      id: Date.now().toString(),
      authorId: user.id,
      authorName: user.name,
      content: newContent,
      likes: 0,
      comments: [],
      createdAt: Date.now()
    };
    publishPost(user.schoolId, post);
    setNewContent('');
  };

  if (!user.schoolId) {
    return (
        <div className="max-w-3xl mx-auto space-y-8 text-center bg-white p-10 rounded-3xl border-2 border-dashed border-slate-200">
             <BrainCircuit size={48} className="mx-auto text-slate-300" />
            <h2 className="text-2xl font-bold text-slate-700">المجتمع المدرسي غير متاح</h2>
            <p className="text-slate-500">
                يجب أن تكون عضوًا في مدرسة للوصول إلى المجتمع. انضم إلى مدرسة أو أنشئ واحدة من خلال صفحة "إدارة المدرسة".
            </p>
        </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 p-8 rounded-3xl text-white shadow-lg">
        <h2 className="text-3xl font-bold mb-2">مجتمع المدرسة</h2>
        <p className="opacity-90">شارك أفكارك، اسأل زملائك، وتفاعل مع المعلمين.</p>
      </div>

      {/* Post Creator */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold text-xl shrink-0">
            {user.name[0]}
          </div>
          <div className="flex-1">
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="ماذا يدور في ذهنك؟"
              className="w-full bg-slate-50 border-0 rounded-xl p-4 min-h-[100px] focus:ring-2 focus:ring-indigo-200 outline-none resize-none font-medium"
            />
            <div className="flex justify-end mt-3">
              <button 
                onClick={handlePost}
                disabled={!newContent.trim()}
                className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors disabled:bg-slate-300"
              >
                <Send size={18} /> نشر
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {loading && <div className="text-center p-10 text-slate-400">جاري تحميل المشاركات...</div>}
        {!loading && posts.length === 0 && (
            <div className="text-center p-10 bg-white rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400">لا توجد مشاركات حتى الآن. كن أول من يشارك!</p>
            </div>
        )}
        {posts.map(post => (
          <div key={post.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                 {post.authorName[0]}
               </div>
               <div>
                 <h4 className="font-bold text-slate-800">{post.authorName}</h4>
                 <span className="text-xs text-slate-400">{new Date(post.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}</span>
               </div>
            </div>
            
            <p className="text-slate-700 leading-relaxed text-lg mb-6 whitespace-pre-wrap">{post.content}</p>
            
            <div className="flex items-center gap-6 pt-4 border-t border-slate-50">
              <button className="flex items-center gap-2 text-slate-500 hover:text-rose-500 transition-colors font-bold">
                <Heart size={20} />
                <span>{post.likes}</span>
              </button>
              <button className="flex items-center gap-2 text-slate-500 hover:text-indigo-500 transition-colors font-bold">
                <MessageSquare size={20} />
                <span>{post.comments ? post.comments.length : 0} تعليق</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommunityFeed;
