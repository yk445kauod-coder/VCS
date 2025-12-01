
import React, { useState, useEffect } from 'react';
import { CommunityPost, UserProfile } from '../types';
import { publishPost, subscribeToCommunity } from '../services/firebase';
import { MessageSquare, Heart, Send, User } from 'lucide-react';

interface Props {
  user: UserProfile;
}

const CommunityFeed: React.FC<Props> = ({ user }) => {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    subscribeToCommunity((data) => {
      setPosts(data);
    });
  }, []);

  const handlePost = () => {
    if (!newContent.trim()) return;
    const post: CommunityPost = {
      id: Date.now().toString(),
      authorId: user.id,
      authorName: user.name,
      content: newContent,
      likes: 0,
      comments: [],
      createdAt: Date.now()
    };
    publishPost(post);
    setNewContent('');
  };

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
                className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors"
              >
                <Send size={18} /> نشر
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-6">
        {posts.map(post => (
          <div key={post.id} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
               <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                 <User size={20} />
               </div>
               <div>
                 <h4 className="font-bold text-slate-800">{post.authorName}</h4>
                 <span className="text-xs text-slate-400">{new Date(post.createdAt).toLocaleDateString('ar-EG')}</span>
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
