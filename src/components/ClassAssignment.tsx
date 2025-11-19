import React, { useState } from 'react';
import { parseStudentsFromFile } from '../utils/excel';
import {
    parseStudentInfo,
    parseSubjectMeta,
    runAdaptiveClustering,
    type ClassGroup,
    type StudentData
} from '../utils/classAllocator';

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
    const [logs, setLogs] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

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

    const handleExport = () => {
        // TODO: Implement Excel export of results
        alert('Export not implemented yet.');
    };

    return (
        <div style={{ padding: 20 }}>
            <h2>자동 반배정 (Automated Class Assignment)</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
                <div className="card">
                    <h3>1. Selection Data</h3>
                    <input type="file" accept=".xlsx" onChange={e => setSelectionFile(e.target.files?.[0] || null)} />
                    <p>{selectionFile?.name}</p>
                </div>
                <div className="card">
                    <h3>2. Student Info</h3>
                    <input type="file" accept=".xlsx" onChange={e => setInfoFile(e.target.files?.[0] || null)} />
                    <p>{infoFile?.name}</p>
                </div>
                <div className="card">
                    <h3>3. Subject Meta</h3>
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
                        <button onClick={handleExport}>Export Results</button>
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
