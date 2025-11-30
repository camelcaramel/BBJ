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
}

const DEFAULT_MOVING_CLASS_SIZE = 25; // TODO: Make configurable?

export function calculateMovingClasses(
    classes: ClassRoom[],
    students: Record<string, Student>,
    subjectMetas: SubjectMeta[],
    option: ScheduleOption,
    minSize: number = 0 // Added minSize parameter
): ScheduleResult {

    // 0. Identify Mandatory Subjects (100% Selection)
    // We consider "Active Students" as those who have selected at least one subject? 
    // Or just all students in the input map.
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
        // If 100% of students take it, exclude it.
        // Also exclude if 0 students take it (optimization).
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
        const credit = meta ? meta.credit : 1; // Default 1 credit
        const maxSize = classes.length > 0 ? classes[0].maxSize : DEFAULT_MOVING_CLASS_SIZE;

        // Use balanced chunking
        const chunks = splitIntoBalancedChunks(studentIds, minSize, maxSize);

        chunks.forEach((chunk, index) => {
            const groupIndex = index + 1;

            // Check for min size violation
            if (chunk.length < minSize) {
                const subjectName = meta ? meta.name : code;
                violations.push(`[${subjectName}] ${groupIndex}반 인원 부족: ${chunk.length}명 (최소 ${minSize}명)`);
            }

            // Create N instances for N credits
            for (let c = 1; c <= credit; c++) {
                // ID Format: CODE_GROUP_SESSION (e.g. MAT1_1_1, MAT1_1_2)
                const instanceId = `${code}_${groupIndex}_${c}`;

                const instance: SubjectInstance = {
                    id: instanceId,
                    code,
                    students: chunk,
                    conflicts: new Set(),
                    degree: 0
                };
                instances.push(instance);
                instanceMap.set(instanceId, { code, students: chunk });
            }
        });
    });

    // 3. Build Conflict Graph
    // Conflicts:
    // A) Same Student in different subjects.
    // B) Same Subject-Group (different sessions) -> MUST NOT overlap.

    // Pre-compute student -> instances map
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

    // B) Self-Group Conflicts (Sessions of same class)
    // Identify groups: CODE_GROUP
    const groupMap = new Map<string, string[]>();
    instances.forEach(inst => {
        // ID: CODE_GROUP_SESSION
        const parts = inst.id.split('_');
        const groupKey = `${parts[0]}_${parts[1]}`; // CODE_GROUP
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

    const blocks: ScheduleBlock[] = [];

    if (option === 'min-blocks') {
        for (const inst of instances) {
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
    } else if (option === 'min-space') {
        const minResult = calculateMovingClasses(classes, students, subjectMetas, 'min-blocks', minSize);
        const targetCount = minResult.blocks.length;

        const spaceBlocks = Array.from({ length: targetCount }).map((_, i) => createBlock(i + 1));

        for (const inst of instances) {
            const validBlocks = spaceBlocks.filter(b => canFitInBlock(inst, b, instances, metaMap));
            if (validBlocks.length > 0) {
                validBlocks.sort((a, b) => a.subjects.length - b.subjects.length);
                addToBlock(validBlocks[0], inst, metaMap, students);
            } else {
                const newBlock = createBlock(spaceBlocks.length + 1);
                addToBlock(newBlock, inst, metaMap, students);
                spaceBlocks.push(newBlock);
            }
        }
        blocks.push(...spaceBlocks);
    }

    const maxConcurrent = Math.max(...blocks.map(b => b.subjects.length), 0);

    return {
        blocks,
        metrics: {
            totalBlocks: blocks.length,
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

    // If minSize is invalid or too small, fallback to simple chunking
    if (minSize <= 0 || minSize > maxSize) {
        const chunks: string[][] = [];
        for (let i = 0; i < total; i += maxSize) {
            chunks.push(items.slice(i, i + maxSize));
        }
        return chunks;
    }

    // Calculate optimal number of groups
    // We want to minimize the number of groups while keeping size <= maxSize
    // Min groups = Ceil(Total / MaxSize)
    let numGroups = Math.ceil(total / maxSize);

    // However, we also need to check if we can satisfy minSize with this many groups.
    // Average size = Total / NumGroups. If Average < MinSize, we might have a problem.
    // Actually, if Total < MinSize, we can't satisfy it anyway (1 group < Min).
    // If Total >= MinSize, can we always satisfy?
    // Example: Total=30, Max=25, Min=20.
    // NumGroups = Ceil(30/25) = 2.
    // Average = 15. 15 < 20. Violation unavoidable if we force 2 groups?
    // Wait, if we have 2 groups, sizes could be 20, 10 -> 10 is violation.
    // Or 15, 15 -> both violation.
    // If we use 1 group -> 30. 30 > 25 (Max violation).
    // So we have a trade-off: Max Size vs Min Size.
    // Usually Max Size is a hard constraint (physical capacity).
    // Min Size is a soft constraint (educational policy).
    // So we MUST respect Max Size (NumGroups >= Ceil(Total/Max)).

    // So we stick to NumGroups = Ceil(Total / MaxSize).
    // Exception: If Total is 0, handled above.

    if (numGroups === 0) numGroups = 1; // Should not happen if total > 0

    const chunks: string[][] = [];
    const baseSize = Math.floor(total / numGroups);
    const remainder = total % numGroups;

    let startIndex = 0;
    for (let i = 0; i < numGroups; i++) {
        // Distribute remainder to first few groups
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

    // ID Format: CODE_GROUP_SESSION (e.g. MAT1_1_1)
    const parts = inst.id.split('_');
    const groupNum = parts[1];
    // const sessionNum = parts[2]; // Not needed for display unless we want to show "Math (1반-1)"

    const displayName = `${name} (${groupNum}반)`;
    block.displayNames.push(displayName);

    // Calculate Class Movement Breakdown
    const movementMap = new Map<string, number>();
    inst.students.forEach(sid => {
        const s = students[sid];
        if (s && s.classNum) {
            const cls = s.classNum;
            movementMap.set(cls, (movementMap.get(cls) || 0) + 1);
        }
    });

    // Sort by class number (numeric if possible)
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
    // Count instances of the SAME subject code in this block
    const meta = metaMap.get(inst.code);
    if (!meta) return true; // No meta, no limit?

    const sameSubjectCount = block.subjects.filter(id => {
        const otherInst = allInstances.find(i => i.id === id);
        return otherInst && otherInst.code === inst.code;
    }).length;

    if (sameSubjectCount >= meta.teacherCount) {
        return false;
    }

    return true;
}
