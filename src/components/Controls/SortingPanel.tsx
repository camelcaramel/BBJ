import { useState } from 'react';
import { useAppStore } from '../../state/store';
import type { SortRule } from '../../state/types';

export function SortingPanel() {
  const rules = useAppStore(s => s.sortRules);
  const setRules = useAppStore(s => s.setSortRules);
  const [draft, setDraft] = useState<SortRule>({ field: 'name', direction: 'asc' });

  const addRule = () => {
    setRules([...rules, draft]);
    setDraft({ field: 'name', direction: 'asc' });
  };
  const clearRules = () => setRules([]);

  return (
    <div style={{ border: '1px solid #ddd', padding: 8, borderRadius: 6 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>정렬</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <select value={draft.field} onChange={e => setDraft({ ...draft, field: e.target.value as any })}>
          <option value="name">이름</option>
          <option value="studentNo">학번</option>
          <option value="subject">과목 포함 여부</option>
        </select>
        {draft.field === 'subject' && (
          <input placeholder="과목명" value={draft.subject ?? ''} onChange={e => setDraft({ ...draft, subject: e.target.value })} />
        )}
        <select value={draft.direction} onChange={e => setDraft({ ...draft, direction: e.target.value as any })}>
          <option value="asc">오름차순</option>
          <option value="desc">내림차순</option>
        </select>
        <button onClick={addRule}>추가</button>
        <button onClick={clearRules}>초기화</button>
      </div>
      <div style={{ fontSize: 12, color: '#555' }}>
        현재 규칙: {rules.map((r, i) => `${i + 1}. ${r.field}${r.field === 'subject' ? `(${r.subject})` : ''} ${r.direction}`).join(' | ') || '없음'}
      </div>
    </div>
  );
}


