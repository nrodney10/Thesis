import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UnreadBadge from './UnreadBadge';

export default function Header() {
  const { user, isAuthenticated, logout, messagesUnread, notificationsUnread } = useAuth();

  return (
    <header className="w-full sticky top-0 z-20 bg-white/70 backdrop-blur border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shadow-md">RR</div>
          <div className="hidden sm:block">
            <div className="text-lg font-bold text-slate-900">RodRecover</div>
            <div className="text-xs text-gray-500">Rehab platform</div>
          </div>
        </Link>

        <nav className="hidden md:flex gap-6 items-center text-sm text-gray-700">
          <Link to="/exercises" className="hover:text-blue-600 transition">Exercises</Link>
          <Link to="/games" className="hover:text-blue-600 transition">Games</Link>
          <Link to="/reports" className="hover:text-blue-600 transition">Reports</Link>
          <Link to="/messages" className="flex items-center gap-2 hover:text-blue-600 transition">
            Messages <UnreadBadge count={messagesUnread} />
          </Link>
          <Link to="/notifications" className="flex items-center gap-2 hover:text-blue-600 transition">
            Notifications <UnreadBadge count={notificationsUnread} />
          </Link>
        </nav>

        <div className="ml-4 flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <div className="text-sm text-gray-700">{user?.name || user?.email || 'User'}</div>
              <button onClick={logout} className="text-sm px-3 py-1 rounded-full bg-blue-600 text-white shadow hover:bg-blue-500 transition">Sign out</button>
            </>
          ) : (
            <Link to="/login" className="text-sm px-3 py-1 rounded-full bg-blue-600 text-white shadow hover:bg-blue-500 transition">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
