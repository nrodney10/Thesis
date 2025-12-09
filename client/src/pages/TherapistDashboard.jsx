import React, { useEffect, useState } from "react";
import { Link } from 'react-router-dom';
import { useAuth } from "../context/AuthContext";
import UnreadBadge from "../components/UnreadBadge";

export default function TherapistDashboard() {
  const { user, authFetch, logout, notificationsUnread, messagesUnread } = useAuth();
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [recentResults, setRecentResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [schedule, setSchedule] = useState([]);

  // Mock data used until API endpoints are added
  useEffect(() => {
    // load patients from API
    const load = async () => {
      try {
        const res = await authFetch("http://localhost:5000/api/patients");
        const data = await res.json();
        if (data.success) {
          setPatients(data.patients || []);
          if (data.patients && data.patients.length) {
            setSelectedPatient(data.patients[0]);
            fetchPatientResults(data.patients[0]._id);
          }
        }
      } catch (err) {
        console.error("Failed to load patients", err);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Placeholder for fetching real patients via API
  const fetchPatients = async () => {
    try {
      const res = await authFetch("http://localhost:5000/api/patients");
      const data = await res.json();
      if (data.success) {
        setPatients(data.patients || []);
        buildSchedule(data.patients || []);
      }
    } catch (err) {
      console.error("Failed to fetch patients", err);
    }
  };

  const fetchPatientResults = async (patientId) => {
    setLoadingResults(true);
    try {
      const res = await authFetch(`http://localhost:5000/api/results?userId=${patientId}`);
      const data = await res.json();
      if (data.success) setRecentResults(data.results || []);
    } catch (err) {
      console.error("Failed to fetch patient results", err);
    }
    setLoadingResults(false);
  };

  // Example action: assign exercise (placeholder)
  const assignExercise = (patientId) => {
    alert(`Assigning exercise to ${patientId} (placeholder)`);
  };

  // Build a simple schedule view from actual patient names
  useEffect(() => {
    buildSchedule(patients);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients]);

  const buildSchedule = (list) => {
    if (!Array.isArray(list)) return setSchedule([]);
    const start = new Date();
    start.setHours(10, 0, 0, 0); // 10:00 start
    const slots = [];
    const labels = ['Tele-session', 'Review', 'Check-in'];
    list.slice(0, 6).forEach((p, i) => {
      const t = new Date(start.getTime() + i * 45 * 60000); // 45-min increments
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      slots.push({ time: `${hh}:${mm}`, name: p.name || 'Patient', note: labels[i % labels.length] });
    });
    setSchedule(slots);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto p-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="col-span-2 bg-gray-800 rounded-lg p-4 shadow-inner">
            <div className="mb-6 text-center">
              <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-purple-600 to-indigo-500 flex items-center justify-center text-xl font-bold">TR</div>
              <div className="mt-3 text-sm">{user?.name || 'Therapist'}</div>
              <div className="text-xs text-gray-400">Logged in</div>
            </div>
            <nav className="space-y-2 text-sm">
              <button className="w-full text-left px-3 py-2 rounded bg-gradient-to-r from-indigo-700 to-purple-600">Dashboard</button>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/games">Games</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/exercises">Exercises</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/reports">Patient Reports</Link>
              <Link className="block px-3 py-2 rounded hover:bg-gray-700" to="/therapist/reports">Summary</Link>
              <Link className="flex items-center px-3 py-2 rounded hover:bg-gray-700" to="/therapist/notifications">
                <span>Notify Patients</span>
                <UnreadBadge count={notificationsUnread} />
              </Link>
              <Link className="flex items-center px-3 py-2 rounded hover:bg-gray-700" to="/messages">
                <span>Messages</span>
                <UnreadBadge count={messagesUnread} />
              </Link>
              <div className="mt-4 text-xs text-gray-400 px-2">Patients</div>
              <div className="max-h-48 overflow-auto mt-2">
                {patients.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => { setSelectedPatient(p); fetchPatientResults(p._id); }}
                    className={`cursor-pointer p-2 rounded mb-2 ${selectedPatient?._id === p._id ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
                  >
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-gray-400">Age: {p.age}</div>
                  </div>
                ))}
              </div>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 mt-3" onClick={() => fetchPatients()}>Refresh</button>
              <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-700 text-red-300 mt-4" onClick={logout}>Logout</button>
            </nav>
          </aside>

          {/* Main area */}
          <main className="col-span-7">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">Dashboard</h2>
              <div className="flex items-center gap-3">
                <input className="px-3 py-2 rounded bg-gray-800 text-sm" placeholder="Search patients..." />
                <button className="px-3 py-2 bg-indigo-600 rounded text-sm">New Patient</button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="col-span-1 bg-gradient-to-br from-indigo-700 to-purple-600 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-200">Active Patients</div>
                <div className="text-2xl font-bold mt-2">{patients.length}</div>
              </div>
              <div className="col-span-1 bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-400">Avg Cognitive Score (30d)</div>
                <div className="text-2xl font-bold mt-2">72%</div>
              </div>
              <div className="col-span-1 bg-gray-800 rounded-lg p-4 shadow">
                <div className="text-xs text-gray-400">Avg Physical Score (30d)</div>
                <div className="text-2xl font-bold mt-2">78%</div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-4 shadow">
              <h3 className="text-lg font-medium mb-2">Engagement (last 7 days)</h3>
              {loadingResults ? (
                <div className="w-full h-36 flex items-center justify-center">Loading...</div>
              ) : (
                // small sparkline built from recentResults
                <svg className="w-full h-36" viewBox="0 0 100 36" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth="1.5"
                    points={recentResults.slice(0, 20).map((r, i) => {
                      const x = (i / Math.max(1, recentResults.length - 1)) * 100;
                      const y = 36 - Math.min(36, (r.score / 100) * 36);
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                </svg>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4 shadow">
              <h3 className="text-lg font-medium mb-2">Recent activity</h3>
              <ul className="space-y-3">
                {recentResults.map((r) => (
                  <li key={r._id} className="flex items-center justify-between bg-gray-900 p-3 rounded">
                    <div>
                      <div className="text-sm font-semibold">{patients.find(p=>p.id===r.userId)?.name || r.userId}</div>
                      <div className="text-xs text-gray-400">{r.type} • {new Date(r.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold">{r.score}</div>
                      <div className="text-xs text-green-300">{r.score>75? 'Good':'Needs review'}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </main>

          {/* Right column */}
          <aside className="col-span-3">
            <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-lg p-4 mb-4 shadow">
              <h4 className="text-sm text-gray-300">Selected patient</h4>
              {selectedPatient ? (
                <div className="mt-3">
                  <div className="text-lg font-bold">{selectedPatient.name}</div>
                  <div className="text-xs text-gray-400">Age: {selectedPatient.age}</div>
                  <div className="text-xs text-gray-400">Last active: {selectedPatient.lastActive}</div>

                  <div className="mt-4 flex gap-2">
                    <button onClick={() => assignExercise(selectedPatient.id)} className="px-3 py-2 bg-indigo-600 rounded">Assign Exercise</button>
                    <button onClick={() => fetchPatientResults(selectedPatient._id)} className="px-3 py-2 bg-gray-600 rounded">View Results</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-gray-400">No patient selected</div>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg p-4 mb-4 shadow">
              <h4 className="text-sm text-gray-300">Schedule</h4>
              <ul className="mt-3 text-sm text-gray-200 space-y-2">
                {schedule.length === 0 ? (
                  <li className="text-gray-400">No patients yet.</li>
                ) : (
                  schedule.map((s, idx) => (
                    <li key={idx}>{s.time} — {s.name} — {s.note}</li>
                  ))
                )}
              </ul>
            </div>

            <div className="bg-gradient-to-br from-indigo-700 to-purple-600 rounded-lg p-4 shadow">
              <h4 className="text-sm text-white">Quick reports</h4>
              <div className="mt-3 space-y-2">
                <button className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm">Export CSV</button>
                <button className="w-full bg-white/10 text-white px-3 py-2 rounded text-sm">Generate PDF</button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
