import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { User, Send, Image as ImageIcon, Loader2, MoreVertical, Trash2, ArrowLeft, X, Edit2 } from 'lucide-react';
import { Feedback } from './FeedbackItem';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

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

interface FeedbackDetailProps {
    feedback: Feedback;
    replies: Reply[];
    currentUser: any;
    onBack: () => void;
    onReply: (message: string, imageFile: File | null) => Promise<void>;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, status: 'pending' | 'reviewed' | 'implemented') => void;
    onFeedbackEdit?: (id: string, content: string, category: 'bug' | 'feature' | 'other') => Promise<void>;
    onReplyDelete?: (replyId: string) => Promise<void>;
    isAdmin: boolean;
}

export default function FeedbackDetail({
    feedback,
    replies,
    currentUser,
    onBack,
    onReply,
    onDelete,
    onStatusChange,
    onFeedbackEdit,
    onReplyDelete,
    isAdmin
}: FeedbackDetailProps) {
    const [newMessage, setNewMessage] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Feedback edit states
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(feedback.content);
    const [editCategory, setEditCategory] = useState<'bug' | 'feature' | 'other'>(feedback.category);
    const [editSubmitting, setEditSubmitting] = useState(false);

    // Reply delete state
    const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);

    const canEdit = currentUser?.id === feedback.user_id && feedback.status === 'pending';

    const handleEditSubmit = async () => {
        if (!editContent.trim() || !onFeedbackEdit) return;
        setEditSubmitting(true);
        try {
            await onFeedbackEdit(feedback.id, editContent, editCategory);
            setIsEditing(false);
            toast.success('피드백이 수정되었습니다.');
        } catch (error) {
            console.error(error);
            toast.error('수정 실패');
        } finally {
            setEditSubmitting(false);
        }
    };

    const handleReplyDelete = async (replyId: string) => {
        if (!onReplyDelete) return;
        setDeletingReplyId(replyId);
        try {
            await onReplyDelete(replyId);
            toast.success('댓글이 삭제되었습니다.');
        } catch (error) {
            console.error(error);
            toast.error('삭제 실패');
        } finally {
            setDeletingReplyId(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() && !imageFile) return;

        setSubmitting(true);
        try {
            await onReply(newMessage, imageFile);
            setNewMessage('');
            removeImage();
            // Scroll to bottom after reply
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } finally {
            setSubmitting(false);
        }
    };

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

    return (
        <div className="flex flex-col h-full bg-white dark:bg-slate-900">
            {/* Header / Navigation */}
            <div className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-gray-100 dark:border-slate-800 p-4 flex items-center justify-between">
                <button 
                    onClick={onBack}
                    className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full transition-colors text-gray-700 dark:text-gray-300"
                    title="목록으로"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                
                {isAdmin && (
                    <div className="flex items-center gap-2">
                         <select
                            value={feedback.status}
                            onChange={(e) => onStatusChange(feedback.id, e.target.value as any)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-full border-none focus:ring-0 cursor-pointer appearance-none
                                ${feedback.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                  feedback.status === 'implemented' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}
                        >
                            <option value="pending">대기중</option>
                            <option value="reviewed">검토중</option>
                            <option value="implemented">완료됨</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Main Content (Scrollable) */}
            <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-3xl mx-auto w-full space-y-8">
                
                {/* Post Header */}
                <div className="space-y-4">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
                                <span className="text-sm font-bold text-gray-500 dark:text-gray-400">
                                    {feedback.author?.nickname?.[0] || feedback.author?.email?.[0]?.toUpperCase() || 'U'}
                                </span>
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">
                                    {feedback.author?.nickname || feedback.author?.email?.split('@')[0] || '익명'}
                                </h3>
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>{format(new Date(feedback.created_at), 'yyyy.MM.dd HH:mm')}</span>
                                    <span>•</span>
                                    <span className={`font-medium
                                        ${feedback.category === 'bug' ? 'text-rose-500' : 
                                          feedback.category === 'feature' ? 'text-blue-500' : 'text-gray-500'}
                                    `}>
                                        {feedback.category === 'bug' ? '버그 신고' : feedback.category === 'feature' ? '기능 제안' : '기타'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-1">
                            {canEdit && (
                                <button 
                                    onClick={() => setIsEditing(true)}
                                    className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                                    title="수정"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            )}
                            {(isAdmin || currentUser?.id === feedback.user_id) && (
                                <button 
                                    onClick={() => onDelete(feedback.id)}
                                    className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-full transition-colors"
                                    title="삭제"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Post Content */}
                    {isEditing ? (
                        <div className="space-y-4">
                            {/* Category Selection */}
                            <div className="flex gap-2">
                                {(['bug', 'feature', 'other'] as const).map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setEditCategory(cat)}
                                        className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                                            editCategory === cat
                                                ? 'border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-500'
                                        }`}
                                    >
                                        {cat === 'bug' ? '버그 신고' : cat === 'feature' ? '기능 제안' : '기타 문의'}
                                    </button>
                                ))}
                            </div>
                            <textarea
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                rows={6}
                                className="w-full p-4 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        setIsEditing(false);
                                        setEditContent(feedback.content);
                                        setEditCategory(feedback.category);
                                    }}
                                    className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleEditSubmit}
                                    disabled={!editContent.trim() || editSubmitting}
                                    className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-medium hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {editSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                    저장
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="prose dark:prose-invert max-w-none">
                            <p className="text-base md:text-lg leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {feedback.content}
                            </p>
                        </div>
                    )}

                    {/* Image Gallery */}
                    {feedback.images && feedback.images.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            {feedback.images.map((img, idx) => (
                                <img 
                                    key={idx} 
                                    src={img} 
                                    alt={`Feedback attachment ${idx + 1}`} 
                                    className="rounded-xl border border-gray-100 dark:border-slate-800 w-full object-cover max-h-[500px]"
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-100 dark:border-slate-800 my-8"></div>

                {/* Comments Section */}
                <div className="space-y-6">
                    <h4 className="font-bold text-lg flex items-center gap-2 text-gray-900 dark:text-white">
                        댓글 <span className="text-rose-500">{replies.length}</span>
                    </h4>

                    {replies.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 bg-gray-50 dark:bg-slate-800/50 rounded-2xl">
                            아직 댓글이 없습니다.<br/>첫 번째 댓글을 남겨보세요!
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {replies.map((reply) => {
                                const isAuthor = reply.user_id === feedback.user_id;
                                const isMe = reply.user_id === currentUser?.id;
                                const isAdminReply = reply.author?.email === 'fabronjeon@gmail.com' || reply.is_admin; // Assuming specific admin check logic or added prop

                                return (
                                    <div key={reply.id} className={`flex gap-3 group ${isMe ? 'bg-rose-50/50 dark:bg-rose-900/10 -mx-4 px-4 py-3 rounded-xl' : ''}`}>
                                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-slate-700 flex-shrink-0 flex items-center justify-center mt-1">
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">
                                                {reply.author?.nickname?.[0] || 'U'}
                                            </span>
                                        </div>
                                        <div className="flex-1 space-y-1">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-sm text-gray-900 dark:text-white">
                                                        {reply.author?.nickname || '익명'}
                                                    </span>
                                                    {isAuthor && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-[10px] font-bold text-gray-500">작성자</span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400">
                                                        {format(new Date(reply.created_at), 'MM.dd HH:mm')}
                                                    </span>
                                                    {(isMe || isAdmin) && (
                                                        <button
                                                            onClick={() => handleReplyDelete(reply.id)}
                                                            disabled={deletingReplyId === reply.id}
                                                            className="p-1 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded transition-colors"
                                                            title="댓글 삭제"
                                                        >
                                                            {deletingReplyId === reply.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                                                {reply.content}
                                            </p>
                                            {reply.images && reply.images.length > 0 && (
                                                <div className="flex gap-2 mt-2">
                                                    {reply.images.map((img, idx) => (
                                                        <img key={idx} src={img} alt="Comment attachment" className="h-24 w-auto rounded-lg object-cover border border-gray-200 dark:border-slate-700" />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
            </div>

            {/* Comment Input Area (Boxed at bottom, not sticky like chat, but fixed at bottom of viewport for ease of access usually preferred in mobile apps, but user said 'like post' so static is also fine. Let's make it sticky bottom for UX primarily) */}
            <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 p-4 md:p-6 shadow-up-sm">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
                     {imagePreview && (
                        <div className="absolute bottom-full left-0 mb-2">
                            <div className="relative inline-block">
                                <img src={imagePreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg border border-gray-200 shadow-sm" />
                                <button
                                    type="button"
                                    onClick={removeImage}
                                    className="absolute -top-2 -right-2 bg-gray-900 text-white rounded-full p-1 shadow-md hover:bg-gray-700 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    )}
                    
                    <div className="flex gap-3 items-end bg-gray-50 dark:bg-slate-800 p-2 rounded-2xl border border-gray-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-rose-500/50 transition-all">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors rounded-full hover:bg-gray-200 dark:hover:bg-slate-700"
                            title="사진 첨부"
                        >
                            <ImageIcon className="w-5 h-5" />
                        </button>
                        <textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="댓글을 남겨주세요..."
                            rows={1}
                            className="flex-1 bg-transparent border-none focus:ring-0 py-2.5 text-sm md:text-base resize-none max-h-32"
                            style={{ minHeight: '44px' }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim() || submitting}
                            className="p-2 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                        >
                            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept="image/*"
                        className="hidden"
                    />
                </form>
            </div>
        </div>
    );
}
