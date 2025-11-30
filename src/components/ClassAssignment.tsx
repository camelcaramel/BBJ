import { useState } from 'react';
import {
    parseStudentInfo,
    parseSubjectMeta,
    runAdaptiveClustering,
    createStudentInfoTemplateBlob,
    createSubjectMetaTemplateBlob,
    type ClassGroup,
    type StudentData
} from '../utils/classAllocator';
import { parseStudentsFromFile, createSelectionTemplateBlob } from '../utils/excel';
import { useAppStore } from '../state/store';
import type { AppState, Student, ClassRoom } from '../state/types';

export function ClassAssignment() {
    const [selectionFile, setSelectionFile] = useState<File | null>(null);
    const [infoFile, setInfoFile] = useState<File | null>(null);
    const [metaFile, setMetaFile] = useState<File | null>(null);

    const [config, setConfig] = useState({
        cMin: 20,
        cMax: 28,
        kStart: 4
    });

    const [results, setResults] = useState<ClassGroup[]>([]);
    const [subjectMetas, setSubjectMetas] = useState<any[]>([]); // Store parsed metas
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const importJson = useAppStore(s => s.importJson);
    const setStep = useAppStore(s => s.setStep);

    const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

    const handleRun = async () => {
        if (!selectionFile || !infoFile || !metaFile) {
            alert('Please upload all 3 files.');
            return;
        }

        setIsProcessing(true);
        setLogs([]);
        addLog('Starting process...');

        try {
            // 1. Parse Selection Data (Existing Logic)
            addLog('Parsing Selection Data...');
            const selectionResult = await parseStudentsFromFile(selectionFile);
            const selectionMap = new Map(selectionResult.students.map(s => [s.id, s.selectedSubjects]));
            addLog(`Loaded ${selectionResult.students.length} selection records.`);

            // 2. Parse Student Info (New Logic)
            addLog('Parsing Student Info...');
            const infos = await parseStudentInfo(infoFile);
            addLog(`Loaded ${infos.length} student info records.`);

            // 3. Parse Subject Meta (New Logic)
            addLog('Parsing Subject Meta...');
            const metas = await parseSubjectMeta(metaFile);
            setSubjectMetas(metas); // Save for later use
            addLog(`Loaded ${metas.length} subject meta records.`);

            // 4. Merge Data
            addLog('Merging Data...');
            const mergedStudents: StudentData[] = [];
            for (const info of infos) {
                const subjects = selectionMap.get(info.id) || [];
                if (subjects.length === 0) {
                    addLog(`Warning: No subjects found for student ${info.id} (${info.name})`);
                }
                mergedStudents.push({
                    ...info,
                    subjects
                });
            }
            addLog(`Merged ${mergedStudents.length} students ready for allocation.`);

            // 5. Run Algorithm
            addLog('Running Adaptive Clustering...');
            const classes = runAdaptiveClustering(mergedStudents, metas, config);
            setResults(classes);
            addLog(`Generated ${classes.length} classes.`);

        } catch (e: any) {
            console.error(e);
            addLog(`Error: ${e.message}`);
            alert('An error occurred. Check logs.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadTemplate = (type: 'selection' | 'info' | 'meta') => {
        let blob: Blob | null = null;
        let filename = '';

        if (type === 'selection') {
            blob = createSelectionTemplateBlob();
            filename = 'template_selection.xlsx';
        } else if (type === 'info') {
            blob = createStudentInfoTemplateBlob();
            filename = 'template_student_info.xlsx';
        } else if (type === 'meta') {
            blob = createSubjectMetaTemplateBlob();
            filename = 'template_subject_meta.xlsx';
        }

        if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const handleExport = () => {
        // TODO: Implement Excel export of results
        alert('Export not implemented yet.');
    };

    const handleProceed = () => {
        if (results.length === 0) return;

        const studentsMap: Record<string, Student> = {};
        const classes: ClassRoom[] = [];
        const unassignedIds: string[] = []; // Currently all assigned, but keep for safety

        results.forEach(group => {
            const classId = `class-${group.id}`;
            const studentIds: string[] = [];

            group.students.forEach(s => {
                const student: Student = {
                    id: s.id,
                    name: s.name,
                    studentNo: s.id, // Use ID as studentNo for now if not present
                    selectedSubjects: s.subjects,
                    classNum: group.name.replace('반', '').trim(), // Extract number from "1반"
                    studentNum: s.studentNum
                };
                studentsMap[student.id] = student;
                studentIds.push(student.id);
            });

            classes.push({
                id: classId,
                name: group.name,
                minSize: config.cMin,
                maxSize: config.cMax,
                studentIds
            });
        });

        // Generate Groups from Subject Metas
        const groupsMap = new Map<string, string[]>();
        subjectMetas.forEach(meta => {
            const category = meta.category || 'Uncategorized';
            if (!groupsMap.has(category)) {
                groupsMap.set(category, []);
            }
            groupsMap.get(category)!.push(meta.code);
        });

        const groups: any[] = Array.from(groupsMap.entries()).map(([category, codes]) => ({
            id: `group-${category}`,
            name: category,
            options: codes,
            minSelect: 0,
            maxSelect: null
        }));

        const newState: AppState = {
            classCount: classes.length,
            classes,
            students: studentsMap,
            unassignedIds,
            groups,
            sortRules: [],
            filters: {},
            currentStep: 'assign',
            selectedIds: []
        };

        importJson(JSON.stringify(newState));
        setStep('assign');
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>자동 반배정 (Automated Class Assignment)</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>1. Selection Data</h3>
                        <button onClick={() => handleDownloadTemplate('selection')} style={{ fontSize: 12 }}>Template</button>
                    </div>
                    <input type="file" accept=".xlsx" onChange={e => setSelectionFile(e.target.files?.[0] || null)} />
                    <p>{selectionFile?.name}</p>
                </div>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>2. Student Info</h3>
                        <button onClick={() => handleDownloadTemplate('info')} style={{ fontSize: 12 }}>Template</button>
                    </div>
                    <input type="file" accept=".xlsx" onChange={e => setInfoFile(e.target.files?.[0] || null)} />
                    <p>{infoFile?.name}</p>
                </div>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>3. Subject Meta</h3>
                        <button onClick={() => handleDownloadTemplate('meta')} style={{ fontSize: 12 }}>Template</button>
                    </div>
                    <input type="file" accept=".xlsx" onChange={e => setMetaFile(e.target.files?.[0] || null)} />
                    <p>{metaFile?.name}</p>
                </div>
            </div>

            <div className="card" style={{ marginBottom: 20 }}>
                <h3>Configuration</h3>
                <label>
                    Min Class Size:
                    <input type="number" value={config.cMin} onChange={e => setConfig({ ...config, cMin: Number(e.target.value) })} />
                </label>
                <label style={{ marginLeft: 20 }}>
                    Max Class Size:
                    <input type="number" value={config.cMax} onChange={e => setConfig({ ...config, cMax: Number(e.target.value) })} />
                </label>
                <label style={{ marginLeft: 20 }}>
                    K-Start:
                    <input type="number" value={config.kStart} onChange={e => setConfig({ ...config, kStart: Number(e.target.value) })} />
                </label>
            </div>

            <button onClick={handleRun} disabled={isProcessing} style={{ padding: '10px 20px', fontSize: 16, cursor: 'pointer' }}>
                {isProcessing ? 'Processing...' : 'Start Allocation'}
            </button>

            <div style={{ marginTop: 20 }}>
                <h3>Logs</h3>
                <div style={{ background: '#f0f0f0', padding: 10, height: 100, overflowY: 'auto', borderRadius: 4 }}>
                    {logs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>

            {results.length > 0 && (
                <div style={{ marginTop: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Results ({results.length} Classes)</h3>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={handleExport}>Export Results</button>
                            <button onClick={handleProceed} className="btn btn--primary" style={{ backgroundColor: '#007bff', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}>
                                Proceed to Manual Assignment
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                        {results.map(cls => (
                            <div key={cls.id} className="card" style={{ border: '1px solid #ccc', padding: 10 }}>
                                <h4>{cls.name} ({cls.students.length}명)</h4>
                                <p><strong>Core:</strong> {cls.coreSubjects.join(', ')}</p>
                                {cls.warnings.length > 0 && (
                                    <div style={{ color: 'red', fontSize: 12 }}>
                                        {cls.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                                    </div>
                                )}
                                <details>
                                    <summary>Students</summary>
                                    <ul style={{ fontSize: 12, paddingLeft: 20 }}>
                                        {cls.students.map(s => (
                                            <li key={s.id}>{s.name} ({s.gender}, {s.score})</li>
                                        ))}
                                    </ul>
                                </details>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
