import React from 'react';
import Header from './Header';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-900 text-gray-100">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
