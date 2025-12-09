import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="bg-slate-800 border-b border-slate-700">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-2xl font-semibold text-white">
          RodRecover
        </Link>
        <nav className="space-x-4">
          <Link to="/" className="text-slate-200 hover:text-white">
            Home
          </Link>
          <Link to="/exercises" className="text-slate-200 hover:text-white">
            Exercises
          </Link>
          <Link to="/messages" className="text-slate-200 hover:text-white">
            Messages
          </Link>
        </nav>
      </div>
    </header>
  );
}
import React from 'react';
import { Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="w-full bg-slate-900 text-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center font-bold text-white">RR</div>
          <div className="hidden sm:block">
            <div className="text-lg font-bold">RodRecover</div>
            <div className="text-xs text-gray-300">Rehab</div>
          </div>
        </Link>
        <nav className="hidden md:flex gap-4 text-sm">
          <Link to="/exercises" className="hover:underline">Exercises</Link>
          <Link to="/games" className="hover:underline">Games</Link>
          <Link to="/reports" className="hover:underline">Reports</Link>
        </nav>
      </div>
    </header>
  );
}
