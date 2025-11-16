import type { AppState, Group, Student } from '../state/types';

export function validateGroupSelection(student: Student, group: Group) {
  const count = student.selectedSubjects.filter(x => group.options.includes(x)).length;
  if (count < group.minSelect) return { ok: false as const, reason: 'min' as const, need: group.minSelect, got: count };
  if (group.maxSelect != null && count > group.maxSelect) return { ok: false as const, reason: 'max' as const, limit: group.maxSelect, got: count };
  return { ok: true as const };
}

export function validateAll(state: AppState) {
  const sizeIssues: { classId: string; type: 'under' | 'over'; current: number; min?: number; max?: number }[] = [];
  for (const cls of state.classes) {
    if (cls.studentIds.length < cls.minSize) sizeIssues.push({ classId: cls.id, type: 'under', current: cls.studentIds.length, min: cls.minSize });
    if (cls.studentIds.length > cls.maxSize) sizeIssues.push({ classId: cls.id, type: 'over', current: cls.studentIds.length, max: cls.maxSize });
  }
  const groupIssues: { studentId: string; groupId: string; reason: 'min' | 'max'; got: number; bound: number }[] = [];
  for (const g of state.groups) {
    for (const s of Object.values(state.students)) {
      const res = validateGroupSelection(s, g);
      if (res.ok) continue;
      if (res.reason === 'min') groupIssues.push({ studentId: s.id, groupId: g.id, reason: 'min', got: res.got, bound: res.need });
      if (res.reason === 'max') groupIssues.push({ studentId: s.id, groupId: g.id, reason: 'max', got: res.got, bound: res.limit! });
    }
  }
  return { sizeIssues, groupIssues };
}


