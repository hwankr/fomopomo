'use client';

import { useState, MouseEvent, ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { MessageSquare, ThumbsUp, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export interface Feedback {
    id: string;
    content: string;
    status: 'pending' | 'reviewed' | 'implemented';
    category: 'bug' | 'feature' | 'other';
    user_id: string | null;
    created_at: string;
    author?: {
        nickname: string | null;
        email: string | null;
    };
    images?: string[];
    likes_count?: number; // Pre-calculated or fetched
    user_has_liked?: boolean;
}

interface FeedbackItemProps {
    feedback: Feedback;
    currentUserId?: string;
    isAdmin: boolean;
    onClick: () => void;
    onDelete: (id: string) => void;
    onStatusChange?: (id: string, status: 'pending' | 'reviewed' | 'implemented') => void;
}

export default function FeedbackItem({
    feedback,
    currentUserId,
    isAdmin,
    onClick,
    onDelete,
    onStatusChange
}: FeedbackItemProps) {
    const [likes, setLikes] = useState(feedback.likes_count || 0);
    const [isLiked, setIsLiked] = useState(feedback.user_has_liked || false);
    const [likeLoading, setLikeLoading] = useState(false);

    const handleLike = async (e: MouseEvent) => {
        e.stopPropagation();
        if (!currentUserId) {
            toast.error('로그인이 필요합니다.');
            return;
        }
        if (likeLoading) return;

        setLikeLoading(true);
        // Optimistic update
        const previousLiked = isLiked;
        const previousLikes = likes;

        setIsLiked(!isLiked);
        setLikes(prev => isLiked ? prev - 1 : prev + 1);

        try {
            if (previousLiked) {
                // Remove like
                const { error } = await supabase
                    .from('feedback_likes')
                    .delete()
                    .match({ user_id: currentUserId, feedback_id: feedback.id });
                if (error) throw error;
            } else {
                // Add like
                const { error } = await supabase
                    .from('feedback_likes')
                    .insert({ user_id: currentUserId, feedback_id: feedback.id });
                if (error) throw error;
            }
        } catch (error) {
            console.error('Like error:', error);
            // Revert
            setIsLiked(previousLiked);
            setLikes(previousLikes);
            toast.error('오류가 발생했습니다.');
        } finally {
            setLikeLoading(false);
        }
    };

    const handleDelete = (e: MouseEvent) => {
        e.stopPropagation();
        onDelete(feedback.id);
    };

    const handleStatusChange = (e: ChangeEvent<HTMLSelectElement>) => {
        e.stopPropagation();
        if (onStatusChange) {
            onStatusChange(feedback.id, e.target.value as any);
        }
    };

    // Category Badge Color
    const getCategoryColor = (cat: string) => {
        switch (cat) {
            case 'bug': return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
            case 'feature': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
            default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-400';
            case 'reviewed': return 'bg-blue-400';
            case 'implemented': return 'bg-green-400';
            default: return 'bg-gray-400';
        }
    };

    return (
        <div
            onClick={onClick}
            className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-all flex items-start gap-4 cursor-pointer group border-b border-gray-100 dark:border-slate-800/50 last:border-0"
        >
            {/* Status Indicator (Dot or Select for Admin) */}
            <div className="flex-shrink-0 pt-1">
                {isAdmin ? (
                    <div onClick={e => e.stopPropagation()}>
                        <select
                            value={feedback.status}
                            onChange={handleStatusChange}
                            className={`
                                text-xs font-bold rounded-lg px-2 py-1 border-none focus:ring-0 cursor-pointer text-center outline-none transition-colors appearance-none
                                ${feedback.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                    feedback.status === 'reviewed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}
                            `}
                        >
                            <option value="pending">대기</option>
                            <option value="reviewed">검토</option>
                            <option value="implemented">완료</option>
                        </select>
                    </div>
                ) : (
                    <div
                        title={feedback.status === 'implemented' ? '구현완료' : feedback.status === 'reviewed' ? '검토완료' : '대기중'}
                        className={`w-3 h-3 rounded-full mt-1.5 ${getStatusColor(feedback.status)}`}
                    />
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-[10px] md:text-xs font-bold px-1.5 py-0.5 rounded ${getCategoryColor(feedback.category)} uppercase`}>
                        {feedback.category === 'bug' ? '버그' : feedback.category === 'feature' ? '기능제안' : '기타'}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                        {format(new Date(feedback.created_at), 'yyyy.MM.dd')}
                    </span>
                </div>

                <p className="text-gray-900 dark:text-white font-medium text-base mb-2 line-clamp-2 leading-snug">
                    {feedback.content}
                </p>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="truncate max-w-[100px]">
                            {feedback.author?.nickname || feedback.author?.email?.split('@')[0] || '익명'}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleLike}
                            className={`
                                flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors
                                ${isLiked
                                    ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                    : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'}
                            `}
                        >
                            <ThumbsUp className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                            <span>{likes}</span>
                        </button>

                        {(isAdmin || currentUserId === feedback.user_id) && (
                            <button
                                onClick={handleDelete}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
