import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  getLongTermTaskBreadcrumb,
  getLongTermTaskChildren,
  getLongTermTaskProgress,
  getLongTermTaskRoots,
  type LongTermTaskItem,
} from '../longTermTasks';

const project: LongTermTaskItem = {
  id: 'exam', title: '중간고사', subject_id: null, position: 0,
  subtasks: [{ id: 'preparation', title: '시험 일정 확인', position: 0, completed_at: '2026-10-09T00:00:00Z' }],
};
const course: LongTermTaskItem = {
  id: 'course-a', title: 'A과목', subject_id: 'subject-a', parent_task_id: project.id, position: 0,
  subtasks: [
    { id: 'chapter', title: '개념 정리', position: 0, completed_at: '2026-10-09T00:00:00Z' },
    { id: 'practice', title: '기출문제 풀기', position: 1, completed_at: null },
  ],
};
const emptyCourse: LongTermTaskItem = {
  id: 'course-b', title: 'B과목', subject_id: 'subject-b', parent_task_id: project.id, position: 1, subtasks: [],
};
const plain: LongTermTaskItem = {
  id: 'coding', title: '코딩테스트', subject_id: null, parent_task_id: null, position: 1, subtasks: [],
};
const otherProject: LongTermTaskItem = {
  id: 'finals', title: '기말고사', subject_id: null, position: 2, subtasks: [],
};
const otherCourse: LongTermTaskItem = {
  ...course, id: 'other-course-a', parent_task_id: otherProject.id,
};
const tasks = [project, course, emptyCourse, plain, otherProject, otherCourse];

describe('long-term project hierarchy', () => {
  it('keeps name-only and existing flat projects at the top level', () => {
    expect(getLongTermTaskRoots(tasks)).toEqual([project, plain, otherProject]);
    expect(getLongTermTaskChildren(tasks, plain.id)).toEqual([]);
    expect(getLongTermTaskProgress(plain, tasks)).toEqual({ completedCount: 0, totalCount: 0 });
  });

  it('keeps the same subject separate in different projects and does not promote orphan courses', () => {
    expect(getLongTermTaskChildren(tasks, project.id)).toEqual([course, emptyCourse]);
    const withoutParent = tasks.filter((task) => task.id !== project.id);
    expect(getLongTermTaskRoots(withoutParent)).toEqual([plain, otherProject]);
  });

  it('counts both direct and course subtasks once without treating an empty course as a completed task', () => {
    expect(getLongTermTaskProgress(project, tasks)).toEqual({ completedCount: 2, totalCount: 3 });
    expect(getLongTermTaskProgress(course, tasks)).toEqual({ completedCount: 1, totalCount: 2 });
    expect(getLongTermTaskProgress(emptyCourse, tasks)).toEqual({ completedCount: 0, totalCount: 0 });
  });

  it('distinguishes identical course names by project while retaining simple task titles', () => {
    expect(getLongTermTaskBreadcrumb(course, tasks)).toBe('중간고사 › A과목');
    expect(getLongTermTaskBreadcrumb(otherCourse, tasks)).toBe('기말고사 › A과목');
    expect(getLongTermTaskBreadcrumb(plain, tasks)).toBe('코딩테스트');
  });
});
