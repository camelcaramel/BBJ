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
    option: ScheduleOption
): ScheduleResult {

    // 1. Group Students by Subject
    const subjectGroups = new Map<string, string[]>(); // code -> studentIds[]
    const metaMap = new Map(subjectMetas.map(m => [m.code, m]));

    Object.values(students).forEach(s => {
        s.selectedSubjects.forEach(code => {
            if (!subjectGroups.has(code)) subjectGroups.set(code, []);
            subjectGroups.get(code)!.push(s.id);
        });
    });

    // 2. Create Subject Instances (Splitting)
    const instances: SubjectInstance[] = [];
    const instanceMap = new Map<string, { code: string, students: string[] }>();

    subjectGroups.forEach((studentIds, code) => {
        // Simple splitting: Chunk students by DEFAULT_MOVING_CLASS_SIZE
        // Optimization: We could try to keep students from same Admin Class together?
        // For now, just chunk them.
        const chunkSize = DEFAULT_MOVING_CLASS_SIZE;
        for (let i = 0; i < studentIds.length; i += chunkSize) {
            const chunk = studentIds.slice(i, i + chunkSize);
            const instanceId = `${code}_${Math.floor(i / chunkSize) + 1}`;

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

    // 3. Build Conflict Graph for Instances
    // Two instances conflict if:
    // A) They share a student (Impossible by definition of splitting above, unless student takes same subject twice? No.)
    // B) They are instances of DIFFERENT subjects, and a student takes BOTH subjects.

    // Pre-compute student -> instances map
    const studentInstances = new Map<string, string[]>();
    instances.forEach(inst => {
        inst.students.forEach(sid => {
            if (!studentInstances.has(sid)) studentInstances.set(sid, []);
            studentInstances.get(sid)!.push(inst.id);
        });
    });

    // Build edges
    studentInstances.forEach((instIds) => {
        for (let i = 0; i < instIds.length; i++) {
            for (let j = i + 1; j < instIds.length; j++) {
                const idA = instIds[i];
                const idB = instIds[j];

                // Find objects
                const instA = instances.find(x => x.id === idA)!;
                const instB = instances.find(x => x.id === idB)!;

                if (!instA.conflicts.has(idB)) {
                    instA.conflicts.add(idB);
                    instA.degree++;
                }
                if (!instB.conflicts.has(idA)) {
                    instB.conflicts.add(idA);
                    instB.degree++;
                }
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
        // Same Min-Space logic: Find Min Blocks first, then spread.
        const minResult = calculateMovingClasses(classes, students, subjectMetas, 'min-blocks');
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
        warnings: [],
        instanceMap
    };
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
    const displayName = `${name} (${inst.id.split('_')[1]}반)`;
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
