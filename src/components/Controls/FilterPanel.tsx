import { useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';

export function FilterPanel() {
  const students = useAppStore(s => s.students);
  const groups = useAppStore(s => s.groups);
  const filters = useAppStore(s => s.filters);
  const setFilters = useAppStore(s => s.setFilters);

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    Object.values(students).forEach(s => s.selectedSubjects.forEach(sub => set.add(sub)));
    return Array.from(set).sort();
  }, [students]);

  const [subject, setSubject] = useState('');

  return (
    <div className="panel">
      <div style={{ fontWeight: 600, marginBottom: 6 }}>필터</div>
      <div className="cluster" style={{ marginBottom: 8 }}>
        <label>그룹</label>
        <select value={filters.groupId ?? ''} onChange={e => setFilters({ ...filters, groupId: e.target.value || undefined })}>
          <option value="">전체</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <label>과목 포함</label>
        <input list="subjects" value={subject} onChange={e => setSubject(e.target.value)} />
        <datalist id="subjects">
          {allSubjects.map(s => <option key={s} value={s} />)}
        </datalist>
        <button className="btn" onClick={() => setFilters({ ...filters, subjectOptions: [...new Set([...(filters.subjectOptions ?? []), subject].filter(Boolean))] })}>추가</button>
        <button className="btn" onClick={() => setFilters({ groupId: filters.groupId, subjectOptions: [] })}>과목 초기화</button>
      </div>
      <div style={{ fontSize: 12 }} className="muted">
        과목 필터: {(filters.subjectOptions ?? []).join(', ') || '없음'}
      </div>
    </div>
  );
}


