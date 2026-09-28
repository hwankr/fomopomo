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

  it('never invents a subject for missing names, empty titles or unrelated tasks', () => {
    expect(suggestSubjectId('블록체인 복습', subjects('데이터베이스'))).toBeNull();
    expect(suggestSubjectId('복습', subjects('  '))).toBeNull();
    expect(suggestSubjectId(' ', subjects('블록체인'))).toBeNull();
    expect(suggestSubjectId('블록체인 복습', [])).toBeNull();
  });
});
