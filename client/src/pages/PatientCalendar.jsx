import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function PatientCalendar() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = `?month=${month + 1}&year=${year}`;
      const res = await authFetch(`http://localhost:5000/api/calendar/patient${query}`);
      const data = await res.json();
      if (data.success) setItems(data.items || []);
    } catch (e) {
      console.error('calendar load', e);
    }
    setLoading(false);
  }, [authFetch, month, year]);

  useEffect(() => { load(); }, [load]);

  const monthItems = useMemo(() => {
    return items.filter((it) => {
      if (!it.dueAt) return false;
      const d = new Date(it.dueAt);
      if (Number.isNaN(d.getTime())) return false;
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [items, month, year]);

  const grouped = useMemo(() => {
    const map = {};
    monthItems.forEach(it => {
      const d = new Date(it.dueAt);
      const k = d.toDateString();
      if (!map[k]) map[k] = [];
      map[k].push(it);
    });
    return map;
  }, [monthItems]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <main className="min-h-screen p-6 bg-gray-900 text-gray-100">
      <div className="max-w-5xl mx-auto bg-gray-800 p-6 rounded shadow">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">My Calendar</h1>
          <button onClick={load} className="px-3 py-2 bg-indigo-600 rounded text-sm">Refresh</button>
        </div>
        <p className="text-gray-300 mb-4">Upcoming exercises and reminders.</p>

        <div className="flex items-center gap-3 mb-3">
          <select value={month} onChange={(e)=>setMonth(Number(e.target.value))} className="bg-gray-700 p-2 rounded">
            {Array.from({length:12}).map((_,i)=><option value={i} key={i}>{new Date(2000,i,1).toLocaleString('default',{month:'long'})}</option>)}
          </select>
          <select value={year} onChange={(e)=>setYear(Number(e.target.value))} className="bg-gray-700 p-2 rounded">
            {Array.from({length:5}).map((_,i)=> {
              const y = new Date().getFullYear() - 2 + i;
              return <option value={y} key={y}>{y}</option>;
            })}
          </select>
          <div className="text-sm text-gray-300">{monthLabel}</div>
        </div>

        <div className="grid grid-cols-7 gap-2 bg-gray-900 p-3 rounded mb-6">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d)=>(
            <div key={d} className="text-xs text-gray-400 text-center uppercase tracking-wide">{d}</div>
          ))}
          {cells.map((c, idx) => {
            if (!c) return <div key={idx} />;
            const k = c.toDateString();
            const has = grouped[k]?.length;
            return (
              <div key={idx} className={`rounded-lg p-2 h-20 border ${has ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-gray-700 bg-gray-800 text-gray-200'}`}>
                <div className="text-right text-sm font-semibold">{c.getDate()}</div>
                {has ? <div className="text-xs">{has} item{has>1?'s':''}</div> : null}
              </div>
            );
          })}
        </div>

        <h2 className="text-lg font-semibold mb-2">Upcoming list</h2>
        {loading ? <div className="text-gray-300">Loading...</div> : (
          <ul className="space-y-2">
            {monthItems.length === 0 && <li className="text-gray-400 text-sm">No items for this month.</li>}
            {monthItems
              .slice()
              .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
              .map((it) => (
              <li key={it.id} className="p-3 rounded bg-gray-900 flex justify-between items-center">
                <div>
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-gray-400">{it.dueAt ? new Date(it.dueAt).toLocaleString() : 'No due date'} {it.dailyReminder ? '• Daily reminder' : ''}</div>
                  {it.description && <div className="text-xs text-gray-300 mt-1">{it.description}</div>}
                </div>
                <div className="text-xs text-gray-400">Type: {it.type}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
