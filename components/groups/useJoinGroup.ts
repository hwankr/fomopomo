'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { readGroupId } from './groupUtils';

// 초대 코드로 그룹에 참여한다(join_group_by_code RPC). 화면의 참여 탭과 초대 링크 창이 함께 쓴다.
export function useJoinGroup(onJoined: (groupId?: string) => void) {
    const [isJoining, setIsJoining] = useState(false);

    const joinGroup = async (rawCode: string) => {
        const code = rawCode.trim().toUpperCase();
        if (!code) return false;

        setIsJoining(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error('로그인이 필요해요.');
                return false;
            }

            const { data, error } = await supabase.rpc('join_group_by_code', {
                p_code: code,
            });

            if (error) {
                toast.error('그룹을 찾지 못했어요. 코드를 확인해 주세요.');
                return false;
            }

            toast.success('그룹에 참여했어요.');
            onJoined(readGroupId(data));
            return true;
        } catch (error) {
            console.error('Error joining group:', error);
            toast.error('그룹에 참여하지 못했어요.');
            return false;
        } finally {
            setIsJoining(false);
        }
    };

    return { joinGroup, isJoining };
}
