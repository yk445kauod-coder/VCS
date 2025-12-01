import React, { useState, useRef, useEffect } from 'react';
import { Teacher, ChatMessage } from '../types';
import { generateChatResponse } from '../services/geminiService';
import { Send, User, Bot, Loader2 } from 'lucide-react';

interface Props {
  teacher: Teacher | undefined;
  lessonContext: string;
}

const ChatInterface: React.FC<Props> = ({ teacher, lessonContext }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !teacher) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), sender: 'user', text: inputText, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);
    try {
      const responseText = await generateChatResponse(teacher, lessonContext, messages, userMsg.text);
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'ai', text: responseText, timestamp: Date.now() }]);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  if (!teacher) return <div className="p-10 text-center text-slate-400">يرجى تحديد معلم أولاً</div>;

  return (
    <div className="flex flex-col h-full bg-[#f0f2f5]">
      {/* Header */}
      <div className="p-4 bg-white shadow-sm flex items-center gap-4 z-10">
        <div className={`w-12 h-12 rounded-full ${teacher.avatarColor} flex items-center justify-center text-white font-bold text-2xl shadow-md border-2 border-white`}>
          {teacher.avatarIcon || teacher.name[0]}
        </div>
        <div>
          <h3 className="font-bold text-slate-800 text-lg">{teacher.name}</h3>
          <p className="text-xs text-green-600 font-bold flex items-center gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> متصل الآن
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
             <Bot size={48} className="mb-2" />
             <p>ابدأ المحادثة مع {teacher.name}...</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex flex-col max-w-[75%] ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
               <div className={`px-5 py-3 rounded-2xl text-[15px] shadow-sm leading-relaxed ${
                 msg.sender === 'user' 
                   ? 'bg-indigo-600 text-white rounded-tr-none' 
                   : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
               }`}>
                 {msg.text}
               </div>
               <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
               </span>
            </div>
          </div>
        ))}

        {isLoading && (
            <div className="flex justify-start">
               <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                   <div className="flex gap-1">
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                   </div>
               </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-3 bg-slate-100 p-2 rounded-3xl border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-100 focus-within:border-indigo-300 transition-all">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="اكتب رسالتك..."
            className="flex-1 bg-transparent border-none px-4 py-2 focus:ring-0 outline-none text-slate-700"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputText.trim()}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isLoading || !inputText.trim() 
                ? 'bg-slate-300 text-white cursor-not-allowed' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
            }`}
          >
            <Send size={18} className={isLoading ? 'hidden' : 'ml-0.5'} />
            {isLoading && <Loader2 size={18} className="animate-spin" />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;