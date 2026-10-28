'use client';

import { use } from 'react';
import GroupsScreen from '@/components/groups/GroupsScreen';

// /groups/[id]: 같은 그룹 화면을 이 그룹이 선택된 채로 연다(데스크톱·모바일 모두 칩 + 상세).
export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return <GroupsScreen initialGroupId={id} />;
}
