'use client';

import Navbar from '@/components/Navbar';
import { supabase } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';

// 흰 페이지 위 본문: 카드·구분선 없이 여백과 글자 크기로만 나눈다.
const bodyClass = 'flex flex-col gap-9 text-[15px] leading-[1.75] break-keep text-ink md:gap-10';
const sectionClass = 'flex flex-col gap-3';
const listClass = 'flex list-disc flex-col gap-1.5 pl-5 marker:text-ink-faint';
const datesClass = 'flex flex-col gap-0.5 text-[13px] text-ink-subtle';

export default function PrivacyClient() {
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
        <h1 className="ui-h1">개인정보처리방침</h1>

        <div className={bodyClass}>
          <section className={sectionClass}>
            <h2 className="ui-h2">1. 수집하는 개인정보 항목</h2>
            <p>Fomopomo는 원활한 서비스 제공을 위해 최소한의 정보를 수집합니다.</p>
            <ul className={listClass}>
              <li>필수항목: 이메일, 닉네임, 프로필 이미지 (Google 계정 정보 연동)</li>
              <li>생성정보: 서비스 이용 기록, 접속 로그, 쿠키, 공부 시간 기록</li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">2. 개인정보의 처리 목적</h2>
            <p>수집한 개인정보는 다음의 목적을 위해서만 활용합니다.</p>
            <ul className={listClass}>
              <li>회원 가입 및 관리, 사용자 식별</li>
              <li>공부 시간 측정, 통계 제공, 그룹 및 랭킹 서비스 운영</li>
              <li>서비스 관련 공지사항 전달 및 문의 응대</li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">3. 개인정보의 보유 및 이용 기간</h2>
            <p>
              이용자의 개인정보는 원칙적으로 회원 탈퇴 시 지체 없이 파기합니다. 단, 관계법령의 규정에 의하여 보존할 필요가 있는 경우 관련 법령에서 정한 기간 동안 보관합니다.
            </p>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">4. 개인정보의 제3자 제공</h2>
            <p>
              Fomopomo는 이용자의 개인정보를 외부 업체에 위탁하지 않으나, 서비스 운영을 위해 다음의 인프라 서비스를 이용합니다.
            </p>
            <ul className={listClass}>
              <li>데이터베이스 호스팅: Supabase (AWS)</li>
              <li>인증 처리: Google Cloud Platform (OAuth)</li>
            </ul>
          </section>

          <section className={sectionClass}>
            <h2 className="ui-h2">5. 문의처</h2>
            <p>
              개인정보 관련 문의는 아래 이메일로 연락 주시기 바랍니다.<br />
              이메일: <a href="mailto:fabronjeon@naver.com" className="font-semibold text-pomo underline-offset-4 hover:underline">fabronjeon@naver.com</a>
            </p>
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
