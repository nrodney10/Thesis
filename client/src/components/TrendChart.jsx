import React, { useState, useMemo, useRef } from 'react';

// Advanced interactive time-series chart with hover tooltip and date/time axis
export default function TrendChart({
  data = [],
  types = [],
  limit = 30,
  label = 'Trend',
  color = '#60a5fa',
  height = 220,
  yLabel = 'Score',
  showHeader = true,
  showFullLabel = false,
  tooltipLines = null
}) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const points = useMemo(() => {
    const filtered = Array.isArray(data) ? (types && types.length ? data.filter(r => types.includes((r.type || '').toLowerCase())) : data) : [];
    const sorted = filtered
      .filter(r => r.createdAt)
      .sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-limit);
    return sorted.map((r) => {
      const d = new Date(r.createdAt);
      const v = typeof r.score === 'number' ? r.score : (typeof r.value === 'number' ? r.value : Number(r.score) || 0);
      // Provide a date-only label for axis ticks; keep full datetime available in raw
      return {
        x: d.getTime(),
        y: v,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        raw: r,
        _fullLabel: d.toLocaleString()
      };
    });
  }, [data, types, limit]);

  const yRange = useMemo(() => {
    if (!points.length) return { min: 0, max: 100, ticks: [0,20,40,60,80,100] };
    const vals = points.map(p=>p.y);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) { min = Math.max(0, min - 10); max = max + 10; }
    const pad = Math.max(1, (max - min) * 0.08);
    min = Math.max(0, min - pad);
    max = max + pad;
    // force ticks every 10 units for clearer, consistent Y axis
    const step = 10;
    const minTick = Math.floor(min / step) * step;
    const maxTick = Math.ceil(max / step) * step;
    const ticks = [];
    for (let t = minTick; t <= maxTick; t += step) ticks.push(Math.round(t));
    return { min: minTick, max: maxTick, ticks };
  }, [points]);

  const vw = 460;
  const vh = height;
  const padL = 72;
  const padR = 16;
  const padT = 22;
  const padB = 44;

  // compute X positions by index to ensure even spacing and avoid timestamp clustering
  const xPositions = useMemo(() => points.map((p, i) => {
    if (points.length === 1) return padL + (vw - padL - padR) / 2;
    return padL + (i / Math.max(1, points.length - 1)) * (vw - padL - padR);
  }), [points, vw, padL, padR]);

  const scaleX = React.useCallback((vOrIndex) => {
    // if passed a timestamp, fall back to index-based mapping by finding index
    if (typeof vOrIndex === 'number' && points.length && points.some(p => p.x === vOrIndex)) {
      const idx = points.findIndex(p => p.x === vOrIndex);
      return xPositions[idx] ?? (padL + (vw - padL - padR) / 2);
    }
    // if passed an index
    if (typeof vOrIndex === 'number') return xPositions[vOrIndex] ?? (padL + (vw - padL - padR) / 2);
    return padL + (vw - padL - padR) / 2;
  }, [points, xPositions, vw, padL, padR]);
  const scaleY = (v) => {
    if (yRange.max === yRange.min) return padT + (vh - padT - padB) / 2;
    return padT + (1 - (v - yRange.min) / (yRange.max - yRange.min)) * (vh - padT - padB);
  };

  const handleMove = (e) => {
    if (!svgRef.current || !points.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Precompute client-space positions for each point to compare directly with mouse
    const clientPositions = points.map((p, i) => {
      const svgX = xPositions[i];
      const svgY = scaleY(p.y);
      const clientX = (svgX / vw) * rect.width;
      const clientY = (svgY / vh) * rect.height;
      return { svgX, svgY, clientX, clientY };
    });

    // find nearest point in client pixels using Euclidean distance
    let best = 0; let bestD = Infinity;
    clientPositions.forEach((pos, i) => {
      const dx = pos.clientX - mouseX;
      const dy = pos.clientY - mouseY;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = i; }
    });

    const p = points[best];
    const chosen = clientPositions[best];
    setHover({
      svgX: chosen.svgX,
      svgY: chosen.svgY,
      clientX: chosen.clientX,
      clientY: chosen.clientY,
      label: p.label,
      fullLabel: p._fullLabel,
      value: Math.round(p.y * 10) / 10,
      raw: p.raw
    });
  };

  const handleLeave = () => setHover(null);

  const xTicks = useMemo(() => {
    if (!points.length) return [];
    const arrIdx = [0, Math.floor(points.length/2), points.length - 1];
    return arrIdx.map((idx) => ({
      x: xPositions[idx] ?? scaleX(idx),
      label: points[idx].label,
      key: `${points[idx].x}-${idx}`
    }));
  }, [points, xPositions, scaleX]);

  const polyPoints = points.map((p,i) => `${xPositions[i]},${scaleY(p.y)}`).join(' ');

  return (
    <div className="bg-gray-900 rounded p-3 border border-gray-700">
      {showHeader && (
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-300">{label}</div>
          <div className="text-[11px] text-gray-400">{points.length ? `${points.length} pts` : 'No data'}</div>
        </div>
      )}
      {points.length === 0 ? (
        <div className="text-xs text-gray-500">No data yet — complete an activity to populate this chart.</div>
      ) : (
        <div className="relative">
          <svg ref={svgRef} viewBox={`0 0 ${vw} ${vh}`} className="w-full" style={{ height: `${height}px` }} onMouseMove={handleMove} onMouseLeave={handleLeave}>
            {/* Grid + axes */}
            {yRange.ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={vw - padR} y1={scaleY(t)} y2={scaleY(t)} stroke="#E5E7EB" strokeWidth="0.9" />
                <text x={padL - 12} y={scaleY(t) + 4} fontSize="13" fill="#6B7280" textAnchor="end">{t}</text>
              </g>
            ))}
            {/* x ticks */}
            {xTicks.map((t, idx)=> (
              <g key={t.key}>
                <line x1={t.x} x2={t.x} y1={vh - padB} y2={vh - padB + 6} stroke="#9CA3AF" strokeWidth="1" />
                <text x={t.x} y={vh - padB + 20} fontSize="11" fill="#9CA3AF" textAnchor="middle" transform={`translate(${t.x},${vh - padB + 20}) rotate(-35)`}>{t.label}</text>
              </g>
            ))}
            {/* Area */}
            <polygon points={`${polyPoints} ${scaleX(points[points.length-1].x)},${vh-padB} ${scaleX(points[0].x)},${vh-padB}`} fill={color} opacity="0.16" />
            {/* Line: outer + inner for crisper look */}
            <polyline points={polyPoints} fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" opacity={0.92} />
            <polyline points={polyPoints} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity={0.98} />
            {/* Dots */}
            {points.map((p,i)=> (
              <circle key={i} cx={xPositions[i]} cy={scaleY(p.y)} r="3.2" fill={color} stroke="#111827" strokeWidth="1.6" />
            ))}
            {/* Hover */}
            {hover && (
              <g>
                <line x1={hover.svgX} x2={hover.svgX} y1={padT} y2={vh - padB} stroke="#9CA3AF" strokeDasharray="4 4" />
                <circle cx={hover.svgX} cy={hover.svgY} r="5" fill={color} stroke="#ffffff" strokeWidth="1.6" />
              </g>
            )}
            {/* Axis labels */}
            <text x={10} y={padT} fill="#9CA3AF" fontSize="11">{yLabel}</text>
            <text x={vw/2} y={vh - 4} fill="#9CA3AF" fontSize="11" textAnchor="middle">Date</text>
          </svg>
          {hover && (
            <div className="absolute bg-gray-800 text-gray-100 text-xs px-3 py-2 rounded border border-gray-700 shadow" style={{ left: hover.clientX - 60, top: hover.clientY - 70 }}>
              {Array.isArray(tooltipLines) ? (
                tooltipLines.map((line, idx) => <div key={idx} className={idx === 0 ? "font-semibold" : "text-[11px] text-gray-300"}>{line}</div>)
              ) : (typeof tooltipLines === 'function') ? (
                tooltipLines(hover.raw, hover.value).map((line, idx) => <div key={idx} className={idx === 0 ? "font-semibold" : "text-[11px] text-gray-300"}>{line}</div>)
              ) : (
                <>
                  <div className="font-semibold">{hover.value}</div>
                  <div className="text-[11px] text-gray-300">{showFullLabel ? hover.fullLabel : hover.label}</div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
