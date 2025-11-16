import { useDroppable } from '@dnd-kit/core';
import type { Student } from '../../state/types';
import { StudentCard } from './StudentCard';

export function Column(props: { id: string; title: string; students: Student[]; warn?: 'over' | 'under'; visibleCount?: number; hiddenCount?: number }) {
	const { setNodeRef, isOver } = useDroppable({ id: props.id });
	const borderColor = props.warn === 'over' ? 'var(--danger)' : props.warn === 'under' ? 'var(--warn)' : 'var(--border)';
	return (
		<div ref={setNodeRef} className="panel" style={{ border: `2px solid ${isOver ? 'var(--primary)' : borderColor}`, minHeight: 300 }}>
			<div style={{ fontWeight: 600, marginBottom: 4 }}>{props.title}</div>
			{(props.visibleCount !== undefined || props.hiddenCount !== undefined) && (
				<div style={{ fontSize: 12, marginBottom: 6 }} className="muted">
					보임 {props.visibleCount ?? props.students.length} / 숨김 {props.hiddenCount ?? 0}
				</div>
			)}
			<div className="stack" style={{ gap: 6 }}>
				{props.students.map(s => (
					<StudentCard key={s.id} student={s} />
				))}
			</div>
		</div>
	);
}


