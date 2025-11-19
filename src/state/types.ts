export type Student = {
  id: string;
  studentNo: string;
  name: string;
  selectedSubjects: string[];
  classNum?: string;
  studentNum?: number;
};

export type ClassRoom = {
  id: string;
  name: string;
  minSize: number;
  maxSize: number;
  studentIds: string[];
};

export type Group = {
  id: string;
  name: string;
  options: string[];
  minSelect: number;
  maxSelect: number | null;
};

export type SortDirection = 'asc' | 'desc';

export type SortRule = {
  field: 'studentNo' | 'name' | 'subject';
  subject?: string;
  direction: SortDirection;
};

export type Filters = {
  groupId?: string;
  subjectOptions?: string[];
};

export type AppState = {
  classCount: number;
  classes: ClassRoom[];
  students: Record<string, Student>;
  unassignedIds: string[];
  groups: Group[];
  sortRules: SortRule[];
  filters: Filters;
  currentStep: 'setup' | 'upload' | 'group' | 'assign' | 'auto-assign';
  selectedIds: string[];
};


