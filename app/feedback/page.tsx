'use client';

import { useEffect, useState, useRef, useMemo, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { Send, Plus, MessageSquare, ChevronLeft, Loader2, User as UserIcon, AlertTriangle, Image as ImageIcon, X, List, History } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { useTheme } from '@/components/ThemeProvider';
import FeedbackItem, { Feedback } from '@/components/feedback/FeedbackItem';
import ChangelogList from '@/components/feedback/ChangelogList';
import FeedbackDetail from '@/components/feedback/FeedbackDetail';
import { useUnreadChangelogCount } from '@/hooks/useUnreadChangelogCount';

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

function FeedbackContent() {
    const [view, setView] = useState<'list' | 'chat' | 'new'>('list');
    const [activeTab, setActiveTab] = useState<'feedback' | 'changelog'>('changelog');
    const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
    const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
    const [replies, setReplies] = useState<Reply[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [newCategory, setNewCategory] = useState<'bug' | 'feature' | 'other'>('bug');

    // Filters & Sort
    const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest');
    const [filterCategory, setFilterCategory] = useState<'all' | 'bug' | 'feature' | 'other'>('all');

    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();
    const searchParams = useSearchParams();

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const { markAsRead: markChangelogAsRead } = useUnreadChangelogCount();

    // Check query params for tab selection
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        if (tabParam === 'feedback') {
            setActiveTab('feedback');
        }
    }, [searchParams]);

    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    useEffect(() => {
        if (view === 'chat') {
            setTimeout(scrollToBottom, 100);
        }
    }, [replies, view]);

    useEffect(() => {
        const init = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);
            if (session) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', session.user.id)
                    .single();
                setUserRole(profile?.role || null);
                if (activeTab === 'feedback') {
                    fetchFeedbacks(session.user.id);
                }
            }
            setLoading(false);
        };
        init();
    }, [activeTab]); // Refetch when tab changes

    // Mark changelog as read when viewing changelog tab
    useEffect(() => {
        if (activeTab === 'changelog') {
            markChangelogAsRead();
        }
    }, [activeTab, markChangelogAsRead]);

    // Real-time subscription for replies
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
                        if (session && newReply.user_id === session.user.id) return;

                        let authorData = { nickname: 'unknown', email: 'unknown' };
                        if (newReply.user_id) {
                            const { data: profile } = await supabase
                                .from('profiles')
                                .select('nickname, email')
                                .eq('id', newReply.user_id)
                                .single();
                            if (profile) authorData = profile;
                        }

                        setReplies(prev => [...prev, { ...newReply, author: authorData }]);
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [view, selectedFeedback, session]);

    const fetchFeedbacks = async (userId: string) => {
        // Fetch feedbacks with likes count
        // Note: Supabase JS select with count on relations
        const { data: feedbacksData, error } = await supabase
            .from('feedbacks')
            .select('*, feedback_likes(count)')
            .order('created_at', { ascending: false });

        if (error || !feedbacksData) {
            console.error(error);
            return;
        }

        // Fetch my likes
        const { data: myLikes } = await supabase
            .from('feedback_likes')
            .select('feedback_id')
            .eq('user_id', userId);

        const myLikedIds = new Set(myLikes?.map(l => l.feedback_id));

        // Fetch authors
        const userIds = Array.from(new Set(feedbacksData.map(f => f.user_id).filter(Boolean))) as string[];
        let profileMap = new Map();

        if (userIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, nickname, email')
                .in('id', userIds);
            profileMap = new Map(profiles?.map(p => [p.id, p]));
        }

        const enrichedFeedbacks: Feedback[] = feedbacksData.map(f => ({
            ...f,
            author: f.user_id ? profileMap.get(f.user_id) : undefined,
            likes_count: f.feedback_likes[0]?.count || 0,
            user_has_liked: myLikedIds.has(f.id)
        }));

        setFeedbacks(enrichedFeedbacks);
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
                setReplies(repliesData.map(r => ({ ...r, author: r.user_id ? profileMap.get(r.user_id) : undefined })));
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
            let imageUrls: string[] = [];
            if (imageFile) {
                const url = await uploadImage(imageFile);
                imageUrls.push(url);
            }

            const { data, error } = await supabase
                .from('feedbacks')
                .insert([
                    {
                        content: newMessage,
                        user_id: session.user.id,
                        status: 'pending',
                        category: newCategory,
                        images: imageUrls
                    }
                ])
                .select()
                .single();

            if (error) throw error;
            if (data) {
                await fetchFeedbacks(session.user.id); // Refresh to get correct structure
                setView('list');
                toast.success('피드백이 등록되었습니다.');
            }
            setNewMessage('');
            setImageFile(null);
            setImagePreview(null);
        } catch (error) {
            console.error(error);
            toast.error('등록 실패');
        } finally {
            setSubmitting(false);
        }
    };

    // ... Image handling functions (same as before) ...
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (file.size > 5 * 1024 * 1024) {
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

    const handleSendReply = async (message: string, file: File | null) => {
        if (!message.trim() || !session || !selectedFeedback) return;

        // Optimistic Update
        const tempId = 'temp-' + Date.now();
        const imagePreviewUrl = file ? URL.createObjectURL(file) : undefined;

        const optimisticReply: Reply | any = {
            id: tempId,
            feedback_id: selectedFeedback.id,
            user_id: session.user.id,
            content: message,
            created_at: new Date().toISOString(),
            images: imagePreviewUrl ? [imagePreviewUrl] : [],
            author: {
                nickname: session.user.user_metadata?.nickname || '나',
                email: session.user.email
            }
        };

        setReplies(prev => [...prev, optimisticReply]);

        try {
            let imageUrls: string[] = [];
            if (file) {
                const url = await uploadImage(file);
                imageUrls.push(url);
            }

            const { data, error } = await supabase
                .from('feedback_replies')
                .insert([
                    {
                        feedback_id: selectedFeedback.id,
                        user_id: session.user.id,
                        content: message,
                        images: imageUrls
                    }
                ])
                .select()
                .single();

            if (error) throw error;

            setReplies(prev => prev.map(r => r.id === tempId ? { ...data, author: optimisticReply.author } : r));
            if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl); // Cleanup

        } catch (error) {
            console.error('Error sending reply:', error);
            toast.error('메시지 전송 실패');
            setReplies(prev => prev.filter(r => r.id !== tempId));
        }
    };

    const openChat = async (feedback: Feedback) => {
        setSelectedFeedback(feedback);
        await fetchReplies(feedback.id);
        setView('chat');
    };

    const handleDeleteFeedback = (e: React.MouseEvent, feedbackId: string) => {
        e.stopPropagation(); // Should trigger from Item component, but if needed from here
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

    const handleStatusUpdate = async (id: string, newStatus: 'pending' | 'reviewed' | 'implemented') => {
        try {
            const { error } = await supabase
                .from('feedbacks')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;
            setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f));
            if (selectedFeedback?.id === id) {
                setSelectedFeedback(prev => prev ? { ...prev, status: newStatus } : null);
            }
            toast.success('상태가 변경되었습니다');
        } catch (error) {
            console.error(error);
            toast.error('상태 변경 실패');
        }
    };

    const handleFeedbackEdit = async (id: string, content: string, category: 'bug' | 'feature' | 'other') => {
        const { error } = await supabase
            .from('feedbacks')
            .update({ content, category })
            .eq('id', id);

        if (error) throw error;

        setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, content, category } : f));
        if (selectedFeedback?.id === id) {
            setSelectedFeedback(prev => prev ? { ...prev, content, category } : null);
        }
    };

    const handleReplyDelete = async (replyId: string) => {
        const { error } = await supabase
            .from('feedback_replies')
            .delete()
            .eq('id', replyId);

        if (error) throw error;

        setReplies(prev => prev.filter(r => r.id !== replyId));
    };

    const { isDarkMode, toggleDarkMode } = useTheme();

    // Derived filtered feedbacks
    const filteredFeedbacks = useMemo(() => {
        let result = [...feedbacks];
        if (filterCategory !== 'all') {
            result = result.filter(f => f.category === filterCategory);
        }
        if (sortBy === 'popular') {
            result.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
        } else {
            // Default latest (created_at desc) - already fetched that way, but safety
            result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
        return result;
    }, [feedbacks, filterCategory, sortBy]);

    if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-950 pt-4 pb-4 md:pb-8">
            <Navbar
                session={session}
                isDarkMode={isDarkMode}
                toggleDarkMode={toggleDarkMode}
                onLogout={() => supabase.auth.signOut()}
                onOpenLogin={() => supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}/feedback` }
                })}
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
                    <div className="border-b border-gray-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10 flex flex-col">
                        <div className="p-4 flex items-center justify-between">
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
                                            {view === 'new' ? '새 문의하기' : '문의 상세'}
                                        </h2>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-4">
                                    <h2 className="font-bold text-xl ml-2 hidden md:block">문의함</h2>
                                    {/* Tabs */}
                                    <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
                                        <button
                                            onClick={() => setActiveTab('changelog')}
                                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'changelog' ? 'bg-white dark:bg-slate-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            변경 내역
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('feedback')}
                                            className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'feedback' ? 'bg-white dark:bg-slate-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            피드백
                                        </button>
                                    </div>
                                </div>
                            )}

                            {view === 'list' && activeTab === 'feedback' && (
                                <button
                                    onClick={() => { setView('new'); setNewMessage(''); }}
                                    className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden md:inline">문의하기</span>
                                </button>
                            )}
                        </div>

                        {/* Filters & Sort for Feedback List */}
                        {view === 'list' && activeTab === 'feedback' && (
                            <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
                                <select
                                    value={filterCategory}
                                    onChange={(e) => setFilterCategory(e.target.value as any)}
                                    className="bg-gray-50 dark:bg-slate-800 border-none text-xs rounded-lg px-3 py-1.5 focus:ring-0 cursor-pointer"
                                >
                                    <option value="all">전체 카테고리</option>
                                    <option value="bug">버그</option>
                                    <option value="feature">기능 제안</option>
                                    <option value="other">기타</option>
                                </select>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as any)}
                                    className="bg-gray-50 dark:bg-slate-800 border-none text-xs rounded-lg px-3 py-1.5 focus:ring-0 cursor-pointer"
                                >
                                    <option value="latest">최신순</option>
                                    <option value="popular">인기순 (좋아요)</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Content Area */}
                    <div ref={chatContainerRef} className="flex-1 overflow-y-auto bg-gray-50/30 dark:bg-slate-950/30 relative">
                        {activeTab === 'changelog' && view === 'list' ? (
                            <ChangelogList isAdmin={userRole === 'admin'} />
                        ) : (
                            <>
                                {view === 'list' && (
                                    filteredFeedbacks.length === 0 ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                                            <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                                            <p>등록된 피드백이 없습니다.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100 dark:divide-slate-800">
                                            {filteredFeedbacks.map(feedback => (
                                                <FeedbackItem
                                                    key={feedback.id}
                                                    feedback={feedback}
                                                    currentUserId={session?.user?.id}
                                                    isAdmin={userRole === 'admin'}
                                                    onClick={() => openChat(feedback)}
                                                    onDelete={(id) => setDeleteConfirmationId(id)}
                                                    onStatusChange={handleStatusUpdate}
                                                />
                                            ))}
                                        </div>
                                    )
                                )}

                                {view === 'new' && (
                                    <div className="p-6">
                                        <form onSubmit={handleCreateFeedback} className="space-y-4">
                                            {/* Category Selection */}
                                            <div className="flex gap-2 mb-2">
                                                {(['bug', 'feature', 'other'] as const).map(cat => (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        onClick={() => setNewCategory(cat)}
                                                        className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${newCategory === cat
                                                            ? 'border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500'
                                                            }`}
                                                    >
                                                        {cat === 'bug' ? '버그 신고' : cat === 'feature' ? '기능 제안' : '기타 문의'}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm focus-within:ring-2 focus-within:ring-rose-500 transition-all">
                                                <textarea
                                                    value={newMessage}
                                                    onChange={(e) => setNewMessage(e.target.value)}
                                                    placeholder="내용을 입력해주세요."
                                                    rows={8}
                                                    className="w-full bg-transparent border-none focus:ring-0 text-base resize-none"
                                                    autoFocus
                                                />
                                            </div>

                                            {/* Image Preview */}
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
                                                    등록하기
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {view === 'chat' && selectedFeedback && (
                                    <FeedbackDetail
                                        feedback={selectedFeedback}
                                        replies={replies}
                                        currentUser={session?.user}
                                        onBack={() => setView('list')}
                                        onReply={handleSendReply}
                                        onDelete={() => setDeleteConfirmationId(selectedFeedback.id)}
                                        onStatusChange={handleStatusUpdate}
                                        onFeedbackEdit={handleFeedbackEdit}
                                        onReplyDelete={handleReplyDelete}
                                        isAdmin={userRole === 'admin'}
                                    />
                                )}
                            </>
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
                            정말로 이 피드백을 삭제하시겠습니까?<br />
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

export default function FeedbackPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
            <FeedbackContent />
        </Suspense>
    );
}
