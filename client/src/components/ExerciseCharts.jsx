import React, { useMemo, useState } from 'react';
import TrendChart from './TrendChart';
import StackedBarChart from './StackedBarChart';

const detectPoseType = (r) => {
  const meta = r?.metadata || {};
  const explicit = meta.poseType || meta.poseMetrics?.poseType;
  if (explicit) return String(explicit).toLowerCase();
  const title = meta.exerciseTitle || r.title || r.exerciseTitle || '';
  if (/t-?pose/i.test(title)) return 'tpose';
  if (/squat/i.test(title)) return 'squat';
  const id = r.exerciseId || '';
  if (/t-?pose/i.test(id)) return 'tpose';
  if (/squat/i.test(id)) return 'squat';
  return null;
};

export default function ExerciseCharts({ results = [], compact = false, showDateFilter = true }) {
  const [selectedDate, setSelectedDate] = useState('');

  const dateKey = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const physical = useMemo(() => {
    return (results || []).filter((r) => {
      const t = (r.type || '').toLowerCase();
      return t === 'physical' || t === 'exercise';
    });
  }, [results]);

  const tposeSessions = useMemo(() => physical.filter(r => detectPoseType(r) === 'tpose'), [physical]);
  const squatSessions = useMemo(() => physical.filter(r => detectPoseType(r) === 'squat'), [physical]);

  const tposeCountForDate = useMemo(() => {
    if (!selectedDate) return null;
    return tposeSessions.filter((r) => {
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      return dateKey(d) === selectedDate;
    }).length;
  }, [selectedDate, tposeSessions]);

  const squatCountForDate = useMemo(() => {
    if (!selectedDate) return null;
    return squatSessions.filter((r) => {
      if (!r.createdAt) return false;
      const d = new Date(r.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      return dateKey(d) === selectedDate;
    }).length;
  }, [selectedDate, squatSessions]);

  const tposeTime = useMemo(() => tposeSessions.map(r => ({
    createdAt: r.createdAt,
    value: Math.round(((r.metadata?.poseMetrics?.timeInTargetMs || 0) / 1000) * 10) / 10,
    outOfRange: r.metadata?.poseMetrics?.outOfRangeCount || 0
  })), [tposeSessions]);

  const tposeOut = useMemo(() => tposeTime.map(r => ({
    createdAt: r.createdAt,
    value: r.outOfRange || 0,
    timeInPose: r.value || 0
  })), [tposeTime]);

  const squatData = useMemo(() => squatSessions.map(r => ({
    createdAt: r.createdAt,
    correct: r.metadata?.poseMetrics?.correctReps ?? 0,
    incorrect: r.metadata?.poseMetrics?.incorrectReps ?? 0
  })), [squatSessions]);

  const chartHeight = compact ? 220 : 280;

  return (
    <div className="space-y-4">
      {showDateFilter && (
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {selectedDate ? `Showing ${selectedDate}` : 'All days / All sessions'}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-300">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-gray-700 text-xs text-gray-100 px-2 py-1 rounded"
            />
            {selectedDate && (
              <button
                onClick={() => setSelectedDate('')}
                className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-200"
              >
                All
              </button>
            )}
          </div>
        </div>
      )}
      <div className="bg-gray-800 rounded p-4 shadow">
        <div className="text-sm text-gray-200 font-semibold mb-2">T-Pose Progress</div>
        {selectedDate && tposeCountForDate === 0 && (
          <div className="text-xs text-gray-400 mb-2">No T-pose sessions on {selectedDate}.</div>
        )}
        <div className="space-y-3">
          <TrendChart
            label="Time in correct pose (seconds)"
            color="#3b82f6"
            data={tposeTime}
            types={[]}
            limit={200}
            height={chartHeight}
            yLabel="Seconds"
            showHeader={true}
            showFullLabel={true}
            tooltipLines={(raw, value) => ([
              `Time in pose: ${value}s`,
              `Out of range: ${raw?.outOfRange ?? 0}`,
              raw?.createdAt ? new Date(raw.createdAt).toLocaleString() : ''
            ].filter(Boolean))}
          />
          <TrendChart
            label="Times left correct pose"
            color="#ef4444"
            data={tposeOut}
            types={[]}
            limit={200}
            height={compact ? 200 : 240}
            yLabel="Count"
            showHeader={true}
            showFullLabel={true}
            tooltipLines={(raw, value) => ([
              `Out of range: ${value}`,
              `Time in pose: ${raw?.timeInPose ?? 0}s`,
              raw?.createdAt ? new Date(raw.createdAt).toLocaleString() : ''
            ].filter(Boolean))}
          />
        </div>
      </div>

      <div className="bg-gray-800 rounded p-4 shadow">
        <div className="text-sm text-gray-200 font-semibold mb-2">Squat Progress</div>
        {selectedDate && squatCountForDate === 0 && (
          <div className="text-xs text-gray-400 mb-2">No squat sessions on {selectedDate}.</div>
        )}
        <StackedBarChart
          label="Correct vs Incorrect squats"
          data={squatData}
          height={chartHeight}
          yLabel="Squats"
          showHeader={true}
        />
      </div>
    </div>
  );
}
