import { describe, expect, it } from 'vitest';
import { suggestSubjectId } from '@/lib/subjectSuggestion';

const subjects = (...names: string[]) => names.map((name, index) => ({ id: `subject-${index}`, user_id: 'user', name }));

describe('suggestSubjectId', () => {
  it.each(['블록체인 9/13 복습', '블록체인 9/15 복습', '[블록체인] 9/15 복습'])('matches registered Korean names in %s', title => {
    expect(suggestSubjectId(title, subjects('데이터베이스', '블록체인'))).toBe('subject-1');
  });

  it('normalizes composed Korean, compatibility characters, case and whitespace', () => {
    expect(suggestSubjectId('블록체인 복습'.normalize('NFD'), subjects('블록체인'))).toBe('subject-0');
    expect(suggestSubjectId('  ＤＡＴＡ   Structures review ', subjects('data structures'))).toBe('subject-0');
  });

  it('does not match short English names inside other words', () => {
    expect(suggestSubjectId('POST endpoint review', subjects('OS'))).toBeNull();
    expect(suggestSubjectId('JavaScript review', subjects('Java'))).toBeNull();
    expect(suggestSubjectId('POST와 OS 복습', subjects('OS'))).toBe('subject-0');
  });

  it('preserves punctuation that distinguishes registered subjects', () => {
    expect(suggestSubjectId('C++ 3장 복습', subjects('C', 'C++', 'C#'))).toBe('subject-1');
    expect(suggestSubjectId('C# 3장 복습', subjects('C++'))).toBeNull();
  });

  it('prefers the longest matched subject that includes a shorter match', () => {
    expect(suggestSubjectId('선형대수 복습', subjects('대수', '선형대수'))).toBe('subject-1');
    expect(suggestSubjectId('React Native review', subjects('React', 'React Native'))).toBe('subject-1');
  });

  it('keeps unrelated multiple matches and normalized duplicate names unclassified', () => {
    expect(suggestSubjectId('블록체인과 데이터베이스 복습', subjects('블록체인', '데이터베이스'))).toBeNull();
    expect(suggestSubjectId('React Native와 블록체인 복습', subjects('React', 'React Native', '블록체인'))).toBeNull();
    expect(suggestSubjectId('OS review', subjects('OS', 'os'))).toBeNull();
  });

  it('keeps independent shorter mentions ambiguous even when a longer name also matches', () => {
    expect(suggestSubjectId('선형대수와 대수 복습', subjects('대수', '선형대수'))).toBeNull();
    expect(suggestSubjectId('React Native and React review', subjects('React', 'React Native'))).toBeNull();
    expect(suggestSubjectId('React Native review and React Native practice', subjects('React', 'React Native'))).toBe('subject-1');
  });

  describe('archived subjects', () => {
    const archive = (list: ReturnType<typeof subjects>, ...archivedNames: string[]) =>
      list.map(subject => ({ ...subject, archived_at: archivedNames.includes(subject.name) ? '2026-11-09T01:00:00.000Z' : null }));

    it('never suggests an archived subject even when its name is in the title', () => {
      expect(suggestSubjectId('영어 단어 100개', archive(subjects('영어', '통계'), '영어'))).toBeNull();
      expect(suggestSubjectId('정보처리기사 실기', archive(subjects('정보처리기사'), '정보처리기사'))).toBeNull();
      // 다시 사용하면(보관 시각 없음) 다시 고른다.
      expect(suggestSubjectId('영어 단어 100개', archive(subjects('영어', '통계')))).toBe('subject-0');
    });

    it('does not fall back to a subject in use that is part of an archived longer name', () => {
      // 제목은 보관한 선형대수 이야기다. 그 안의 "대수"는 모호하므로 고르지 않는다.
      expect(suggestSubjectId('선형대수 복습', archive(subjects('대수', '선형대수'), '선형대수'))).toBeNull();
      expect(suggestSubjectId('React Native review', archive(subjects('React', 'React Native'), 'React Native'))).toBeNull();
    });

    it('judges the remaining subjects in use on their own', () => {
      // 따로 쓰인 사용 중 과목 이름은 보관한 과목 이름과 함께 있어도 고른다.
      expect(suggestSubjectId('선형대수와 대수 복습', archive(subjects('대수', '선형대수'), '선형대수'))).toBe('subject-0');
      expect(suggestSubjectId('영어 단어와 통계 과제', archive(subjects('영어', '통계'), '영어'))).toBe('subject-1');
      // 보관한 과목이 짧은 이름이면, 긴 사용 중 과목은 그대로 고른다.
      expect(suggestSubjectId('선형대수 복습', archive(subjects('대수', '선형대수'), '대수'))).toBe('subject-1');
      // 사용 중 과목끼리 모호하면 그대로 null이다.
      expect(suggestSubjectId('블록체인과 데이터베이스와 영어', archive(subjects('블록체인', '데이터베이스', '영어'), '영어'))).toBeNull();
    });

    it('keeps the short English word rule for archived names', () => {
      expect(suggestSubjectId('POST와 OS 복습', archive(subjects('OS', 'POST'), 'POST'))).toBe('subject-0');
      expect(suggestSubjectId('POST endpoint review', archive(subjects('OS', 'POST'), 'POST'))).toBeNull();
    });
  });

  it('never invents a subject for missing names, empty titles or unrelated tasks', () => {
    expect(suggestSubjectId('블록체인 복습', subjects('데이터베이스'))).toBeNull();
    expect(suggestSubjectId('복습', subjects('  '))).toBeNull();
    expect(suggestSubjectId(' ', subjects('블록체인'))).toBeNull();
    expect(suggestSubjectId('블록체인 복습', [])).toBeNull();
  });
});
