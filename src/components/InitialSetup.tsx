import { useState } from 'react';
import { useAppStore } from '../state/store';

export function InitialSetup() {
  const initClasses = useAppStore(s => s.initClasses);
  const [count, setCount] = useState(3);
  const [minSize, setMinSize] = useState(25);
  const [maxSize, setMaxSize] = useState(30);

  return (
    <div>
      <h2>초기 설정</h2>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>반 개수</label>
        <input type="number" value={count} onChange={e => setCount(Number(e.target.value || 0))} />
        <label>최소 인원</label>
        <input type="number" value={minSize} onChange={e => setMinSize(Number(e.target.value || 0))} />
        <label>최대 인원</label>
        <input type="number" value={maxSize} onChange={e => setMaxSize(Number(e.target.value || 0))} />
        <button onClick={() => initClasses(count, minSize, maxSize)}>생성</button>
      </div>
      <p>반 개수와 최소/최대 인원을 입력한 뒤 생성하세요.</p>
    </div>
  );
}


