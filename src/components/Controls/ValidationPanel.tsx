import { useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { validateAll } from '../../utils/validation';

export function ValidationPanel() {
  const state = useAppStore(s => s);
  const [open, setOpen] = useState(false);
  const result = useMemo(() => validateAll(state), [state.classes, state.students, state.groups]);
  const classById = useMemo(() => Object.fromEntries(state.classes.map(c => [c.id, c])), [state.classes]);

  return (
    <div style={{ border: '1px solid #ddd', padding: 8, borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 600 }}>검증</div>
        <button onClick={() => setOpen(o => !o)}>{open ? '접기' : '결과 보기'}</button>
        <span style={{ fontSize: 12, color: '#555' }}>
          크기 문제 {result.sizeIssues.length}건, 그룹 문제 {result.groupIssues.length}건
        </span>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>반 인원 제약</div>
            {result.sizeIssues.length === 0 && <div>문제 없음</div>}
            {result.sizeIssues.map((i, idx) => (
              <div key={idx}>
                {classById[i.classId]?.name}: {i.type === 'under' ? `미만 (${i.current}/${i.min})` : `초과 (${i.current}/${i.max})`}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>그룹 선택 제약</div>
            {result.groupIssues.length === 0 && <div>문제 없음</div>}
            {result.groupIssues.map((i, idx) => (
              <div key={idx}>
                학생 {state.students[i.studentId]?.name}: {i.groupId} {i.reason === 'min' ? `최소 미달(${i.got} / ${i.bound})` : `최대 초과(${i.got} / ${i.bound})`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


