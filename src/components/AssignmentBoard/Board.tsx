import { DndContext } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useMemo, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Column } from './Column';
import { computeGroupDistribution, computeUnassignedDistribution } from '../../utils/charts';
import { StackedBarRecharts } from '../Charts/StackedBarRecharts';
import { SortingPanel } from '../Controls/SortingPanel';
import { FilterPanel } from '../Controls/FilterPanel';
import { ValidationPanel } from '../Controls/ValidationPanel';
import { calculateMovingClasses, type ScheduleResult, type ScheduleOption } from '../../utils/scheduler';
import type { SubjectMeta } from '../../utils/classAllocator';


export function AssignmentBoard() {
  const classes = useAppStore(s => s.classes);
  const students = useAppStore(s => s.students);
  const unassignedIds = useAppStore(s => s.unassignedIds);
  const moveStudent = useAppStore(s => s.moveStudent);
  const groups = useAppStore(s => s.groups);
  const filters = useAppStore(s => s.filters);
  const sortRules = useAppStore(s => s.sortRules);
  const exportJson = useAppStore(s => s.exportJson);
  const importJson = useAppStore(s => s.importJson);
  const setFilters = useAppStore(s => s.setFilters);
  const selectedIds = useAppStore(s => s.selectedIds);
  const moveSelected = useAppStore(s => s.moveSelected);
  const clearSelection = useAppStore(s => s.clearSelection);
  const [bulkTarget, setBulkTarget] = useState<string>('unassigned');

  // Moving Class State
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);
  const [scheduleOption, setScheduleOption] = useState<ScheduleOption>('min-blocks');
  const [isScheduling, setIsScheduling] = useState(false);

  // We need subject metas for the scheduler. 
  // Ideally this should be in the store, but for now we might need to pass it or assume it's available.
  // Wait, ClassAssignment.tsx had `subjectMetas`. But it didn't save it to the store.
  // We need to persist subjectMetas to the store or re-upload.
  // For now, I'll assume the user has to re-upload or we mock it? 
  // No, that's bad UX.
  // I should check if `subjectMetas` are saved. `store.ts` doesn't have `subjectMetas`.
  // I will add `subjectMetas` to `AppState` in `types.ts` and `store.ts` first?
  // Or I can just ask the user to upload the meta file again here?
  // Let's check `ClassAssignment.tsx` again. It sets `subjectMetas` state but doesn't pass to store.
  // I will add a file input for "Subject Meta" here if it's missing, OR I will modify `store` to keep it.
  // Modifying store is better. But I am in the middle of editing Board.tsx.
  // I'll add a temporary file uploader for Meta here if needed, or just assume we need to add it to store.
  // Let's add it to store. It's cleaner.
  // But I can't edit store in parallel.
  // I will add a "Load Meta" button here for now.

  const [loadedMetas, setLoadedMetas] = useState<SubjectMeta[]>([]);

  const handleSchedule = async () => {
    if (loadedMetas.length === 0) {
      alert('Please upload Subject Meta file first.');
      return;
    }
    setIsScheduling(true);
    try {
      // We need to re-parse the meta file if not loaded? 
      // Actually if we have loadedMetas we are good.
      const minSize = classes.length > 0 ? classes[0].minSize : 0;
      const result = calculateMovingClasses(classes, students, loadedMetas, scheduleOption, minSize);
      setScheduleResult(result);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleMetaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Dynamic import to avoid circular dependency if any, or just import normally
    const { parseSubjectMeta } = await import('../../utils/classAllocator');
    const metas = await parseSubjectMeta(file);
    setLoadedMetas(metas);
    alert(`Loaded ${metas.length} subject metas.`);
  };


  const applyFilters = (arr: any[]) => {
    let out = arr;
    if (filters.subjectOptions && filters.subjectOptions.length > 0) {
      out = out.filter((s: any) => filters.subjectOptions!.every(sub => s.selectedSubjects.includes(sub)));
    }
    return out;
  };
  const applySort = (arr: any[]) => {
    if (sortRules.length === 0) return arr;
    const sorted = [...arr];
    sorted.sort((a, b) => {
      for (const r of sortRules) {
        let av: any, bv: any;
        if (r.field === 'name') { av = a.name; bv = b.name; }
        else if (r.field === 'studentNo') { av = a.studentNo; bv = b.studentNo; }
        else { // subject presence
          const sub = r.subject ?? '';
          av = a.selectedSubjects.includes(sub) ? 1 : 0;
          bv = b.selectedSubjects.includes(sub) ? 1 : 0;
        }
        if (av < bv) return r.direction === 'asc' ? -1 : 1;
        if (av > bv) return r.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  };

  const unassigned = useMemo(() => applySort(applyFilters(unassignedIds.map(id => students[id]))), [unassignedIds, students, filters, sortRules]);
  const unassignedHidden = useMemo(() => unassignedIds.length - unassigned.length, [unassignedIds.length, unassigned.length]);

  const classViews = useMemo(() => {
    return classes.map(cls => {
      const all = cls.studentIds.map(id => students[id]);
      const visible = applySort(applyFilters(all));
      const hidden = all.length - visible.length;
      return { cls, visible, hidden };
    });
  }, [classes, students, filters, sortRules]);
  const selectedGroup = useMemo(() => {
    if (filters.groupId) return groups.find(g => g.id === filters.groupId) || null;
    return groups[0] ?? null;
  }, [groups, filters.groupId]);
  const chartPoints = useMemo(() => (selectedGroup ? computeGroupDistribution(useAppStore.getState(), selectedGroup) : []), [classes, students, groups, selectedGroup]);
  const unassignedPoint = useMemo(() => (selectedGroup ? computeUnassignedDistribution(useAppStore.getState(), selectedGroup) : null), [unassignedIds, students, groups, selectedGroup]);
  const unassignedTotal = useMemo(() => unassignedIds.length, [unassignedIds]);

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    moveStudent(activeId, overId);
  };

  return (
    <div className="stack">
      <h2>반 배정</h2>
      <div className="cluster" style={{ marginBottom: 8 }}>
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn" onClick={() => {
          const data = exportJson();
          const blob = new Blob([data], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'banbaejung_state.json';
          a.click();
          URL.revokeObjectURL(url);
        }}>JSON 내보내기</button>
        <label className="btn" style={{ cursor: 'pointer' }}>
          JSON 가져오기
          <input type="file" accept="application/json" style={{ display: 'none' }} onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            const text = await f.text();
            importJson(text);
          }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <SortingPanel />
        <FilterPanel />
        <ValidationPanel />
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, border: '1px solid #ddd' }}>
        <div className="cluster" style={{ marginBottom: 12 }}>
          <h3>이동 수업 최적화 (Moving Class Optimization)</h3>
          <span style={{ marginLeft: 'auto' }} />
          {loadedMetas.length === 0 && (
            <label className="btn">
              Upload Subject Meta
              <input type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleMetaUpload} />
            </label>
          )}
          {loadedMetas.length > 0 && <span className="muted">Meta Loaded ({loadedMetas.length})</span>}
        </div>

        <div className="cluster" style={{ marginBottom: 12 }}>
          <label>
            <input
              type="radio"
              name="opt"
              checked={scheduleOption === 'min-blocks'}
              onChange={() => setScheduleOption('min-blocks')}
            />
            Minimize Time Blocks
          </label>
          <label style={{ marginLeft: 16 }}>
            <input
              type="radio"
              name="opt"
              checked={scheduleOption === 'min-space'}
              onChange={() => setScheduleOption('min-space')}
            />
            Minimize Space (Concurrent)
          </label>
          <button className="btn btn--primary" style={{ marginLeft: 16 }} onClick={handleSchedule} disabled={isScheduling || loadedMetas.length === 0}>
            {isScheduling ? 'Calculating...' : 'Calculate Schedule'}
          </button>
        </div>

        {scheduleResult && (
          <div>
            <div className="cluster" style={{ marginBottom: 8 }}>
              <strong>Results:</strong>
              <span>Total Blocks: {scheduleResult.metrics.totalBlocks}</span>
              <span>Max Concurrent: {scheduleResult.metrics.maxConcurrent}</span>
            </div>
            {scheduleResult.warnings.length > 0 && (
              <div style={{ marginBottom: 8, padding: 8, background: '#fff3cd', borderRadius: 4, fontSize: 12 }}>
                {scheduleResult.warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
              </div>
            )}
            {scheduleResult.violations && scheduleResult.violations.length > 0 && (
              <div style={{ marginBottom: 8, padding: 8, background: '#ffebee', borderRadius: 4, fontSize: 12, color: '#c62828' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Constraint Violations:</div>
                {scheduleResult.violations.map((v, i) => <div key={i}>🚫 {v}</div>)}
              </div>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ border: '1px solid #ddd', padding: 8, width: 80 }}>Block</th>
                    <th style={{ border: '1px solid #ddd', padding: 8 }}>Subjects (Classes)</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleResult.blocks.map(block => (
                    <tr key={block.id}>
                      <td style={{ border: '1px solid #ddd', padding: 8, textAlign: 'center' }}>
                        Block {block.id}
                      </td>
                      <td style={{ border: '1px solid #ddd', padding: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
                          {block.classDetails?.map((detail, i) => {
                            // Lookup student names for Hover UI
                            const instanceInfo = scheduleResult.instanceMap.get(detail.instanceId);
                            const studentNames = instanceInfo
                              ? instanceInfo.students.map(sid => students[sid]?.name).filter(Boolean).join(', ')
                              : '';

                            return (
                              <div
                                key={i}
                                style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4, fontSize: 11 }}
                                title={studentNames} // Hover UI
                              >
                                <div style={{ fontWeight: 'bold', marginBottom: 4, borderBottom: '1px solid #eee', paddingBottom: 2 }}>
                                  {detail.subjectName} <span style={{ color: '#666' }}>({detail.totalStudents}명)</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                  {detail.movements.map((m, j) => (
                                    <span key={j} style={{ background: '#e3f2fd', padding: '2px 4px', borderRadius: 2 }}>
                                      {m.adminClass}반({m.count})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedGroup && (
        <div style={{ marginBottom: 16, minWidth: 0 }}>
          <div className="cluster" style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600 }}>{selectedGroup.name} 분포</div>
            <span style={{ marginLeft: 'auto' }} />
            <label style={{ fontSize: 12 }} className="muted">차트 그룹</label>
            <select
              value={filters.groupId ?? (groups[0]?.id ?? '')}
              onChange={e => setFilters({ ...filters, groupId: e.target.value || undefined })}
            >
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <StackedBarRecharts points={chartPoints} group={selectedGroup} />
        </div>
      )}
      {selectedGroup && unassignedPoint && (
        <div style={{ marginBottom: 16, minWidth: 0 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>미배정 분포 (총 {unassignedTotal}명)</div>
          <StackedBarRecharts points={[unassignedPoint]} group={selectedGroup} />
          <div style={{ fontSize: 12 }} className="muted">
            {(() => {
              const totals = selectedGroup.options.map(opt => Number((unassignedPoint as any)[opt] || 0));
              const total = totals.reduce((a, b) => a + b, 0) || 0;
              return selectedGroup.options.map((opt, i) => {
                const count = totals[i];
                const ratio = total ? Math.round((count / total) * 100) : 0;
                return `${opt}: ${count}명 (${ratio}%)`;
              }).join(' | ');
            })()}
          </div>
        </div>
      )}
      <div className="cluster" style={{ marginBottom: 8 }}>
        <div style={{ fontWeight: 600 }}>일괄 이동</div>
        <span style={{ fontSize: 12 }} className="muted">선택: {selectedIds.length}명</span>
        <select value={bulkTarget} onChange={e => setBulkTarget(e.target.value)}>
          <option value="unassigned">미배정</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn btn--primary" disabled={selectedIds.length === 0} onClick={() => moveSelected(bulkTarget)}>이동</button>
        <button className="btn" disabled={selectedIds.length === 0} onClick={clearSelection}>선택 해제</button>
      </div>
      <DndContext onDragEnd={onDragEnd}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `minmax(280px, 1fr) repeat(${classes.length}, minmax(280px, 1fr))`,
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 16
        }}>
          <Column id="unassigned" title="미배정" students={unassigned} visibleCount={unassigned.length} hiddenCount={unassignedHidden} />
          {classViews.map(({ cls, visible, hidden }) => (
            <Column
              key={cls.id}
              id={cls.id}
              title={`${cls.name} (${cls.studentIds.length}/${cls.maxSize})`}
              warn={cls.studentIds.length > cls.maxSize ? 'over' : cls.studentIds.length < cls.minSize ? 'under' : undefined}
              students={visible}
              visibleCount={visible.length}
              hiddenCount={hidden}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}


