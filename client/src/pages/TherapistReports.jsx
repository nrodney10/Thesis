import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function TherapistReports(){
  const { authFetch } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(()=>{ const load= async()=>{ setLoading(true); try { const r= await authFetch('http://localhost:5000/api/reports/summary'); const j= await r.json(); if (j.success) setRows(j.patients||[]);} finally { setLoading(false);} }; load(); },[authFetch]);

  return (
    <main className='min-h-screen p-8 bg-gray-900 text-gray-100'>
      <div className='max-w-4xl mx-auto bg-gray-800 p-6 rounded shadow'>
        <h1 className='text-2xl font-bold mb-4'>Patient Summary</h1>
        {loading ? <div>Loading...</div> : (
          <table className='w-full text-sm'>
            <thead><tr className='text-left text-gray-300'><th className='py-2'>Patient ID</th><th>Results</th><th>Avg Score</th></tr></thead>
            <tbody>
              {rows.map(r=> <tr key={r.userId}><td className='py-2'>{r.userId}</td><td>{r.count}</td><td>{r.avgScore}</td></tr>)}
              {rows.length===0 && <tr><td colSpan='3' className='py-3 text-gray-400'>No data</td></tr>}
            </tbody>
          </table>
        )}
        <div className='mt-4'>
          <a href='http://localhost:5000/api/reports/export.csv' className='bg-indigo-600 px-3 py-2 rounded inline-block'>Export CSV</a>
        </div>
      </div>
    </main>
  );
}
