import { useMemo, useState } from 'react';
import { useAppStore } from '../state/store';
import type { Group } from '../state/types';
import { createGroupTemplateBlob, parseGroupsFromFile } from '../utils/excel';

export function GroupBuilder() {
  const students = useAppStore(s => s.students);
  const groups = useAppStore(s => s.groups);
  const upsertGroup = useAppStore(s => s.upsertGroup);
  const setGroups = useAppStore(s => s.setGroups);
  const setStep = useAppStore(s => s.setStep);

  const allSubjects = useMemo(() => {
    const set = new Set<string>();
    Object.values(students).forEach(s => s.selectedSubjects.forEach(sub => set.add(sub)));
    return Array.from(set).sort();
  }, [students]);

  const [draft, setDraft] = useState<Group>({
    id: `group-${groups.length + 1}`,
    name: `그룹 ${groups.length + 1}`,
    options: [],
    minSelect: 1,
    maxSelect: null
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleOption = (opt: string) => {
    setDraft(prev => ({
      ...prev,
      options: prev.options.includes(opt) ? prev.options.filter(o => o !== opt) : [...prev.options, opt]
    }));
  };

  const saveGroup = () => {
    if (!draft.name.trim() || draft.options.length === 0) return;
    upsertGroup(draft);
    if (editingId) {
      setEditingId(null);
    }
    setDraft({
      id: `group-${Math.random().toString(36).slice(2, 8)}`,
      name: `그룹 ${groups.length + 2}`,
      options: [],
      minSelect: 1,
      maxSelect: null
    });
  };

  const startEdit = (g: Group) => {
    setEditingId(g.id);
    setDraft({ ...g });
  };

  const resetNew = () => {
    setEditingId(null);
    setDraft({
      id: `group-${Math.random().toString(36).slice(2, 8)}`,
      name: `그룹 ${groups.length + 1}`,
      options: [],
      minSelect: 1,
      maxSelect: null
    });
  };

  const deleteGroup = (id: string) => {
    const next = groups.filter(g => g.id !== id);
    setGroups(next);
    if (editingId === id) resetNew();
  };

  const downloadTemplate = () => {
    const blob = createGroupTemplateBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'groups_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importGroups = async (file: File) => {
    const parsed = await parseGroupsFromFile(file);
    if (parsed.length > 0) {
      setGroups(parsed);
      resetNew();
    }
  };

  return (
    <div>
      <h2>그룹 구성</h2>
      {allSubjects.length === 0 && (
        <div style={{ color: '#d32f2f', marginBottom: 8 }}>
          과목이 감지되지 않았습니다. 엑셀에서 과목 셀 값에 과목명 또는 표기(O/1/TRUE)를 사용했는지 확인하세요.
        </div>
      )}
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <h3>{editingId ? '그룹 수정' : '새 그룹 만들기'}</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={downloadTemplate}>그룹 템플릿 다운로드</button>
            <label style={{ border: '1px solid #ddd', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}>
              그룹 엑셀 업로드
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={e => {
                const f = e.target.files?.[0];
                if (f) importGroups(f);
              }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <label>그룹명</label>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
            <label>최소 선택</label>
            <input type="number" value={draft.minSelect} onChange={e => setDraft({ ...draft, minSelect: Number(e.target.value || 0) })} />
            <label>최대 선택(비우면 무제한)</label>
            <input
              type="number"
              value={draft.maxSelect ?? ''}
              onChange={e => {
                const v = e.target.value;
                setDraft({ ...draft, maxSelect: v === '' ? null : Number(v) });
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #ddd', padding: 8 }}>
            {allSubjects.map(opt => (
              <label key={opt} style={{ display: 'block' }}>
                <input type="checkbox" checked={draft.options.includes(opt)} onChange={() => toggleOption(opt)} /> {opt}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={saveGroup}>{editingId ? '수정 저장' : '그룹 저장'}</button>
            <button onClick={resetNew}>새로 만들기</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <h3>그룹 목록</h3>
          {groups.length === 0 && <p>아직 그룹이 없습니다.</p>}
          {groups.map(g => (
            <div key={g.id} style={{ border: '1px solid #ddd', marginBottom: 8, padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 600, flex: 1 }}>{g.name}</div>
                <button onClick={() => startEdit(g)}>편집</button>
                <button onClick={() => deleteGroup(g.id)} style={{ color: '#d32f2f' }}>삭제</button>
              </div>
              <div>선택 범위: {g.minSelect} ~ {g.maxSelect ?? '제한 없음'}</div>
              <div style={{ fontSize: 12, color: '#555' }}>{g.options.join(', ')}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setStep('assign')}>배정 화면으로 이동</button>
      </div>
    </div>
  );
}


