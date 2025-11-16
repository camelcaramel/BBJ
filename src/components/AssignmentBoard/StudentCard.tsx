import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import type { Student } from '../../state/types';
import { useAppStore } from '../../state/store';

export function StudentCard({ student }: { student: Student }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: student.id
  });
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const selectedIds = useAppStore(s => s.selectedIds);
  const toggleSelect = useAppStore(s => s.toggleSelect);
  const isSelected = selectedIds.includes(student.id);
  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : 1,
    border: `1px solid ${isSelected ? '#1976d2' : '#ddd'}`,
    borderRadius: 6,
    padding: 8,
    background: isSelected ? '#e3f2fd' : '#fff',
    position: 'relative' as const
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={e => setPos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY })}
      {...listeners}
      {...attributes}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={isSelected}
          onClick={e => e.stopPropagation()}
          onChange={() => toggleSelect(student.id)}
        />
        <div style={{ fontWeight: 600, flex: 1 }}>
          {student.studentNo} - {student.name}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#555' }}>{student.selectedSubjects.slice(0, 3).join(', ')}{student.selectedSubjects.length > 3 ? ' ...' : ''}</div>
      {hover && student.selectedSubjects.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(pos.x + 12, 240),
            top: pos.y + 12,
            zIndex: 10,
            background: '#222',
            color: '#fff',
            borderRadius: 6,
            padding: '8px 10px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
            maxWidth: 260,
            pointerEvents: 'none',
            fontSize: 12,
            lineHeight: 1.5
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>선택 과목</div>
          <div>{student.selectedSubjects.join(', ')}</div>
        </div>
      )}
    </div>
  );
}


