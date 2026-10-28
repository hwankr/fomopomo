'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import Navbar from '@/components/Navbar';
import { supabase } from '@/lib/supabase';

// 흰 페이지 위 본문: 카드·구분선 없이 여백과 글자 크기로만 나눈다.
const bodyClass = 'flex flex-col gap-9 text-[15px] leading-[1.75] break-keep text-ink md:gap-10';
const sectionClass = 'flex flex-col gap-3';
const listClass = 'flex list-disc flex-col gap-1.5 pl-5 marker:text-ink-faint';
const datesClass = 'flex flex-col gap-0.5 text-[13px] text-ink-subtle';

export default function TermsClient() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="flex flex-col">
      <Navbar
        session={session}
        onOpenLogin={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
      />

      <article className="mx-auto flex w-full max-w-[760px] flex-col gap-9 px-4 pt-4 pb-20 md:gap-12 md:px-10">
        <h1 className="ui-h1">이용약관</h1>

        <div className={bodyClass}>
          <section className={sectionClass}>
            <h2 className="ui-h2">
              제1조 (목적)
            </h2>
            <p>
              본 약관은 Fomopomo(이하 &quot;서비스&quot;)가 제공하는 모든
              서비스의 이용 조건 및 절차, 이용자와 서비스의 권리, 의무 및
              책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">
              제2조 (서비스의 제공)
            </h2>
            <p>
              Fomopomo는 뽀모도로 타이머, 공부 시간 측정, 그룹 스터디 등의
              기능을 제공합니다. 서비스는 운영상의 필요에 따라 사전 고지 없이
              변경되거나 중단될 수 있습니다.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">
              제3조 (책임의 한계)
            </h2>
            <p>
              본 서비스는 &quot;있는 그대로(As-Is)&quot; 제공됩니다. 서비스 이용
              중 발생한 데이터 손실, 접속 오류, 기타 손해에 대해 운영자는 법적
              책임을 지지 않습니다. 중요한 데이터는 이용자가 별도로
              백업해야 합니다.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">
              제4조 (이용자의 의무)
            </h2>
            <ul className={listClass}>
              <li>
                이용자는 타인의 명예를 훼손하거나 불법적인 목적으로 서비스를
                이용할 수 없습니다.
              </li>
              <li>
                비정상적인 방법(매크로, 자동화 도구 등)으로 서비스에 과도한
                요청을 보내는 행위를 금지합니다.
              </li>
              <li>
                이용 약관을 위반하는 경우, 사전 통보 없이 계정 이용이 제한될
                수 있습니다.
              </li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">
              제5조 (준거법)
            </h2>
            <p>본 약관은 대한민국 법령에 따라 해석되고 적용됩니다.</p>
          </section>

          <div className={datesClass}>
            <p>공고일자: 2026년 1월 28일</p>
            <p>시행일자: 2026년 1월 28일</p>
          </div>
        </div>
      </article>
    </div>
  );
}
