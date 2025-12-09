import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import UnreadBadge from './UnreadBadge';

export default function Header() {
  const { user, isAuthenticated, logout, messagesUnread, notificationsUnread } = useAuth();

  return (
    <header className="w-full bg-slate-900 text-gray-100 border-b border-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center font-bold text-white">RR</div>
          <div className="hidden sm:block">
            <div className="text-lg font-bold">RodRecover</div>
            <div className="text-xs text-gray-400">Rehab platform</div>
          </div>
        </Link>

        <nav className="hidden md:flex gap-6 items-center text-sm">
          <Link to="/exercises" className="hover:underline">Exercises</Link>
          <Link to="/games" className="hover:underline">Games</Link>
          <Link to="/reports" className="hover:underline">Reports</Link>
          <Link to="/messages" className="flex items-center gap-2 hover:underline">
            Messages <UnreadBadge count={messagesUnread} />
          </Link>
          <Link to="/notifications" className="flex items-center gap-2 hover:underline">
            Notifications <UnreadBadge count={notificationsUnread} />
          </Link>
        </nav>

        <div className="ml-4 flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <div className="text-sm text-gray-300">{user?.name || user?.email || 'User'}</div>
              <button onClick={logout} className="text-sm px-3 py-1 rounded bg-gray-800 hover:bg-gray-700">Sign out</button>
            </>
          ) : (
            <Link to="/login" className="text-sm px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500">Sign in</Link>
          )}
        </div>
      </div>
    </header>
  );
}
