import type { AppState, Group } from '../state/types';

export type ChartPoint = {
  class: string;
  [optionName: string]: number | string;
};

export function computeGroupDistribution(state: AppState, group: Group): ChartPoint[] {
  const optSet = new Set(group.options);
  return state.classes.map(cls => {
    const row: ChartPoint = { class: cls.name };
    for (const opt of group.options) row[opt] = 0;
    for (const sid of cls.studentIds) {
      const s = state.students[sid];
      for (const subj of s.selectedSubjects) {
        if (optSet.has(subj)) {
          row[subj] = (Number(row[subj]) || 0) + 1;
        }
      }
    }
    return row;
  });
}

export function computeUnassignedDistribution(state: AppState, group: Group): ChartPoint {
  const optSet = new Set(group.options);
  const row: ChartPoint = { class: '미배정' };
  for (const opt of group.options) row[opt] = 0;
  for (const sid of state.unassignedIds) {
    const s = state.students[sid];
    for (const subj of s.selectedSubjects) {
      if (optSet.has(subj)) {
        row[subj] = (Number(row[subj]) || 0) + 1;
      }
    }
  }
  return row;
}

export const defaultColor = '#90caf9';
export function colorFor(option: string): string {
  // simple deterministic color by hash
  let hash = 0;
  for (let i = 0; i < option.length; i++) {
    hash = (hash * 31 + option.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 70% 55%)`;
}


