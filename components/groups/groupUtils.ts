// 그룹 화면이 함께 쓰는 표기·변환 도우미.

type MemberNameSource = {
    nickname: string | null;
    profiles: { email: string | null } | null;
};

// 그룹 닉네임 → 이메일 앞부분 → '멤버' 순서로 화면에 보일 이름을 고른다.
export function getMemberDisplayName(member: MemberNameSource) {
    const email = member.profiles?.email;
    return member.nickname || (email ? email.split('@')[0] : '멤버');
}

type StudyStatusSource = {
    status: string;
    study_start_time: string | null;
    total_stopwatch_time: number | null;
};

/**
 * 멤버의 이번 주 공부 시간(초) = 저장된 시간 + 지금 진행 중인 몫.
 * 공부 중이면 시작 시각(주 시작 전이면 주 시작)부터 now까지, 일시정지 중이면 일시정지 전까지 잰 시간을 더한다.
 */
export function getLiveStudySeconds(
    profile: StudyStatusSource,
    savedSeconds: number,
    weekStartMs: number,
    now: number
) {
    if (profile.status === 'studying' && profile.study_start_time) {
        const startMs = Math.max(new Date(profile.study_start_time).getTime(), weekStartMs);
        return savedSeconds + Math.max(0, Math.floor((now - startMs) / 1000));
    }
    if (profile.status === 'paused') {
        return savedSeconds + (profile.total_stopwatch_time || 0);
    }
    return savedSeconds;
}

// 순위 행의 시:분 (예: 19:40)
export function formatHourMinute(seconds: number) {
    const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
    return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

// 합계 같은 큰 숫자 (예: 88시간 15분, 2시간, 40분)
export function formatHoursText(seconds: number) {
    const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes}분`;
    return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

// create_group / join_group_by_code RPC는 그룹 행(배열)을 돌려준다. 새로 고를 그룹 id만 꺼낸다.
export function readGroupId(data: unknown): string | undefined {
    const row = Array.isArray(data) ? data[0] : data;
    if (row && typeof row === 'object') {
        const id = (row as Record<string, unknown>).id;
        if (typeof id === 'string') return id;
    }
    return undefined;
}

// 초대 링크: /groups?code=XXXXXX 로 들어오면 참여 확인 창이 코드를 채운 채 열린다.
export function buildInviteLink(origin: string, code: string) {
    return `${origin}/groups?code=${encodeURIComponent(code)}`;
}
