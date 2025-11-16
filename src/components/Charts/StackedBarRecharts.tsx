import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { colorFor } from '../../utils/charts';
import type { ChartPoint } from '../../utils/charts';
import type { Group } from '../../state/types';

export function StackedBarRecharts({ points, group }: { points: ChartPoint[]; group: Group }) {
  return (
    <div style={{ width: '100%', height: 260, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points}>
          <XAxis dataKey="class" />
          <YAxis />
          <Tooltip />
          {group.options.map(opt => (
            <Bar key={opt} dataKey={opt} stackId="g1" fill={colorFor(opt)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


