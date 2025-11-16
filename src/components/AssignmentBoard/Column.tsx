import { useDroppable } from '@dnd-kit/core';
import type { Student } from '../../state/types';
import { StudentCard } from './StudentCard';

export function Column(props: { id: string; title: string; students: Student[]; warn?: 'over' | 'under'; visibleCount?: number; hiddenCount?: number }) {
	const { setNodeRef, isOver } = useDroppable({ id: props.id });
	const borderColor = props.warn === 'over' ? '#d32f2f' : props.warn === 'under' ? '#ed6c02' : '#ddd';
	return (
		<div ref={setNodeRef} style={{ border: `2px solid ${isOver ? '#1976d2' : borderColor}`, borderRadius: 6, padding: 8, minHeight: 300 }}>
			<div style={{ fontWeight: 600, marginBottom: 4 }}>{props.title}</div>
			{(props.visibleCount !== undefined || props.hiddenCount !== undefined) && (
				<div style={{ fontSize: 12, color: '#555', marginBottom: 6 }}>
					보임 {props.visibleCount ?? props.students.length} / 숨김 {props.hiddenCount ?? 0}
				</div>
			)}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{props.students.map(s => (
					<StudentCard key={s.id} student={s} />
				))}
			</div>
		</div>
	);
}


