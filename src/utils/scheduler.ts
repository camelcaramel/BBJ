import type { Student, ClassRoom } from '../state/types';
import type { SubjectMeta } from './classAllocator';

export type ScheduleOption = 'min-blocks' | 'min-space';

export interface ClassMovement {
    adminClass: string; // e.g. "1반" or "1"
    count: number;
}

export interface ClassDetail {
    instanceId: string;
    subjectName: string;
    totalStudents: number;
    movements: ClassMovement[];
}

export interface ScheduleBlock {
    id: number;
    subjects: string[]; // Subject Instance IDs (e.g. "MAT1_1", "ENG1_1")
    displayNames: string[]; // "수학I (1반)", "영어I (1반)"
    classDetails: ClassDetail[]; // Detailed breakdown
}

export interface ScheduleResult {
    blocks: ScheduleBlock[];
    metrics: {
        totalBlocks: number;
        maxConcurrent: number;
    };
    warnings: string[];
    instanceMap: Map<string, { code: string, students: string[] }>; // Instance ID -> Info
    violations: string[]; // List of constraint violations
}

interface SubjectInstance {
    id: string; // "MAT1_1"
    code: string; // "MAT1"
    students: string[];
    conflicts: Set<string>; // Set of conflicting Instance IDs
    degree: number;
    isPure?: boolean;
}

const DEFAULT_MOVING_CLASS_SIZE = 25;

export function calculateMovingClasses(
    classes: ClassRoom[],
    students: Record<string, Student>,
    subjectMetas: SubjectMeta[],
    option: ScheduleOption,
    minSize: number = 0
): ScheduleResult {

    // 0. Identify Mandatory Subjects (100% Selection)
    const allStudentIds = Object.keys(students);
    const totalStudentCount = allStudentIds.length;

    // Count subject selections
    const subjectCounts = new Map<string, number>();
    allStudentIds.forEach(sid => {
        students[sid].selectedSubjects.forEach(code => {
            subjectCounts.set(code, (subjectCounts.get(code) || 0) + 1);
        });
    });

    const excludedSubjects: string[] = [];
    const activeSubjectCodes = new Set<string>();

    subjectMetas.forEach(meta => {
        const count = subjectCounts.get(meta.code) || 0;
        if (count === totalStudentCount && totalStudentCount > 0) {
            excludedSubjects.push(meta.name);
        } else if (count > 0) {
            activeSubjectCodes.add(meta.code);
        }
    });

    // 1. Group Students by Subject (Only Active)
    const subjectGroups = new Map<string, string[]>(); // code -> studentIds[]
    const metaMap = new Map(subjectMetas.map(m => [m.code, m]));

    Object.values(students).forEach(s => {
        s.selectedSubjects.forEach(code => {
            if (activeSubjectCodes.has(code)) {
                if (!subjectGroups.has(code)) subjectGroups.set(code, []);
                subjectGroups.get(code)!.push(s.id);
            }
        });
    });

    // 2. Create Subject Instances (Splitting + Credits)
    const instances: SubjectInstance[] = [];
    const instanceMap = new Map<string, { code: string, students: string[] }>();
    const violations: string[] = [];

    subjectGroups.forEach((studentIds, code) => {
        const meta = metaMap.get(code);
        const credit = meta ? meta.credit : 1;
        const maxSize = classes.length > 0 ? classes[0].maxSize : DEFAULT_MOVING_CLASS_SIZE;

        // --- Homeroom Grouping (Pure Class) ---
        const homeroomCounts = new Map<string, { count: number, students: string[] }>();
        studentIds.forEach(sid => {
            const s = students[sid];
            if (s && s.classNum) {
                const cls = s.classNum;
                if (!homeroomCounts.has(cls)) homeroomCounts.set(cls, { count: 0, students: [] });
                const entry = homeroomCounts.get(cls)!;
                entry.count++;
                entry.students.push(sid);
            }
        });

        const mixedStudents: string[] = [];
        const totalHomeroomCounts = new Map<string, number>();
        Object.values(students).forEach(s => {
            if (s.classNum) {
                totalHomeroomCounts.set(s.classNum, (totalHomeroomCounts.get(s.classNum) || 0) + 1);
            }
        });

        homeroomCounts.forEach((entry, cls) => {
            const total = totalHomeroomCounts.get(cls) || 0;
            // If 100% match, create pure class
            if (entry.count === total && total > 0) {
                const groupIndex = `${cls}반`; // e.g. "1반"
                for (let c = 1; c <= credit; c++) {
                    const instanceId = `${code}_${groupIndex}_${c}`;
                    const instance: SubjectInstance = {
                        id: instanceId,
                        code,
                        students: entry.students,
                        conflicts: new Set(),
                        degree: 0,
                        isPure: true
                    };
                    instances.push(instance);
                    instanceMap.set(instanceId, { code, students: entry.students });
                }
            } else {
                mixedStudents.push(...entry.students);
            }
        });

        // Use balanced chunking for mixed students
        const chunks = splitIntoBalancedChunks(mixedStudents, minSize, maxSize);

        chunks.forEach((chunk, index) => {
            const groupIndex = index + 1;

            if (chunk.length < minSize) {
                const subjectName = meta ? meta.name : code;
                violations.push(`[${subjectName}] ${groupIndex}반 인원 부족: ${chunk.length}명 (최소 ${minSize}명)`);
            }

            for (let c = 1; c <= credit; c++) {
                const instanceId = `${code}_${groupIndex}_${c}`;
                const instance: SubjectInstance = {
                    id: instanceId,
                    code,
                    students: chunk,
                    conflicts: new Set(),
                    degree: 0,
                    isPure: false
                };
                instances.push(instance);
                instanceMap.set(instanceId, { code, students: chunk });
            }
        });
    });

    // 3. Build Conflict Graph
    const studentInstances = new Map<string, string[]>();
    instances.forEach(inst => {
        inst.students.forEach(sid => {
            if (!studentInstances.has(sid)) studentInstances.set(sid, []);
            studentInstances.get(sid)!.push(inst.id);
        });
    });

    // A) Student Conflicts
    studentInstances.forEach((instIds) => {
        for (let i = 0; i < instIds.length; i++) {
            for (let j = i + 1; j < instIds.length; j++) {
                addConflict(instances, instIds[i], instIds[j]);
            }
        }
    });

    // B) Self-Group Conflicts
    const groupMap = new Map<string, string[]>();
    instances.forEach(inst => {
        const parts = inst.id.split('_');
        const groupKey = `${parts[0]}_${parts[1]}`;
        if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
        groupMap.get(groupKey)!.push(inst.id);
    });

    groupMap.forEach(ids => {
        for (let i = 0; i < ids.length; i++) {
            for (let j = i + 1; j < ids.length; j++) {
                addConflict(instances, ids[i], ids[j]);
            }
        }
    });

    // Sort by degree
    instances.sort((a, b) => b.degree - a.degree);

    // Separate Pure and Mixed
    const mixedInstances = instances.filter(i => !i.isPure);
    const pureInstances = instances.filter(i => i.isPure);

    const blocks: ScheduleBlock[] = [];

    // Schedule Mixed Instances
    if (option === 'min-blocks') {
        const studentBlocks = new Map<string, Set<number>>();

        for (const inst of mixedInstances) {
            let bestBlock: ScheduleBlock | null = null;
            let minGapCost = Infinity;

            // Try to fit in existing blocks
            for (const block of blocks) {
                if (canFitInBlock(inst, block, instances, metaMap)) {
                    const cost = calculateGapCost(inst, block.id, studentBlocks);
                    if (cost < minGapCost) {
                        minGapCost = cost;
                        bestBlock = block;
                    }
                }
            }

            // Also consider a new block
            const newBlockId = blocks.length + 1;
            const newBlockCost = calculateGapCost(inst, newBlockId, studentBlocks);

            if (!bestBlock || newBlockCost < minGapCost) {
                const newBlock = createBlock(newBlockId);
                addToBlock(newBlock, inst, metaMap, students);
                blocks.push(newBlock);
                updateStudentBlocks(inst, newBlockId, studentBlocks);
            } else {
                addToBlock(bestBlock, inst, metaMap, students);
                updateStudentBlocks(inst, bestBlock.id, studentBlocks);
            }
        }
    } else if (option === 'min-space') {
        // Fallback to min-blocks logic for mixed instances for now
        for (const inst of mixedInstances) {
            let assigned = false;
            for (const block of blocks) {
                if (canFitInBlock(inst, block, instances, metaMap)) {
                    addToBlock(block, inst, metaMap, students);
                    assigned = true;
                    break;
                }
            }
            if (!assigned) {
                const newBlock = createBlock(blocks.length + 1);
                addToBlock(newBlock, inst, metaMap, students);
                blocks.push(newBlock);
            }
        }
    }

    // Schedule Pure Instances (Individual Blocks)
    for (const inst of pureInstances) {
        const newBlockId = blocks.length + 1;
        const newBlock = createBlock(newBlockId);
        addToBlock(newBlock, inst, metaMap, students);
        blocks.push(newBlock);
    }

    // --- Post-Processing Optimization ---

    // 1. Block Merging (Mixed Blocks Only)
    // The user requested to exclude Pure classes from merging.
    // We identify Pure blocks as those containing Pure instances.
    // Actually, we constructed them such that Pure blocks only have pure instances.
    // But let's be safe and separate them based on content.

    const mixedBlocks: ScheduleBlock[] = [];
    const pureBlocks: ScheduleBlock[] = [];

    blocks.forEach(b => {
        const isPureBlock = b.subjects.some(id => {
            const inst = instances.find(i => i.id === id);
            return inst && inst.isPure;
        });
        if (isPureBlock) {
            pureBlocks.push(b);
        } else {
            mixedBlocks.push(b);
        }
    });

    // Merge only mixed blocks
    mergeBlocks(mixedBlocks, instances, metaMap);

    // Combine back
    const finalBlocks = [...mixedBlocks, ...pureBlocks];

    // 2. Block Sequencing (All Blocks)
    // Reorder all blocks to minimize gaps for everyone
    optimizeBlockSequence(finalBlocks, instances);

    // Re-assign IDs after reordering/merging
    finalBlocks.forEach((b, i) => b.id = i + 1);

    const maxConcurrent = Math.max(...finalBlocks.map(b => b.subjects.length), 0);

    return {
        blocks: finalBlocks,
        metrics: {
            totalBlocks: finalBlocks.length,
            maxConcurrent
        },
        warnings: excludedSubjects.length > 0 ? [`Excluded Mandatory Subjects: ${excludedSubjects.join(', ')}`] : [],
        instanceMap,
        violations
    };
}

function splitIntoBalancedChunks(items: string[], minSize: number, maxSize: number): string[][] {
    const total = items.length;
    if (total === 0) return [];

    if (minSize <= 0 || minSize > maxSize) {
        const chunks: string[][] = [];
        for (let i = 0; i < total; i += maxSize) {
            chunks.push(items.slice(i, i + maxSize));
        }
        return chunks;
    }

    let numGroups = Math.ceil(total / maxSize);
    if (numGroups === 0) numGroups = 1;

    const chunks: string[][] = [];
    const baseSize = Math.floor(total / numGroups);
    const remainder = total % numGroups;

    let startIndex = 0;
    for (let i = 0; i < numGroups; i++) {
        const size = baseSize + (i < remainder ? 1 : 0);
        chunks.push(items.slice(startIndex, startIndex + size));
        startIndex += size;
    }

    return chunks;
}

function addConflict(instances: SubjectInstance[], idA: string, idB: string) {
    const instA = instances.find(x => x.id === idA);
    const instB = instances.find(x => x.id === idB);
    if (!instA || !instB) return;

    if (!instA.conflicts.has(idB)) {
        instA.conflicts.add(idB);
        instA.degree++;
    }
    if (!instB.conflicts.has(idA)) {
        instB.conflicts.add(idA);
        instB.degree++;
    }
}

function createBlock(id: number): ScheduleBlock {
    return { id, subjects: [], displayNames: [], classDetails: [] };
}

function addToBlock(
    block: ScheduleBlock,
    inst: SubjectInstance,
    metaMap: Map<string, SubjectMeta>,
    students: Record<string, Student>
) {
    block.subjects.push(inst.id);
    const meta = metaMap.get(inst.code);
    const name = meta ? meta.name : inst.code;

    const parts = inst.id.split('_');
    const groupNum = parts[1];

    const displayName = `${name} (${groupNum}반)`;
    block.displayNames.push(displayName);

    const movementMap = new Map<string, number>();
    inst.students.forEach(sid => {
        const s = students[sid];
        if (s && s.classNum) {
            const cls = s.classNum;
            movementMap.set(cls, (movementMap.get(cls) || 0) + 1);
        }
    });

    const movements: ClassMovement[] = Array.from(movementMap.entries())
        .map(([adminClass, count]) => ({ adminClass, count }))
        .sort((a, b) => {
            const numA = parseInt(a.adminClass) || 0;
            const numB = parseInt(b.adminClass) || 0;
            return numA - numB;
        });

    block.classDetails.push({
        instanceId: inst.id,
        subjectName: displayName,
        totalStudents: inst.students.length,
        movements
    });
}

function canFitInBlock(
    inst: SubjectInstance,
    block: ScheduleBlock,
    allInstances: SubjectInstance[],
    metaMap: Map<string, SubjectMeta>
): boolean {
    // 1. Student Conflicts
    for (const existingId of block.subjects) {
        if (inst.conflicts.has(existingId)) return false;
    }

    // 2. Teacher Constraints
    const meta = metaMap.get(inst.code);
    if (!meta) return true;

    const sameSubjectCount = block.subjects.filter(id => {
        const otherInst = allInstances.find(i => i.id === id);
        return otherInst && otherInst.code === inst.code;
    }).length;

    if (sameSubjectCount >= meta.teacherCount) {
        return false;
    }

    return true;
}

function calculateGapCost(inst: SubjectInstance, blockId: number, studentBlocks: Map<string, Set<number>>): number {
    let totalCost = 0;
    for (const sid of inst.students) {
        const blocks = studentBlocks.get(sid);
        if (!blocks || blocks.size === 0) continue;

        let min = blockId;
        let max = blockId;
        let count = 1;

        for (const b of blocks) {
            if (b < min) min = b;
            if (b > max) max = b;
            count++;
        }

        const gap = (max - min + 1) - count;
        totalCost += gap;
    }
    return totalCost;
}

function updateStudentBlocks(inst: SubjectInstance, blockId: number, studentBlocks: Map<string, Set<number>>) {
    for (const sid of inst.students) {
        if (!studentBlocks.has(sid)) studentBlocks.set(sid, new Set());
        studentBlocks.get(sid)!.add(blockId);
    }
}

// --- Optimization Helpers ---

function mergeBlocks(
    blocks: ScheduleBlock[],
    allInstances: SubjectInstance[],
    metaMap: Map<string, SubjectMeta>
) {
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < blocks.length; i++) {
            for (let j = i + 1; j < blocks.length; j++) {
                const b1 = blocks[i];
                const b2 = blocks[j];

                if (canMerge(b1, b2, allInstances, metaMap)) {
                    // Merge b2 into b1
                    b1.subjects.push(...b2.subjects);
                    b1.displayNames.push(...b2.displayNames);
                    b1.classDetails.push(...b2.classDetails);

                    // Remove b2
                    blocks.splice(j, 1);
                    changed = true;
                    break; // Restart loop
                }
            }
            if (changed) break;
        }
    }
}

function canMerge(
    b1: ScheduleBlock,
    b2: ScheduleBlock,
    allInstances: SubjectInstance[],
    metaMap: Map<string, SubjectMeta>
): boolean {
    // 1. Check Student Conflicts (Intersection must be empty)
    // Collect all students in b1
    const students1 = new Set<string>();
    for (const id of b1.subjects) {
        const inst = allInstances.find(i => i.id === id);
        if (inst) inst.students.forEach(s => students1.add(s));
    }

    // Check against b2
    for (const id of b2.subjects) {
        const inst = allInstances.find(i => i.id === id);
        if (inst) {
            for (const s of inst.students) {
                if (students1.has(s)) return false; // Conflict found
            }
        }
    }

    // 2. Check Teacher Constraints
    // Count subjects in b1 + b2
    const subjectCounts = new Map<string, number>();
    const countSubjects = (block: ScheduleBlock) => {
        block.subjects.forEach(id => {
            const inst = allInstances.find(i => i.id === id);
            if (inst) {
                subjectCounts.set(inst.code, (subjectCounts.get(inst.code) || 0) + 1);
            }
        });
    };
    countSubjects(b1);
    countSubjects(b2);

    for (const [code, count] of subjectCounts) {
        const meta = metaMap.get(code);
        if (meta && count > meta.teacherCount) return false;
    }

    return true;
}

function optimizeBlockSequence(
    blocks: ScheduleBlock[],
    allInstances: SubjectInstance[]
) {
    // Hill Climbing / Random Swap
    // Since N is small, we can try random swaps.

    let currentOrder = [...blocks];
    let currentCost = calculateTotalGapCost(currentOrder, allInstances);

    const iterations = 1000;
    for (let i = 0; i < iterations; i++) {
        // Pick two random indices
        const idx1 = Math.floor(Math.random() * currentOrder.length);
        const idx2 = Math.floor(Math.random() * currentOrder.length);
        if (idx1 === idx2) continue;

        // Swap
        const nextOrder = [...currentOrder];
        [nextOrder[idx1], nextOrder[idx2]] = [nextOrder[idx2], nextOrder[idx1]];

        const nextCost = calculateTotalGapCost(nextOrder, allInstances);

        if (nextCost < currentCost) {
            currentOrder = nextOrder;
            currentCost = nextCost;
        }
    }

    // Apply best order
    // We need to replace the contents of the original array or return a new one.
    // Since we passed 'blocks' by reference and we want to modify it,
    // we can clear and push.
    blocks.splice(0, blocks.length, ...currentOrder);
}

function calculateTotalGapCost(
    blocks: ScheduleBlock[],
    allInstances: SubjectInstance[]
): number {
    // Map Block ID (index) to Block
    // But here blocks are in order 0..N-1
    // We need to know which block index each instance belongs to.

    const instanceBlockMap = new Map<string, number>();
    blocks.forEach((b, index) => {
        b.subjects.forEach(instId => {
            instanceBlockMap.set(instId, index);
        });
    });

    // We need to iterate all students and calculate their gaps.
    // Pre-calculate student -> instance list
    // Or iterate instances and build student -> block indices
    const studentBlockIndices = new Map<string, number[]>();

    allInstances.forEach(inst => {
        const blockIdx = instanceBlockMap.get(inst.id);
        if (blockIdx === undefined) return; // Should not happen

        inst.students.forEach(sid => {
            if (!studentBlockIndices.has(sid)) studentBlockIndices.set(sid, []);
            studentBlockIndices.get(sid)!.push(blockIdx);
        });
    });

    let totalCost = 0;
    studentBlockIndices.forEach((indices) => {
        if (indices.length === 0) return;
        indices.sort((a, b) => a - b);

        const min = indices[0];
        const max = indices[indices.length - 1];
        const count = indices.length;

        // Gap = (Max - Min + 1) - Count
        // e.g. Indices [0, 2]. Min=0, Max=2. Count=2. Gap = (2-0+1) - 2 = 1.
        totalCost += (max - min + 1) - count;
    });

    return totalCost;
}
