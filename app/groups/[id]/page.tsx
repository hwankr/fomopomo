'use client';

import { useEffect, useState, use } from 'react';
import { supabase } from '@/lib/supabase';
import { getDayStart, getDayEnd } from '@/lib/dateUtils';
import { useRouter } from 'next/navigation';
import { toast, Toaster } from 'react-hot-toast';
import MemberReportModal from '@/components/MemberReportModal';
import MemberCard from '@/components/groups/MemberCard';

interface Member {
    id: string; // group_member id
    user_id: string;
    joined_at: string;
    nickname: string | null;
    profiles: {
        id: string;
        email: string;
        status: string;
        current_task: string | null;
        last_active_at: string;
        avatar_url?: string;
        study_start_time: string | null;
        total_stopwatch_time: number | null;
    };
}

interface GroupDetail {
    id: string;
    name: string;
    code: string;
    leader_id: string;
}

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [group, setGroup] = useState<GroupDetail | null>(null);
    const [members, setMembers] = useState<Member[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [editingNickname, setEditingNickname] = useState(false);
    const [tempNickname, setTempNickname] = useState('');
    const [isEditingGroupName, setIsEditingGroupName] = useState(false);
    const [tempGroupName, setTempGroupName] = useState('');
    const [selectedMemberForReport, setSelectedMemberForReport] = useState<{ id: string; name: string } | null>(null);
    const [studyTimes, setStudyTimes] = useState<Record<string, number>>({});

    const formatStudyTime = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}시간 ${minutes}분`;
        }
        return `${minutes}분`;
    };

    const fetchGroupData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/');
                return;
            }
            setCurrentUser(user);

            // 1. Fetch Group Details
            const { data: groupData, error: groupError } = await supabase
                .from('groups')
                .select('*')
                .eq('id', id)
                .single();

            if (groupError) throw groupError;
            setGroup(groupData);

            // 2. Fetch Members
            const { data: membersData, error: membersError } = await supabase
                .from('group_members')
                .select(`
                    id,
                    user_id,
                    joined_at,
                    nickname,
                    profiles:user_id (
                        id,
                        email,
                        status,
                        current_task,
                        last_active_at,
                        study_start_time,
                        total_stopwatch_time
                    )
                `)
                .eq('group_id', id);

            if (membersError) throw membersError;

            // @ts-ignore
            setMembers(membersData || []);

            // 3. Fetch Study Times
            // Get today's start and end time (based on 5 AM reset)
            const start = getDayStart().toISOString();
            const end = getDayEnd().toISOString();

            const { data: studyTimeData, error: studyTimeError } = await supabase
                .rpc('get_group_study_time_v3', {
                    p_group_id: id,
                    p_start_time: start,
                    p_end_time: end
                });

            if (studyTimeError) {
                console.error('Error fetching study times:', JSON.stringify(studyTimeError, null, 2));
                console.error('Params:', { p_group_id: id, p_start_time: start, p_end_time: end });
            } else {
                const timeMap: Record<string, number> = {};
                studyTimeData.forEach((item: { user_id: string; total_seconds: number }) => {
                    timeMap[item.user_id] = item.total_seconds;
                });
                setStudyTimes(timeMap);
            }

        } catch (error) {
            console.error('Error fetching group data:', error);
            toast.error('그룹 데이터를 불러오는데 실패했습니다');
            router.push('/groups');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchGroupData();

        // Realtime subscription for member status updates
        const channel = supabase
            .channel(`group-${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                },
                (payload) => {
                    setMembers((prev) =>
                        prev.map((member) => {
                            if (member.user_id === payload.new.id) {
                                return {
                                    ...member,
                                    profiles: {
                                        ...member.profiles,
                                        ...payload.new,
                                    },
                                };
                            }
                            return member;
                        })
                    );
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'group_members',
                    filter: `group_id=eq.${id}`,
                },
                () => {
                    // Refresh members on any change to group_members (join, leave, kick, nickname update)
                    fetchGroupData();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'groups',
                    filter: `id=eq.${id}`,
                },
                () => {
                    toast.error('그룹이 삭제되었습니다');
                    router.push('/groups');
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [id, router]);

    const copyCode = () => {
        if (group?.code) {
            navigator.clipboard.writeText(group.code);
            toast.success('코드가 클립보드에 복사되었습니다!');
        }
    };

    const handleUpdateNickname = async () => {
        if (!tempNickname.trim()) return;
        try {
            const { error } = await supabase
                .from('group_members')
                .update({ nickname: tempNickname.trim() })
                .eq('group_id', id)
                .eq('user_id', currentUser.id);

            if (error) throw error;

            toast.success('닉네임이 업데이트되었습니다');
            setEditingNickname(false);
            fetchGroupData();
        } catch (error) {
            console.error('Error updating nickname:', error);
            toast.error('닉네임 업데이트에 실패했습니다');
        }
    };

    const handleUpdateGroupName = async () => {
        if (!tempGroupName.trim()) return;
        try {
            const { error } = await supabase
                .from('groups')
                .update({ name: tempGroupName.trim() })
                .eq('id', id);

            if (error) throw error;

            toast.success('그룹 이름이 업데이트되었습니다');
            setIsEditingGroupName(false);
            setGroup(prev => prev ? { ...prev, name: tempGroupName.trim() } : null);
        } catch (error) {
            console.error('Error updating group name:', error);
            toast.error('그룹 이름 업데이트에 실패했습니다');
        }
    };

    const handleKickMember = async (memberId: string, memberName: string) => {
        if (!confirm(`${memberName}님을 정말로 추방하시겠습니까?`)) return;
        try {
            const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('id', memberId);

            if (error) throw error;
            toast.success('멤버가 추방되었습니다');
        } catch (error) {
            console.error('Error removing member:', error);
            toast.error('멤버 추방에 실패했습니다');
        }
    };

    const handleLeaveGroup = async () => {
        if (!confirm('정말로 이 그룹을 떠나시겠습니까?')) return;
        try {
            const { error } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', id)
                .eq('user_id', currentUser.id);

            if (error) throw error;
            toast.success('그룹을 떠났습니다');
            router.push('/groups');
        } catch (error) {
            console.error('Error leaving group:', error);
            toast.error('그룹 떠나기에 실패했습니다');
        }
    };

    const handleDeleteGroup = async () => {
        if (!confirm('정말로 이 그룹을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
        try {
            // 1. Delete all members first (manual cascade)
            const { error: membersError } = await supabase
                .from('group_members')
                .delete()
                .eq('group_id', id);

            if (membersError) throw membersError;

            // 2. Delete the group
            const { error } = await supabase
                .from('groups')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('그룹이 삭제되었습니다');
            router.push('/groups');
        } catch (error) {
            console.error('Error deleting group:', error);
            toast.error('그룹 삭제에 실패했습니다');
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
            </div>
        );
    }

    if (!group) return null;

    const isLeader = currentUser?.id === group.leader_id;

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 sm:p-8">
            <Toaster position="top-center" />
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <button
                        onClick={() => router.push('/groups')}
                        className="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white mb-4 flex items-center gap-1"
                    >
                        ← 그룹 목록으로 돌아가기
                    </button>

                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 dark:border-slate-700">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                {isEditingGroupName ? (
                                    <div className="flex items-center gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={tempGroupName}
                                            onChange={(e) => setTempGroupName(e.target.value)}
                                            className="text-3xl font-bold text-gray-900 dark:text-white bg-transparent border-b-2 border-rose-500 focus:outline-none px-1"
                                            autoFocus
                                        />
                                        <button
                                            onClick={handleUpdateGroupName}
                                            className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => setIsEditingGroupName(false)}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 mb-2">
                                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{group.name}</h1>
                                        {isLeader && (
                                            <button
                                                onClick={() => {
                                                    setTempGroupName(group.name);
                                                    setIsEditingGroupName(true);
                                                }}
                                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                                title="그룹 이름 수정"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                </svg>
                                            </button>
                                        )}
                                    </div>
                                )}
                                <p className="text-gray-500 dark:text-gray-400">
                                    {members.length}명의 멤버
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {isLeader && (
                                    <div className="flex items-center gap-3 bg-gray-100 dark:bg-slate-700 px-4 py-2 rounded-xl">
                                        <span className="text-sm font-medium text-gray-500 dark:text-gray-300">코드:</span>
                                        <code className="text-lg font-bold text-rose-500 font-mono tracking-wider">{group.code}</code>
                                        <button
                                            onClick={copyCode}
                                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors text-gray-500 dark:text-gray-400"
                                            title="코드 복사"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                                            </svg>
                                        </button>
                                    </div>
                                )}

                                {isLeader ? (
                                    <button
                                        onClick={handleDeleteGroup}
                                        className="px-4 py-2 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium text-sm"
                                    >
                                        그룹 삭제
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleLeaveGroup}
                                        className="px-4 py-2 bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors font-medium text-sm"
                                    >
                                        그룹 나가기
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {[...members]
                        .sort((a, b) => {
                            const timeA = studyTimes[a.user_id] || 0;
                            const timeB = studyTimes[b.user_id] || 0;
                            // Sort by time descending, then by name ascending as tiebreaker
                            if (timeB !== timeA) return timeB - timeA;
                            const nameA = a.nickname || (a.profiles.email ? a.profiles.email.split('@')[0] : '');
                            const nameB = b.nickname || (b.profiles.email ? b.profiles.email.split('@')[0] : '');
                            return nameA.localeCompare(nameB);
                        })
                        .map((member, index) => {
                            const isCurrentUser = member.user_id === currentUser.id;
                            const displayName = member.nickname || (member.profiles.email ? member.profiles.email.split('@')[0] : '멤버');
                            const savedStudyTime = studyTimes[member.user_id] || 0;
                            const rank = index + 1;

                            return (
                                <MemberCard
                                    key={member.id}
                                    member={member}
                                    rank={rank}
                                    savedStudyTime={savedStudyTime}
                                    isCurrentUser={isCurrentUser}
                                    isLeader={isLeader}
                                    isGroupLeader={member.user_id === group.leader_id}
                                    editingNickname={isCurrentUser && editingNickname}
                                    tempNickname={tempNickname}
                                    onTempNicknameChange={setTempNickname}
                                    onStartEditNickname={() => {
                                        setTempNickname(member.nickname || '');
                                        setEditingNickname(true);
                                    }}
                                    onSaveNickname={handleUpdateNickname}
                                    onCancelEditNickname={() => setEditingNickname(false)}
                                    onKickMember={() => handleKickMember(member.id, displayName)}
                                    onSelectForReport={() => setSelectedMemberForReport({ id: member.user_id, name: displayName })}
                                />
                            );
                        })}
                </div>
            </div>

            {selectedMemberForReport && (
                <MemberReportModal
                    isOpen={!!selectedMemberForReport}
                    onClose={() => setSelectedMemberForReport(null)}
                    userId={selectedMemberForReport.id}
                    userName={selectedMemberForReport.name}
                />
            )}
        </div>
    );
}
