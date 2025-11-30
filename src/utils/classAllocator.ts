import * as XLSX from 'xlsx';

// --- Interfaces ---

export interface StudentInfo {
  id: string;
  name: string;
  gender: string;
  score: number;
  classNum?: string;
  studentNum?: number;
}

export interface SubjectMeta {
  code: string;
  name: string;
  teacherCount: number;
  credit: number;
  category: string;
  weight: number; // Calculated: Credit * CategoryFactor
}

export interface StudentData {
  id: string;
  name: string;
  gender: string;
  score: number;
  subjects: string[]; // List of subject codes
  classNum?: string;
  studentNum?: number;
}

export interface ClassGroup {
  id: number;
  name: string;
  coreSubjects: string[];
  students: StudentData[];
  warnings: string[]; // e.g., "Teacher shortage for Math"
}

export interface AllocationConfig {
  cMin: number;
  cMax: number;
  kStart: number;
}

// --- Constants ---

const CATEGORY_FACTORS: Record<string, number> = {
  '수학': 2.0,
  '과학': 2.0,
  '사회': 2.0,
  '국어': 1.5,
  '영어': 1.5,
  '기술': 1.0,
  '가정': 1.0,
  '제2외국어': 1.0,
  '체육': 0.5,
  '예술': 0.5,
  '교양': 0.5,
};

const DEFAULT_CATEGORY_FACTOR = 1.0;

// --- Helper Functions ---

function calculateWeight(credit: number, category: string): number {
  const factor = CATEGORY_FACTORS[category] || DEFAULT_CATEGORY_FACTOR;
  return credit * factor;
}

// --- Parsing Functions ---

export async function parseStudentInfo(file: File): Promise<StudentInfo[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  return rows.map(row => {
    const name = String(row['이름'] || row['Name'] || '').trim();
    const gender = String(row['성별'] || row['Gender'] || '').trim();
    const score = Number(row['석차백분율'] || row['Score'] || 0);

    const classVal = row['반'] || row['Class'];
    const numVal = row['번호'] || row['Number'];
    const idVal = row['학번'] || row['ID'];

    let id = '';
    let classNum: string | undefined;
    let studentNum: number | undefined;

    if (classVal && numVal) {
      classNum = String(classVal).trim();
      studentNum = Number(numVal);
      // Pad number with 0 if less than 10 for consistent ID (e.g. 1-01)
      const numStr = studentNum < 10 ? `0${studentNum}` : String(studentNum);
      id = `${classNum}-${numStr}`;
    } else {
      id = String(idVal || '').trim();
    }

    return {
      id,
      name,
      gender,
      score,
      classNum,
      studentNum
    };
  }).filter(s => s.id);
}

export async function parseSubjectMeta(file: File): Promise<SubjectMeta[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  return rows.map(row => {
    const credit = Number(row['학점'] || row['Credit'] || 0);
    const category = String(row['교과군'] || row['Category'] || '').trim();
    return {
      code: String(row['과목코드'] || row['Code'] || '').trim(),
      name: String(row['과목명'] || row['Name'] || '').trim(),
      teacherCount: Number(row['교사수'] || row['TeacherCount'] || 99),
      credit,
      category,
      weight: calculateWeight(credit, category),
    };
  }).filter(s => s.code);
}

// --- Core Algorithm ---

export function runAdaptiveClustering(
  students: StudentData[],
  subjects: SubjectMeta[],
  config: AllocationConfig
): ClassGroup[] {
  const { cMin } = config;
  const classes: ClassGroup[] = [];
  let classCounter = 1;

  // Map subject code to object for easy lookup
  const subjectMap = new Map(subjects.map(s => [s.code, s]));

  // --- 1. Partition Students by Profile ---
  // Profile = Map<Category, Count> + TotalCredits
  type StudentProfile = {
    key: string;
    totalCredits: number;
    students: StudentData[];
  };

  const profileMap = new Map<string, StudentProfile>();

  students.forEach(student => {
    let totalCredits = 0;
    const categoryCounts = new Map<string, number>();

    student.subjects.forEach(code => {
      const sub = subjectMap.get(code);
      if (sub) {
        totalCredits += sub.credit;
        const cat = sub.category || 'Uncategorized';
        categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
      }
    });

    // Create Profile Key: "Math:1|Science:2"
    const sortedCats = Array.from(categoryCounts.keys()).sort();
    const profileParts = sortedCats.map(cat => `${cat}:${categoryCounts.get(cat)}`);
    const profileKey = profileParts.join('|');

    // We group by Profile Key AND Total Credits to be safe, 
    // though usually Profile Key implies Credits if credits are uniform per category.
    // But user said "Subjects in a group have same credits", so Profile Key is strong.
    // Let's include TotalCredits in key just in case.
    const fullKey = `${profileKey}#${totalCredits}`;

    if (!profileMap.has(fullKey)) {
      profileMap.set(fullKey, { key: fullKey, totalCredits, students: [] });
    }
    profileMap.get(fullKey)!.students.push(student);
  });

  // --- 2. Smart Merging (Fallback) ---
  // If a partition is too small (< cMin), try to merge with others of SAME TotalCredits.
  const partitions = Array.from(profileMap.values());
  const validPartitions: StudentProfile[] = [];
  const smallPartitions: StudentProfile[] = [];

  partitions.forEach(p => {
    if (p.students.length >= cMin) {
      validPartitions.push(p);
    } else {
      smallPartitions.push(p);
    }
  });

  // Merge small partitions by TotalCredits
  const mergedSmallMap = new Map<number, StudentData[]>();
  smallPartitions.forEach(p => {
    if (!mergedSmallMap.has(p.totalCredits)) {
      mergedSmallMap.set(p.totalCredits, []);
    }
    mergedSmallMap.get(p.totalCredits)!.push(...p.students);
  });

  // Re-evaluate merged partitions
  mergedSmallMap.forEach((mergedStudents, credits) => {
    // If still too small? We have no choice but to keep them or merge with different credits (bad).
    // For now, we keep them as a valid partition even if small, 
    // or we could mark them as "Mixed" immediately.
    // Let's treat them as a valid partition to try clustering.
    validPartitions.push({
      key: `Merged_${credits}`,
      totalCredits: credits,
      students: mergedStudents
    });
  });

  // --- 3. Run Clustering on Each Partition ---
  validPartitions.forEach(partition => {
    const partitionClasses = runClusteringOnSubset(partition.students, subjectMap, config, classCounter);
    classes.push(...partitionClasses);
    classCounter += partitionClasses.length;
  });

  return classes;
}

// Extracted original logic into a helper function
function runClusteringOnSubset(
  subsetStudents: StudentData[],
  subjectMap: Map<string, SubjectMeta>,
  config: AllocationConfig,
  startId: number
): ClassGroup[] {
  const { cMin, cMax, kStart } = config;
  let remainingStudents = [...subsetStudents];
  const subsetClasses: ClassGroup[] = [];
  let currentId = startId;

  // Helper to calculate combination weight
  const getComboWeight = (combo: string[]) => {
    return combo.reduce((sum, code) => {
      const sub = subjectMap.get(code);
      return sum + (sub ? sub.weight : 0);
    }, 0);
  };

  // Phase 1: Adaptive K-Cascade
  for (let k = kStart; k >= 1; k--) {
    let foundCluster = true;
    while (foundCluster) {
      foundCluster = false;

      // 1. Generate Combinations & Calculate Support
      // Optimization: Instead of generating all combinations, iterate students and count their k-combinations
      const comboCounts = new Map<string, { count: number, students: StudentData[], subjects: string[] }>();

      for (const student of remainingStudents) {
        // Get valid subjects for this student (present in subjectMap)
        const validSubjects = student.subjects.filter(s => subjectMap.has(s));

        if (validSubjects.length < k) continue;

        // Generate k-combinations for this student
        const combos = getCombinations(validSubjects, k);

        for (const combo of combos) {
          const key = combo.sort().join('|');
          if (!comboCounts.has(key)) {
            comboCounts.set(key, { count: 0, students: [], subjects: combo });
          }
          const entry = comboCounts.get(key)!;
          entry.count++;
          entry.students.push(student);
        }
      }

      // 2. Select Best Combination
      let bestComboKey: string | null = null;
      let bestMetric = -1; // Combined metric of support and weight

      for (const [key, entry] of comboCounts.entries()) {
        if (entry.count < cMin) continue;

        const weightSum = getComboWeight(entry.subjects);
        // Metric: Prioritize high support, tie-break with weight
        // Or: Prioritize high weight (important subjects), ensure min support
        // Spec says: "Support highest, then Weight highest"
        // Let's use a weighted score: Support * 1000 + Weight (assuming weight < 1000)
        // Actually, let's follow spec strictly: Support is primary.

        const metric = entry.count * 10000 + weightSum;

        if (metric > bestMetric) {
          bestMetric = metric;
          bestComboKey = key;
        }
      }

      if (bestComboKey) {
        const bestEntry = comboCounts.get(bestComboKey)!;
        const targetStudents = bestEntry.students;

        // 3. Class Creation & Validation
        const numClasses = Math.floor(targetStudents.length / cMax);

        // If we can't form at least one full class (or close to it), 
        // but we have enough for min size... 
        // Spec says: N_class = Floor(Size / C_max). If N < 1, Pass.
        // This means strictly enforcing C_max chunks. 
        // But wait, if we have 25 students and C_max=28, C_min=20. Floor(25/28) = 0. 
        // Then we skip? That seems too strict for the "Best" combo.
        // Re-reading spec: "If N_class < 1 then Pass". 
        // This implies we ONLY form full classes in this phase?
        // Or maybe it implies we treat the group as a potential class if Size >= C_min?
        // Let's interpret "Floor(Size / C_max)" strictly for now as per spec. 
        // BUT, usually if Size >= C_min, we should form a class.
        // Let's adjust logic: If Size >= C_min, we form 1 class. 
        // If Size >= 2 * C_min, we might form 2...
        // The spec formula "Floor(Group.size / C_max)" is for *full* classes.
        // If I have 50 students, C_max=20. Floor(2.5) = 2 classes. 40 students assigned. 10 remain.
        // If I have 25 students, C_max=28. Floor(0.89) = 0. -> Pass.
        // This logic leaves "remainders" for lower K or Phase 3.

        if (numClasses >= 1) {
          // Check Teacher Constraints
          const comboSubjects = bestEntry.subjects;
          let warnings: string[] = [];
          for (const subCode of comboSubjects) {
            const sub = subjectMap.get(subCode);
            if (sub && numClasses > sub.teacherCount) {
              warnings.push(`Teacher shortage for ${sub.name} (${sub.teacherCount} < ${numClasses})`);
            }
          }

          // Assign Students
          // Sort by score/gender for balancing (simple round-robin for now)
          // We need to pick exactly numClasses * C_max students? 
          // Or distribute all targetStudents into numClasses?
          // Spec: "Assign to N_class classes... Assigned students removed from S_remain"
          // Usually we want to fill classes to Max.

          const studentsToAssignCount = numClasses * cMax;
          // We take the "best" students? Or just first N?
          // Let's take first N for now.
          const studentsToAssign = targetStudents.slice(0, studentsToAssignCount);

          // Create Classes
          for (let i = 0; i < numClasses; i++) {
            const classStudents = studentsToAssign.slice(i * cMax, (i + 1) * cMax);
            subsetClasses.push({
              id: currentId++,
              name: `${currentId - 1}반`,
              coreSubjects: comboSubjects,
              students: classStudents,
              warnings: [...warnings]
            });
          }

          // Remove assigned students from remainingStudents
          const assignedIds = new Set(studentsToAssign.map(s => s.id));
          remainingStudents = remainingStudents.filter(s => !assignedIds.has(s.id));

          foundCluster = true; // Continue searching in this K
        }
      }
    }
  }

  // Phase 3: Residual Handling
  // Group remaining students into mixed classes
  while (remainingStudents.length > 0) {
    const chunk = remainingStudents.splice(0, cMax);
    subsetClasses.push({
      id: currentId++,
      name: `${currentId - 1}반 (Mixed)`,
      coreSubjects: ['Mixed'],
      students: chunk,
      warnings: ['Mixed Class - Prioritize in Timetable']
    });
  }
  return subsetClasses;
}

// Helper for combinations
function getCombinations(arr: string[], k: number): string[][] {
  const results: string[][] = [];

  function helper(start: number, combo: string[]) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }

  helper(0, []);
  return results;
}

export function createStudentInfoTemplateBlob(): Blob {
  const headers = ['반', '번호', '이름', '성별', '석차백분율'];
  const data = [
    ['1', '1', '홍길동', '남', '95'],
    ['1', '2', '김철수', '남', '88']
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'StudentInfo');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function createSubjectMetaTemplateBlob(): Blob {
  const headers = ['과목코드', '과목명', '교사수', '학점', '교과군'];
  const data = [
    ['MAT1', '수학Ⅰ', '2', '4', '수학'],
    ['ENG1', '영어Ⅰ', '2', '4', '영어']
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SubjectMeta');
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
