import { parseStudentsFromFile } from '../utils/excel';
import { useAppStore } from '../state/store';
import { useState } from 'react';

export function ExcelUploader() {
  const setStudents = useAppStore(s => s.setStudents);
  const [subjectsPreview, setSubjectsPreview] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File) => {
    try {
      const { students, subjectsCatalog } = await parseStudentsFromFile(file);
      setStudents(students);
      setSubjectsPreview(subjectsCatalog.slice(0, 10));
    } catch (e) {
      setError('엑셀 파싱 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="panel">
      <h2>엑셀 업로드</h2>
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {subjectsPreview.length > 0 && (
        <p>과목 예시: {subjectsPreview.join(', ')}{subjectsPreview.length === 10 ? ' ...' : ''}</p>
      )}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <p>양식: 첫 행에 '순번','반','번호','이름', 그리고 과목명 열들. 과목 열에는 O/1/TRUE 등으로 표기.</p>
    </div>
  );
}


