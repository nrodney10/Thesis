import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Reports() {
  const { authFetch } = useAuth();
  const [downloading, setDownloading] = useState(false);

  const exportCsv = async () => {
    setDownloading(true);
    try {
      const r = await authFetch('http://localhost:5000/api/reports/export.csv');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'results-export.csv'; a.click();
      URL.revokeObjectURL(url);
    } finally { setDownloading(false); }
  };

  return (
    <main className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow">
        <h1 className="text-2xl font-bold mb-4">Reports</h1>
        <p className="text-gray-300 mb-3">Download your exercise results as CSV for further analysis or sharing.</p>
        <button onClick={exportCsv} disabled={downloading} className="bg-indigo-600 px-3 py-2 rounded disabled:opacity-50">{downloading? 'Preparing…':'Export CSV'}</button>
      </div>
    </main>
  );
}
