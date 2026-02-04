import React, { useMemo, useRef, useState } from 'react';

export default function StackedBarChart({
  data = [],
  label = 'Chart',
  height = 220,
  yLabel = 'Count',
  showHeader = true,
  colors = { correct: '#22c55e', incorrect: '#ef4444' }
}) {
  const svgRef = useRef(null);
  const [hover, setHover] = useState(null);

  const points = useMemo(() => {
    const sorted = Array.isArray(data)
      ? data.filter(d => d.createdAt).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      : [];
    return sorted.map((d) => {
      const correct = Number(d.correct || 0);
      const incorrect = Number(d.incorrect || 0);
      const total = correct + incorrect;
      const dt = new Date(d.createdAt);
      return {
        correct,
        incorrect,
        total,
        label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        _fullLabel: dt.toLocaleString(),
        x: dt.getTime()
      };
    });
  }, [data]);

  const yRange = useMemo(() => {
    if (!points.length) return { min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10] };
    const maxVal = Math.max(...points.map(p => p.total));
    const max = Math.max(5, Math.ceil(maxVal + Math.max(1, maxVal * 0.08)));
    const step = max <= 10 ? 2 : max <= 30 ? 5 : 10;
    const ticks = [];
    for (let t = 0; t <= max; t += step) ticks.push(t);
    return { min: 0, max, ticks };
  }, [points]);

  const vw = 460;
  const vh = height;
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 44;

  const barAreaW = vw - padL - padR;
  const barW = points.length ? Math.max(8, Math.min(28, barAreaW / points.length - 6)) : 18;

  const xPositions = points.map((_, i) => {
    if (points.length === 1) return padL + barAreaW / 2;
    return padL + (i / Math.max(1, points.length - 1)) * barAreaW;
  });

  const scaleY = (v) => {
    if (yRange.max === yRange.min) return padT + (vh - padT - padB) / 2;
    return padT + (1 - (v - yRange.min) / (yRange.max - yRange.min)) * (vh - padT - padB);
  };

  const handleMove = (e) => {
    if (!svgRef.current || !points.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const clientXPositions = xPositions.map(x => (x / vw) * rect.width);
    let best = 0; let bestD = Infinity;
    clientXPositions.forEach((cx, i) => {
      const d = Math.abs(cx - mouseX);
      if (d < bestD) { bestD = d; best = i; }
    });
    const p = points[best];
    setHover({
      label: p._fullLabel,
      correct: p.correct,
      incorrect: p.incorrect,
      total: p.total,
      x: xPositions[best]
    });
  };

  const handleLeave = () => setHover(null);

  return (
    <div className="bg-gray-900 rounded p-3 border border-gray-700">
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-300">{label}</div>
          <div className="text-[11px] text-gray-400">{points.length ? `${points.length} sessions` : 'No data'}</div>
        </div>
      )}
      {points.length === 0 ? (
        <div className="text-xs text-gray-500">No data yet - complete a squat session to populate this chart.</div>
      ) : (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${vw} ${vh}`}
            className="w-full"
            style={{ height: `${height}px` }}
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
          >
            {yRange.ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={vw - padR} y1={scaleY(t)} y2={scaleY(t)} stroke="#E5E7EB" strokeWidth="0.9" />
                <text x={padL - 8} y={scaleY(t) + 4} fontSize="11" fill="#6B7280" textAnchor="end">{t}</text>
              </g>
            ))}
            {points.map((p, i) => {
              const x = xPositions[i];
              const yTotal = scaleY(p.total);
              const yCorrect = scaleY(p.correct);
              const barH = (vh - padB) - yTotal;
              const correctH = (vh - padB) - yCorrect;
              return (
                <g key={`${p.x}-${i}`}>
                  <rect x={x - barW / 2} y={yTotal} width={barW} height={barH} fill={colors.incorrect} opacity="0.85" />
                  <rect x={x - barW / 2} y={yCorrect} width={barW} height={correctH} fill={colors.correct} />
                </g>
              );
            })}
            {points.map((p, i) => (
              <g key={`tick-${p.x}-${i}`}>
                <line x1={xPositions[i]} x2={xPositions[i]} y1={vh - padB} y2={vh - padB + 6} stroke="#9CA3AF" strokeWidth="1" />
                <text x={xPositions[i]} y={vh - padB + 20} fontSize="11" fill="#9CA3AF" textAnchor="middle" transform={`translate(${xPositions[i]},${vh - padB + 20}) rotate(-35)`}>{p.label}</text>
              </g>
            ))}
            <text x={10} y={padT} fill="#9CA3AF" fontSize="11">{yLabel}</text>
            <text x={vw/2} y={vh - 4} fill="#9CA3AF" fontSize="11" textAnchor="middle">Date</text>
            {hover && (
              <g>
                <line x1={hover.x} x2={hover.x} y1={padT} y2={vh - padB} stroke="#9CA3AF" strokeDasharray="4 4" />
              </g>
            )}
          </svg>
          {hover && (
            <div className="absolute bg-gray-800 text-gray-100 text-xs px-3 py-2 rounded border border-gray-700 shadow" style={{ left: hover.x - 60, top: 10 }}>
              <div className="font-semibold">{hover.total} total</div>
              <div className="text-[11px] text-gray-300">Correct: {hover.correct}</div>
              <div className="text-[11px] text-gray-300">Incorrect: {hover.incorrect}</div>
              <div className="text-[11px] text-gray-400 mt-1">{hover.label}</div>
            </div>
          )}
          <div className="mt-2 text-[11px] text-gray-400 flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.correct }} />Correct</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: colors.incorrect }} />Incorrect</span>
          </div>
        </div>
      )}
    </div>
  );
}
