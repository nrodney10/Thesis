import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function FitbitDiagnostics() {
  const { authFetch } = useAuth();
  const [debugResult, setDebugResult] = useState(null);
  const [refreshResult, setRefreshResult] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [rawResult, setRawResult] = useState(null);
  const [lastAvailableResult, setLastAvailableResult] = useState(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [loadingRefresh, setLoadingRefresh] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const runDebug = async () => {
    setLoadingDebug(true);
    setDebugResult(null);
    try {
      const r = await authFetch('http://localhost:5000/api/fitbit/me/debug');
      const j = await r.json();
      setDebugResult(j);
    } catch (e) { setDebugResult({ error: e.message }); }
    setLoadingDebug(false);
  };

  const fetchLatest = async () => {
    setLoadingLatest(true);
    setLatestResult(null);
    try {
      const r = await authFetch('http://localhost:5000/api/fitbit/me/heart-rate/latest');
      const j = await r.json();
      setLatestResult({ status: r.status, body: j });
    } catch (e) { setLatestResult({ error: e.message }); }
    setLoadingLatest(false);
  };

  const fetchRaw = async () => {
    setLoadingLatest(true);
    setRawResult(null);
    try {
      const r = await authFetch('http://localhost:5000/api/fitbit/me/heart-rate/raw');
      const j = await r.json();
      setRawResult({ status: r.status, body: j });
    } catch (e) { setRawResult({ error: e.message }); }
    setLoadingLatest(false);
  };

  const fetchLastAvailable = async () => {
    setLoadingLatest(true);
    setLastAvailableResult(null);
    try {
      const r = await authFetch('http://localhost:5000/api/fitbit/me/heart-rate/last-available');
      const j = await r.json();
      setLastAvailableResult({ status: r.status, body: j });
    } catch (e) { setLastAvailableResult({ error: e.message }); }
    setLoadingLatest(false);
  };

  const runRefresh = async () => {
    setLoadingRefresh(true);
    setRefreshResult(null);
    try {
      const r = await authFetch('http://localhost:5000/api/fitbit/me/force-refresh');
      const j = await r.json();
      setRefreshResult(j);
    } catch (e) { setRefreshResult({ error: e.message }); }
    setLoadingRefresh(false);
  };

  const doDisconnect = async () => {
    if (!window.confirm('Disconnect Fitbit for this account?')) return;
    setDisconnecting(true);
    try {
      const r = await authFetch('http://localhost:5000/api/fitbit/me/disconnect', { method: 'POST' });
      const j = await r.json();
      alert(j.message || 'Disconnected');
      setDebugResult(null);
      setRefreshResult(null);
    } catch (e) {
      alert('Error disconnecting: ' + (e.message||e));
    }
    setDisconnecting(false);
  };

  const openReconnect = () => {
    // open reset-and-connect in new window using auth token from storage handled by authFetch
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const url = `http://localhost:5000/api/fitbit/reset-and-connect?token=${encodeURIComponent(token)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="mt-4 bg-gray-800 rounded p-4 shadow">
      <h4 className="text-sm text-gray-200 mb-2">Fitbit Diagnostics</h4>
      <div className="flex gap-2 mb-2">
        <button onClick={runDebug} className="px-3 py-1 bg-indigo-600 rounded text-sm disabled:opacity-50" disabled={loadingDebug}>{loadingDebug ? 'Checking…' : 'Run Debug'}</button>
        <button onClick={runRefresh} className="px-3 py-1 bg-green-600 rounded text-sm" disabled={loadingRefresh}>{loadingRefresh ? 'Refreshing…' : 'Force Refresh'}</button>
        <button onClick={openReconnect} className="px-3 py-1 bg-indigo-400 rounded text-sm">Reconnect</button>
        <button onClick={doDisconnect} className="px-3 py-1 bg-red-600 rounded text-sm" disabled={disconnecting}>{disconnecting ? 'Disconnecting…' : 'Disconnect'}</button>
        <button onClick={fetchLatest} className="px-3 py-1 bg-gray-600 rounded text-sm" disabled={loadingLatest}>{loadingLatest ? 'Loading…' : 'Get Latest HR'}</button>
        <button onClick={fetchRaw} className="px-3 py-1 bg-gray-600 rounded text-sm" disabled={loadingLatest}>{loadingLatest ? 'Loading…' : 'Get Raw HR'}</button>
        <button onClick={fetchLastAvailable} className="px-3 py-1 bg-gray-600 rounded text-sm" disabled={loadingLatest}>{loadingLatest ? 'Loading…' : 'Get Last Available'}</button>
      </div>

      <div className="text-xs text-gray-300">
        <div className="mb-2">
          <strong>Debug:</strong>
          <pre className="bg-gray-900 p-2 rounded mt-1">{debugResult ? JSON.stringify(debugResult, null, 2) : <span className="text-gray-500">No result</span>}</pre>
        </div>
        <div>
          <strong>Refresh:</strong>
          <pre className="bg-gray-900 p-2 rounded mt-1">{refreshResult ? JSON.stringify(refreshResult, null, 2) : <span className="text-gray-500">No result</span>}</pre>
        </div>
        <div className="mt-2">
          <strong>Latest HR:</strong>
          <pre className="bg-gray-900 p-2 rounded mt-1">{latestResult ? JSON.stringify(latestResult, null, 2) : <span className="text-gray-500">No result</span>}</pre>
        </div>
        <div className="mt-2">
          <strong>Raw HR:</strong>
          <pre className="bg-gray-900 p-2 rounded mt-1">{rawResult ? JSON.stringify(rawResult, null, 2) : <span className="text-gray-500">No result</span>}</pre>
        </div>
        <div className="mt-2">
          <strong>Last Available:</strong>
          <pre className="bg-gray-900 p-2 rounded mt-1">{lastAvailableResult ? JSON.stringify(lastAvailableResult, null, 2) : <span className="text-gray-500">No result</span>}</pre>
        </div>
      </div>
    </div>
  );
}
