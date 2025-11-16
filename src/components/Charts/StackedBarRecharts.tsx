import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colorFor } from '../../utils/charts';
import type { ChartPoint } from '../../utils/charts';
import type { Group } from '../../state/types';

export function StackedBarRecharts({ points, group }: { points: ChartPoint[]; group: Group }) {
  const options = Array.from(new Set(group.options.map(o => o.trim()).filter(Boolean)));
  return (
    <div style={{ width: '100%', height: 260, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points}>
          <XAxis dataKey="class" />
          <YAxis />
          <Tooltip />
          <Legend />
          {options.map(opt => (
            <Bar key={opt} dataKey={opt} stackId="g1" fill={colorFor(opt)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


