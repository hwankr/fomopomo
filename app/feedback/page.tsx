'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Send, Plus, MessageSquare, ChevronLeft, Loader2, User as UserIcon, Trash2, AlertTriangle, Image as ImageIcon, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { useTheme } from '@/components/ThemeProvider';

interface Feedback {
    id: string;
    content: string;
    status: 'pending' | 'reviewed' | 'implemented';
    user_id: string | null;
    created_at: string;
    author?: {
        nickname: string | null;
        email: string | null;
    };
    images?: string[];
}

interface Reply {
    id: string;
    feedback_id: string;
    user_id: string | null;
    content: string;
    created_at: string;
    is_admin?: boolean;
    author?: {
        nickname: string | null;
        email: string | null;
    };
    images?: string[];
}

// Helper to determine if a message is from the current user
const isMyMessage = (msgUserId: string | null, currentUserId: string) => {
    return msgUserId === currentUserId;
};

export default function FeedbackPage() {
    const [view, setView] = useState<'list' | 'chat' | 'new'>('list');
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
    const [replies, setReplies] = useState<Reply[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        if (view === 'chat') {
            // Small timeout to ensure rendering is complete
            setTimeout(scrollToBottom, 100);
        }
    }, [replies, view]);

    const [userRole, setUserRole] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session) {
                // Fetch user role
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();
                setUserRole(profile?.role || null);

                fetchFeedbacks();
            }
            setLoading(false);
        };
        init();
    }, []);

    // Real-time subscription for replies in the active chat
    useEffect(() => {
        if (view === 'chat' && selectedFeedback) {
            const channel = supabase
                .channel(`feedback_chat:${selectedFeedback.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'feedback_replies',
                        filter: `feedback_id=eq.${selectedFeedback.id}`
                    },
                    async (payload) => {
                        const newReply = payload.new as Reply;

                        // Avoid duplicate if optimistic update already added it (check by ID if possible, but optimistic usually has temp ID or we just rely on this)
                        // Actually, simplified: If it's my message, I might have optimistically added it. 
                        // But since I don't have the real ID yet in optimistic, it's tricky. 
                        // Strategy: 
                        // 1. Optimistic update adds item with temp-id.
                        // 2. Realtime comes in. 
                        // If I am the author, I should treat the realtime event as the "confirmation" and replace/dedupe.
                        // For now, let's just ignore realtime events from 'me' if we do optimistic updates, 
                        // OR simpler: invalidating and refetching is safest but slow. 
                        // Let's do: Fetch author info and append.
                        
                        // If it's me, we might normally skip if we did optimistic. 
                        // But let's check `session`.
                        if (session && newReply.user_id === session.user.id) {
                            // It's me. If we did optimistic update, we might have a duplicate if we just append.
                            // However, since we cleared optimistic state on success in handleSendReply, 
                            // we rely on the state update there. 
                            // WAIT: `handleSendReply` awaits the insert. So the list update happens THEN. 
                            // The realtime event might arrive Before or After.
                            // If we update state in handleSendReply, we should ignore this event if it's me.
                            return; 
                        }

                        // It's someone else (or me on another device). Fetch author.
                        let authorData = { nickname: 'unknown', email: 'unknown' };
                        if (newReply.user_id) {
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('nickname, email')
                                .eq('id', newReply.user_id)
                                .single();
                            if (profile) authorData = profile;
                        }

                        const replyWithAuthor = {
                            ...newReply,
                            author: authorData
                        };

                        setReplies(prev => [...prev, replyWithAuthor]);
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [view, selectedFeedback, session]);

    const fetchFeedbacks = async () => {
        const { data: feedbacksData } = await supabase
            .from('feedbacks')
            .select('*')
            .order('created_at', { ascending: false });

        if (feedbacksData) {
            const userIds = Array.from(new Set(feedbacksData.map(f => f.user_id).filter(Boolean))) as string[];
            
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, nickname, email')
                    .in('id', userIds);
                
                const profileMap = new Map(profiles?.map(p => [p.id, p]));
                
                const feedbacksWithAuthor = feedbacksData.map(f => ({
                    ...f,
                    author: f.user_id ? profileMap.get(f.user_id) : undefined
                }));
                
                setFeedbacks(feedbacksWithAuthor as Feedback[]);
            } else {
                setFeedbacks(feedbacksData as Feedback[]);
            }
        }
    };

    const fetchReplies = async (feedbackId: string) => {
        const { data: repliesData } = await supabase
            .from('feedback_replies')
            .select('*')
            .eq('feedback_id', feedbackId)
            .order('created_at', { ascending: true });

        if (repliesData) {
            const userIds = Array.from(new Set(repliesData.map(r => r.user_id).filter(Boolean))) as string[];
            
            if (userIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, nickname, email')
                    .in('id', userIds);
                
                const profileMap = new Map(profiles?.map(p => [p.id, p]));
                
                const repliesWithAuthor = repliesData.map(r => ({
                    ...r,
                    author: r.user_id ? profileMap.get(r.user_id) : undefined
                }));

                setReplies(repliesWithAuthor as Reply[]);
            } else {
                 setReplies(repliesData as Reply[]);
            }
        }
    };

    const handleCreateFeedback = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !session) return;
        setSubmitting(true);
        try {
            // 1. Upload Image if exists
            let imageUrls: string[] = [];
            if (imageFile) {
                const url = await uploadImage(imageFile);
                imageUrls.push(url);
            }

            // 2. Create Feedback Ticket
            const { data, error } = await supabase
                .from('feedbacks')
                .insert([
                    { 
                        content: newMessage, 
                        user_id: session.user.id, 
                        status: 'pending',
                        images: imageUrls
                    }
                ])
                .select()
                .single();
            
            if (error) throw error;
            if (data) {
                setFeedbacks([data, ...feedbacks]);
                // Automatically enter chat view
                setSelectedFeedback(data);
                setReplies([]); // No replies yet (except the initial content depending on design, but schema treats initial content as header)
                // Actually, let's treat the initial content as the "Subject" or first message.
                // Our schema has 'content' in feedbacks. Let's visualize that as a message too?
                // Or just show it as the title.
                setView('chat');
            }
            setNewMessage('');
            setImageFile(null);
            setImagePreview(null);
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toast.error('이미지 크기는 5MB 이하여야 합니다.');
                return;
            }
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const removeImage = () => {
        setImageFile(null);
        if (imagePreview) URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const uploadImage = async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = fileName;

        const { error: uploadError } = await supabase.storage
            .from('feedback-uploads')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
            .from('feedback-uploads')
            .getPublicUrl(filePath);

        return data.publicUrl;
    };

    const handleSendReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !session || !selectedFeedback) return;
        setSubmitting(true);

        const tempId = 'temp-' + Date.now();
        const optimisticReply: Reply | any = {
            id: tempId,
            feedback_id: selectedFeedback.id,
            user_id: session.user.id,
            content: newMessage,
            created_at: new Date().toISOString(),
            images: imagePreview ? [imagePreview] : [], // Use preview blob for optimistic
            author: { // Optimistic author
                nickname: session.user.user_metadata?.nickname || '나', // fallback
                email: session.user.email
            }
        };

        // Optimistic Update
        setReplies(prev => [...prev, optimisticReply]);
        const currentMessage = newMessage;
        setNewMessage(''); // Clear input immediately
        const currentImageFile = imageFile;
        removeImage(); // Clear image input immediately

        try {
            let imageUrls: string[] = [];
            if (currentImageFile) {
                const url = await uploadImage(currentImageFile);
                imageUrls.push(url);
            }

            const { data, error } = await supabase
                .from('feedback_replies')
                .insert([
                    { 
                        feedback_id: selectedFeedback.id, 
                        user_id: session.user.id, 
                        content: currentMessage,
                        images: imageUrls
                    }
                ])
                .select()
                .single();
            
            if (error) throw error;
            
            // Replace optimistic with real
            setReplies(prev => prev.map(r => r.id === tempId ? { ...data, author: optimisticReply.author } : r));
            
        } catch (error) {
            console.error('Error sending reply:', JSON.stringify(error, null, 2));
            toast.error('메시지 전송 실패');
            // Revert optimistic
            setReplies(prev => prev.filter(r => r.id !== tempId));
            setNewMessage(currentMessage); // Restore message
        } finally {
            setSubmitting(false);
        }
    };

    const openChat = async (feedback: Feedback) => {
        setSelectedFeedback(feedback);
        await fetchReplies(feedback.id);
        setView('chat');
    };

    const handleDeleteFeedback = (e: React.MouseEvent, feedbackId: string) => {
        e.stopPropagation();
        setDeleteConfirmationId(feedbackId);
    };

    const confirmDelete = async () => {
        if (!deleteConfirmationId) return;

        try {
            const { error } = await supabase
                .from('feedbacks')
                .delete()
                .eq('id', deleteConfirmationId);
            
            if (error) throw error;
            
            setFeedbacks(prev => prev.filter(f => f.id !== deleteConfirmationId));
            if (selectedFeedback?.id === deleteConfirmationId) {
                setView('list');
                setSelectedFeedback(null);
            }
            toast.success('피드백이 삭제되었습니다');
        } catch (error) {
            console.error('Error deleting feedback:', error);
            toast.error('삭제 중 오류가 발생했습니다');
        } finally {
            setDeleteConfirmationId(null);
        }
    };

    const handleStatusUpdate = async (e: React.ChangeEvent<HTMLSelectElement>, feedbackId: string) => {
        e.stopPropagation();
        const newStatus = e.target.value as 'pending' | 'reviewed' | 'implemented';
        
        try {
            const { error } = await supabase
                .from('feedbacks')
                .update({ status: newStatus })
                .eq('id', feedbackId);

            if (error) throw error;

            setFeedbacks(prev => prev.map(f => 
                f.id === feedbackId ? { ...f, status: newStatus } : f
            ));
            toast.success('상태가 변경되었습니다');
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('상태 변경 실패');
        }
    };

    const { isDarkMode, toggleDarkMode } = useTheme();

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 pt-4 pb-4 md:pb-8">
            <Navbar
                session={session}
                isDarkMode={isDarkMode}
                toggleDarkMode={toggleDarkMode}
                onLogout={() => supabase.auth.signOut()}
            />

            {!session ? (
                <div className="h-[calc(100vh-6rem)] flex items-center justify-center p-4">
                    <div className="text-center bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-800">
                        <MessageSquare className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <h2 className="text-xl font-bold mb-2">로그인이 필요합니다</h2>
                        <p className="text-gray-500">피드백을 남기시려면 먼저 로그인해주세요.</p>
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)] bg-white dark:bg-slate-900 md:rounded-2xl shadow-xl overflow-hidden flex flex-col border border-gray-200 dark:border-slate-800">
                    
                    {/* Header */}
                    <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
                        {view !== 'list' ? (
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={() => setView('list')}
                                    className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <div>
                                    <h2 className="font-bold text-lg">
                                        {view === 'new' ? '새 문의하기' : '문의 내역'}
                                    </h2>
                                    {view === 'chat' && (
                                        <span className="text-xs text-gray-500">
                                            {format(new Date(selectedFeedback!.created_at), 'yyyy.MM.dd')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <h2 className="font-bold text-xl ml-2">피드백</h2>
                        )}
                        
                        {view === 'list' && (
                            <div className="flex gap-2">
                                    <button
                                    onClick={() => { setView('new'); setNewMessage(''); }}
                                    className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>문의하기</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Content Area */}
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto bg-gray-50/30 dark:bg-slate-950/30 relative">
                        {view === 'list' && (
                            feedbacks.length === 0 ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                    <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                                    <p>등록된 피드백이 없습니다.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-slate-800">
                                    {feedbacks.map(feedback => (
                                        <div
                                            key={feedback.id}
                                            onClick={() => openChat(feedback)}
                                            className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors flex items-start gap-4 cursor-pointer"
                                        >
                                            {userRole === 'admin' ? (
                                                <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 pt-0.5">
                                                    <select
                                                        value={feedback.status}
                                                        onChange={(e) => handleStatusUpdate(e, feedback.id)}
                                                        className={`
                                                            text-xs font-bold rounded-lg px-2 py-1 border-none focus:ring-0 cursor-pointer text-center outline-none transition-colors
                                                            ${feedback.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 
                                                              feedback.status === 'reviewed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}
                                                        `}
                                                    >
                                                        <option value="pending">대기중</option>
                                                        <option value="reviewed">검토완료</option>
                                                        <option value="implemented">구현완료</option>
                                                    </select>
                                                </div>
                                            ) : (
                                                <div className={`
                                                    mt-1 w-2 h-2 rounded-full flex-shrink-0
                                                    ${feedback.status === 'pending' ? 'bg-yellow-400' : 
                                                        feedback.status === 'reviewed' ? 'bg-blue-400' : 'bg-green-400'}
                                                `} />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-gray-900 dark:text-white font-medium truncate mb-1">
                                                    {feedback.content}
                                                </p>
                                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                                                        {feedback.author?.email?.split('@')[0] || feedback.author?.nickname || '익명'}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{format(new Date(feedback.created_at), 'yyyy.MM.dd HH:mm')}</span>
                                                    <span>•</span>
                                                    <span className="capitalize">{feedback.status}</span>
                                                </div>
                                            </div>
                                            {(userRole === 'admin' || feedback.user_id === session?.user?.id) && (
                                                <div 
                                                    onClick={(e) => handleDeleteFeedback(e, feedback.id)}
                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors flex-shrink-0"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {view === 'new' && (
                            <div className="p-6">
                                <form onSubmit={handleCreateFeedback} className="space-y-4">
                                    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-rose-500 transition-all">
                                        <textarea
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            placeholder="어떤 점이 불편하거나 개선되었으면 좋겠나요?"
                                            rows={8}
                                            className="w-full bg-transparent border-none focus:ring-0 text-base resize-none"
                                            autoFocus
                                        />
                                    </div>
                                    
                                    {/* Image Preview in New View */}
                                    {imagePreview && (
                                        <div className="relative inline-block">
                                            <img src={imagePreview} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                                            <button
                                                type="button"
                                                onClick={removeImage}
                                                className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 shadow-md hover:bg-gray-700 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileSelect}
                                            accept="image/*"
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="p-3.5 rounded-xl border border-gray-200 dark:border-slate-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                                        >
                                            <ImageIcon className="w-5 h-5" />
                                        </button>
                                    <button
                                        type="submit"
                                        disabled={!newMessage.trim() || submitting}
                                        className="w-full bg-gradient-to-r from-rose-500 to-orange-500 text-white py-3.5 rounded-xl font-medium shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {submitting ? <Loader2 className="animate-spin w-5 h-5" /> : <Send className="w-5 h-5" />}
                                        보내기
                                    </button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {view === 'chat' && selectedFeedback && (
                            <div className="flex flex-col min-h-full">
                                <div className="flex-1 p-4 space-y-6">
                                    {/* Initial Feedback Message */}
                                    {(() => {
                                        const isMe = isMyMessage(selectedFeedback.user_id, session.user.id);
                                        return (
                                            <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                {!isMe && (
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center mr-2 flex-shrink-0">
                                                        <UserIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                                    </div>
                                                )}
                                                <div className={`
                                                    rounded-2xl p-3 max-w-[80%] shadow-sm
                                                    ${isMe 
                                                        ? 'bg-rose-500 text-white rounded-tr-sm' 
                                                        : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-tl-sm border border-gray-100 dark:border-slate-700'
                                                    }
                                                `}>
                                                    <p className="whitespace-pre-wrap">{selectedFeedback.content}</p>
                                                    {selectedFeedback.images && selectedFeedback.images.length > 0 && (
                                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                                            {selectedFeedback.images.map((img, idx) => (
                                                                <img 
                                                                    key={idx} 
                                                                    src={img} 
                                                                    alt="attached" 
                                                                    className="rounded-lg max-w-full h-auto object-cover max-h-64"
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className={`flex items-center justify-between mt-1 gap-4 ${isMe ? 'opacity-70' : 'text-gray-400'}`}>
                                                        <span className="text-[10px]">
                                                            {selectedFeedback.author?.email?.split('@')[0] || selectedFeedback.author?.nickname || '익명'}
                                                        </span>
                                                        <span className="text-[10px]">
                                                            {format(new Date(selectedFeedback.created_at), 'HH:mm')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Replies */}
                                    {replies.map((reply) => {
                                        const isMe = isMyMessage(reply.user_id, session.user.id);
                                        return (
                                            <div key={reply.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                                {!isMe && (
                                                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center mr-2 flex-shrink-0">
                                                        <UserIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                                    </div>
                                                )}
                                                <div className={`
                                                    rounded-2xl p-3 max-w-[80%] shadow-sm
                                                    ${isMe 
                                                        ? 'bg-rose-500 text-white rounded-tr-sm' 
                                                        : 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-tl-sm border border-gray-100 dark:border-slate-700'
                                                    }
                                                `}>
                                                    <p className="whitespace-pre-wrap text-sm md:text-base">{reply.content}</p>
                                                    {reply.images && reply.images.length > 0 && (
                                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                                            {reply.images.map((img, idx) => (
                                                                <img 
                                                                    key={idx} 
                                                                    src={img} 
                                                                    alt="attached" 
                                                                    className="rounded-lg max-w-full h-auto object-cover max-h-64"
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className={`flex items-center justify-between mt-1 gap-4 ${isMe ? 'opacity-70' : 'text-gray-400'}`}>
                                                        <span className="text-[10px]">
                                                            {reply.author?.email?.split('@')[0] || reply.author?.nickname || '익명'}
                                                        </span>
                                                        <span className="text-[10px]">
                                                            {format(new Date(reply.created_at), 'HH:mm')}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                </div>

                                {/* Chat Input */}
                                <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 p-4">
                                    {/* Image Preview in Chat View */}
                                    {imagePreview && (
                                        <div className="mb-2 relative inline-block">
                                            <img src={imagePreview} alt="Preview" className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
                                            <button
                                                type="button"
                                                onClick={removeImage}
                                                className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 shadow-md hover:bg-gray-700 transition-colors"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                    <form onSubmit={handleSendReply} className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newMessage}
                                            onChange={(e) => setNewMessage(e.target.value)}
                                            placeholder="메시지 입력..."
                                            className="flex-1 rounded-full border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-2 text-sm focus:outline-none focus:border-rose-500 dark:focus:border-rose-500 transition-colors"
                                        />
                                        <input
                                            type="file"
                                            ref={fileInputRef}
                                            onChange={handleFileSelect}
                                            accept="image/*"
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0 ${imagePreview ? 'text-rose-500' : 'text-gray-400'}`}
                                        >
                                            <ImageIcon className="w-5 h-5" />
                                        </button>
                                        <button 
                                            type="submit"
                                            disabled={!newMessage.trim() || submitting}
                                            className="bg-rose-500 text-white p-2 rounded-full hover:bg-rose-600 disabled:opacity-50 transition-colors flex-shrink-0"
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {deleteConfirmationId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 border border-transparent dark:border-slate-800">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                                <AlertTriangle className="w-5 h-5 text-rose-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">피드백 삭제</h3>
                        </div>
                        
                        <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed text-base pl-1">
                            정말로 이 피드백을 삭제하시겠습니까?<br/>
                            삭제된 내용은 복구할 수 없습니다.
                        </p>
                        
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirmationId(null)}
                                className="flex-1 py-3.5 rounded-2xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="flex-1 py-3.5 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-sm"
                            >
                                삭제
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
