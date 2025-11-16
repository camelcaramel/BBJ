import * as XLSX from 'xlsx';
import type { Student } from '../state/types';
import type { Group } from '../state/types';

type ParseResult = {
  students: Student[];
  subjectsCatalog: string[];
};

export function parseStudentsFromWorkbook(workbook: XLSX.WorkBook): ParseResult {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  const students: Student[] = [];
  const subjectSet = new Set<string>();
  const metaHeaders = new Set(['순번', '반', '번호', '학번', '이름']);

  for (const row of rows) {
    const seq = String(row['순번'] ?? '').trim();
    const klass = String(row['반'] ?? '').trim();
    const number = String((row['학번'] ?? row['번호'] ?? '')).trim();
    const name = String(row['이름'] ?? '').trim();
    if (!name) continue;

    // 학생 ID/학번 결정: 순번 우선, 없으면 반-번호, 없으면 번호, 최후에는 이름-행인덱스 대체
    const studentNo = number || (klass && row['번호'] ? `${klass}-${row['번호']}` : number);
    const rawId = seq || (klass && row['번호'] ? `${klass}-${row['번호']}` : studentNo) || '';

    const selectedSubjects: string[] = [];
    Object.keys(row).forEach(k => {
      if (metaHeaders.has(k)) return;
      const cell = row[k];
      const v = String(cell ?? '').trim();
      if (!v) return;
      // 패턴1: 열 헤더가 과목명이고 셀에 표시값(O, 1, TRUE 등)
      const flag = v.toLowerCase();
      const isFlag = flag === 'o' || flag === 'y' || flag === 'yes' || flag === 'true' || flag === '1';
      const isNumericPositive = typeof cell === 'number' ? cell > 0 : false;
      if (isFlag || isNumericPositive || cell === true) {
        selectedSubjects.push(k.trim());
        subjectSet.add(k.trim());
        return;
      }
      // 패턴2: 셀 값 자체가 과목명(또는 복수 과목 구분자)
      const split = v.split(/[,/;|]/).map(s => s.trim()).filter(Boolean);
      if (split.length > 0) {
        split.forEach(sub => {
          selectedSubjects.push(sub);
          subjectSet.add(sub);
        });
      }
    });

    const id = (rawId || `${name}-${students.length + 1}`).toString();
    students.push({ id, studentNo: studentNo || id, name, selectedSubjects: Array.from(new Set(selectedSubjects)) });
  }

  return { students, subjectsCatalog: Array.from(subjectSet) };
}

export async function parseStudentsFromFile(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  return parseStudentsFromWorkbook(wb);
}

// 그룹 엑셀 템플릿 생성 및 파싱
export function createGroupTemplateWorkbook(): XLSX.WorkBook {
  // 헤더: Group, Option, MinSelect, MaxSelect
  const headers = ['Group', 'Option', 'MinSelect', 'MaxSelect'];
  const ws = XLSX.utils.aoa_to_sheet([headers, ['예시그룹', '수학Ⅰ', 1, ''], ['', '수학Ⅱ', '', '']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Groups');
  return wb;
}

export function createGroupTemplateBlob(): Blob {
  const wb = createGroupTemplateWorkbook();
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function parseGroupsFromWorkbook(workbook: XLSX.WorkBook): Group[] {
  const sheet = workbook.Sheets['Groups'] ?? workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const byName: Record<string, Group> = {};
  for (const row of rows) {
    const name = String(row['Group'] ?? '').trim();
    const option = String(row['Option'] ?? '').trim();
    const minSelRaw = String(row['MinSelect'] ?? '').trim();
    const maxSelRaw = String(row['MaxSelect'] ?? '').trim();
    if (!name) continue;
    if (!byName[name]) {
      byName[name] = {
        id: `group-${Math.random().toString(36).slice(2, 8)}`,
        name,
        options: [],
        minSelect: 1,
        maxSelect: null
      };
    }
    if (option) {
      if (!byName[name].options.includes(option)) byName[name].options.push(option);
    }
    const minNum = minSelRaw === '' ? NaN : Number(minSelRaw);
    const maxNum = maxSelRaw === '' ? NaN : Number(maxSelRaw);
    if (!Number.isNaN(minNum)) byName[name].minSelect = Math.max(0, Math.floor(minNum));
    if (!Number.isNaN(maxNum)) byName[name].maxSelect = Math.max(0, Math.floor(maxNum));
    if (maxSelRaw === '') byName[name].maxSelect = null;
  }
  return Object.values(byName);
}

export async function parseGroupsFromFile(file: File): Promise<Group[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  return parseGroupsFromWorkbook(wb);
}


