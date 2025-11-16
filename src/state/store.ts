import { create } from 'zustand';
import type { AppState, ClassRoom, Group, Student, SortRule, Filters } from './types';
import { loadState, saveState } from '../utils/persist';

type Actions = {
  initClasses: (count: number, minSize: number, maxSize: number) => void;
  setClassSize: (classId: string, minSize: number, maxSize: number) => void;
  setStudents: (students: Student[]) => void;
  setGroups: (groups: Group[]) => void;
  upsertGroup: (group: Group) => void;
  moveStudent: (studentId: string, toColumnId: string) => void; // 'unassigned' or classId
  moveSelected: (toColumnId: string) => void;
  setSortRules: (rules: SortRule[]) => void;
  setFilters: (filters: Filters) => void;
  setStep: (step: AppState['currentStep']) => void;
  toggleSelect: (studentId: string) => void;
  clearSelection: () => void;
  hydrate: () => void;
  exportJson: () => string;
  importJson: (raw: string) => void;
};

const initialState: AppState = {
  classCount: 0,
  classes: [],
  students: {},
  unassignedIds: [],
  groups: [],
  sortRules: [],
  filters: {},
  currentStep: 'setup',
  selectedIds: []
};

export const useAppStore = create<AppState & Actions>((set, get) => ({
  ...initialState,

  hydrate: () => {
    const loaded = loadState();
    if (loaded) {
      set(loaded);
    }
  },

  exportJson: () => {
    const state = get();
    return JSON.stringify(state, null, 2);
  },

  importJson: (raw: string) => {
    const parsed = JSON.parse(raw) as AppState;
    set(parsed);
  },

  initClasses: (count, minSize, maxSize) => {
    const classes: ClassRoom[] = Array.from({ length: count }).map((_, i) => ({
      id: `class-${i + 1}`,
      name: `${i + 1}반`,
      minSize,
      maxSize,
      studentIds: []
    }));
    set({ classCount: count, classes, currentStep: 'upload' });
    saveState(get());
  },

  setClassSize: (classId, minSize, maxSize) => {
    set(state => ({
      classes: state.classes.map(c => (c.id === classId ? { ...c, minSize, maxSize } : c))
    }));
    saveState(get());
  },

  setStudents: (studentsArr: Student[]) => {
    const students: Record<string, Student> = {};
    const unassignedIds: string[] = [];
    for (const s of studentsArr) {
      students[s.id] = s;
      unassignedIds.push(s.id);
    }
    set({ students, unassignedIds, currentStep: 'group' });
    saveState(get());
  },

  setGroups: (groups: Group[]) => {
    set({ groups });
    saveState(get());
  },

  upsertGroup: (group: Group) => {
    set(state => {
      const exists = state.groups.some(g => g.id === group.id);
      const groups = exists ? state.groups.map(g => (g.id === group.id ? group : g)) : [...state.groups, group];
      return { groups };
    });
    saveState(get());
  },

  moveStudent: (studentId, toColumnId) => {
    set(state => {
      const next = { ...state };
      // remove from all
      next.unassignedIds = next.unassignedIds.filter(id => id !== studentId);
      next.classes = next.classes.map(cls => ({
        ...cls,
        studentIds: cls.studentIds.filter(id => id !== studentId)
      }));
      // add to target
      if (toColumnId === 'unassigned') {
        next.unassignedIds = [...next.unassignedIds, studentId];
      } else {
        next.classes = next.classes.map(cls => (cls.id === toColumnId ? { ...cls, studentIds: [...cls.studentIds, studentId] } : cls));
      }
      return next;
    });
    saveState(get());
  },
  moveSelected: (toColumnId) => {
    set(state => {
      const ids = state.selectedIds;
      if (ids.length === 0) return state;
      const next = { ...state };
      // remove all selected
      next.unassignedIds = next.unassignedIds.filter(id => !ids.includes(id));
      next.classes = next.classes.map(cls => ({
        ...cls,
        studentIds: cls.studentIds.filter(id => !ids.includes(id))
      }));
      // add to target
      if (toColumnId === 'unassigned') {
        next.unassignedIds = [...next.unassignedIds, ...ids];
      } else {
        next.classes = next.classes.map(cls => (cls.id === toColumnId ? { ...cls, studentIds: [...cls.studentIds, ...ids] } : cls));
      }
      next.selectedIds = [];
      return next;
    });
    saveState(get());
  },

  setSortRules: (rules: SortRule[]) => {
    set({ sortRules: rules });
    saveState(get());
  },

  setFilters: (filters: Filters) => {
    set({ filters });
    saveState(get());
  },

  setStep: step => {
    set({ currentStep: step });
    saveState(get());
  },
  toggleSelect: (studentId) => {
    set(state => {
      const selected = new Set(state.selectedIds);
      if (selected.has(studentId)) selected.delete(studentId);
      else selected.add(studentId);
      return { selectedIds: Array.from(selected) };
    });
  },
  clearSelection: () => {
    set({ selectedIds: [] });
  }
}));


