import { signOutWithPushCleanup } from '@/lib/pushSubscriptionLifecycle';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';

// 이 탭에서 마지막으로 확인한 로그인 상태(undefined: 아직 한 번도 확인하지 못함).
// 화면(헤더 포함)은 페이지마다 새로 붙어 이 훅도 화면마다 새로 시작하므로, 기억해 두지 않으면 화면을 옮길 때마다
// 로그인 확인이 끝날 때까지 헤더 없는 로딩 화면이 끼어 헤더가 사라졌다 나타난다. 이미 아는 상태로 바로 그린다.
// 레이아웃의 ShellProvider가 이 훅을 늘 쥐고 있어 로그아웃(다른 탭 포함)·토큰 갱신·계정 전환이 곧바로 여기 반영된다.
let knownSession: Session | null | undefined;

// 로그인 상태를 바꾸는 인증 이벤트(로그인·로그아웃·토큰 갱신·계정 전환 등)를 적용할 때마다 1씩 올린다.
// getSession은 기다리는 동안 이벤트가 끼어들 수 있어, 늦게 끝난 조회 결과가 그 이벤트보다 낡을 수 있다.
// 조회를 시작할 때 값과 끝났을 때 값을 비교해 낡은 결과로 기억한 상태를 되살리지 않는다(lib/pushSubscriptionLifecycle.ts의 revision과 같은 방식).
let authRevision = 0;

const remember = (session: Session | null) => {
  knownSession = session;
};

const subscribeNothing = () => () => {};

// 하이드레이션(서버 렌더와 같아야 하는 첫 그림) 중에는 false, 그 밖의 클라이언트 렌더(화면 이동 등)에서는 true.
// 새로고침한 첫 그림은 서버와 같은 로딩 화면이어야 하므로 그때는 기억한 상태를 쓰지 않는다.
const useCanReuseKnownSession = () => useSyncExternalStore(subscribeNothing, () => true, () => false);

export function useAuthSession() {
  const reuse = useCanReuseKnownSession() && knownSession !== undefined;
  const [session, setSession] = useState<Session | null>(() => (reuse ? knownSession ?? null : null));
  const [loading, setLoading] = useState(() => !reuse);
  // 기억한 상태로 시작했다면 그때 그린 값(아니면 undefined). 구독을 붙일 때 그 뒤에 바뀐 기억값과 비교한다.
  const reusedSessionRef = useRef(reuse ? knownSession ?? null : undefined);

  useEffect(() => {
    // 화면이 떠나면 이벤트를 더 듣지 못하므로, 그 뒤에 끝난 조회 결과는 버린다.
    let disposed = false;
    // 렌더와 이 effect 사이(아직 구독하기 전)에 온 인증 이벤트는 이 화면이 못 받고 레이아웃의 ShellProvider만 받아 기억한 상태를 바꾼다.
    // 그대로 두면 이 화면은 렌더 때 기억한 이전 상태(예: 이전 계정)를 그리고, 자기 조회까지 실패하면 바로잡을 길이 없다.
    // 그래서 구독을 붙이기 전에 그 사이 바뀐 기억값으로 맞춘다. 정상 이동(그대로)이면 아무것도 하지 않는다.
    const reusedSession = reusedSessionRef.current;
    if (reusedSession !== undefined && knownSession !== undefined && knownSession !== reusedSession) {
      // 놓친 이벤트를 따라잡는 드문 경우에만 한 번 다시 그린다.
      setSession(knownSession);
    }
    // 이 화면이 구독을 시작한 시점. 구독은 아래에서 같은 틈에 붙으므로, 이 뒤에 올라간 revision의 이벤트는 이 화면도 받는다.
    const startRevision = authRevision;

    // Initial session check
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          // Only log error if it's NOT a refresh token issue
          const isRefreshTokenError = error.message && (
            error.message.includes('Refresh Token Not Found') ||
            error.message.includes('Invalid Refresh Token')
          );

          if (!isRefreshTokenError) {
            console.error('Error getting session:', error);
          }

          // If refresh token is invalid, sign out to clear storage
          // SDK는 이 오류를 돌려주기 전에 저장된 세션을 지우고 SIGNED_OUT을 먼저 보낸다(auth-js _callRefreshToken → _removeSession).
          // 그래서 revision이 달라진 것만으로 낡았다고 보지 않는다. 조회를 시작한 뒤 새 세션을 가져온 이벤트(다시 로그인 등)가
          // 있었을 때만 이 오류는 그 전 세션의 것이라 정리도 게스트 전환도 하지 않는다.
          // 정리는 화면이 아니라 탭의 저장소 일이라 화면이 떠났어도 한다(예전과 같다).
          const sessionArrivedSince = authRevision !== startRevision && knownSession != null;
          if (isRefreshTokenError && !sessionArrivedSince) {
            remember(null);
            if (!disposed) setSession(null);
            await signOutWithPushCleanup();
          }
        } else if (!disposed && authRevision === startRevision) {
          remember(session);
          setSession(session);
        }
        // 버린 결과 대신 쓸 새 상태는 이미 이벤트가 이 화면에 넣었다.
      } catch (err) {
        console.error('Unexpected error checking session:', err);
      } finally {
        // 결과를 버렸어도 살아 있는 화면은 로딩에 머물지 않는다.
        if (!disposed) setLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION') {
        // 구독할 때마다 SDK가 그 구독에만 한 번 보내는 "지금 저장된 세션" 읽기 결과다(getSession과 같은 저장소를 읽는다).
        // 로그인 상태가 바뀐 사건이 아니므로 revision을 올리지 않는다(올리면 화면이 붙을 때마다 다른 화면의 정상 조회가 버려진다).
        // getSession 결과처럼, 구독한 뒤 더 새 이벤트가 있었으면 낡은 값이라 버린다.
        // null은 '세션 없음'과 '읽다가 난 오류(네트워크 오류 등)'를 가리지 않고 오므로 게스트로 보지 않는다.
        // 로그아웃 판단은 오류를 따로 알려 주는 getSession과 SIGNED_OUT 이벤트가 한다(로그인한 사용자가 게스트로 깜빡이지 않게).
        if (session && !disposed && authRevision === startRevision) {
          remember(session);
          setSession(session);
        }
      } else if (event === 'SIGNED_OUT') {
        authRevision += 1;
        remember(null);
        setSession(null);
      } else if (session) {
        authRevision += 1;
        remember(session);
        setSession(session);
      }
    });

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

/** 테스트끼리 기억한 로그인 상태가 이어지지 않게 비운다. */
export function __resetAuthSessionForTests() {
  knownSession = undefined;
}
