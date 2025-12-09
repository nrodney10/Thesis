import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

export default function Placeholder({ title, description, links = [] }) {
  const h1Ref = useRef(null);
  useEffect(() => {
    if (h1Ref.current) h1Ref.current.focus();
  }, []);

  return (
    <main role="main" className="min-h-screen p-8 bg-gray-900 text-gray-100">
      <div className="max-w-3xl mx-auto bg-gray-800 p-6 rounded shadow">
        <h1 ref={h1Ref} tabIndex={-1} className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-gray-300 mb-4">{description}</p>
        {links.length > 0 && (
          <div className="space-y-2">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="inline-block bg-indigo-600 px-3 py-2 rounded text-white mr-2">{l.label}</Link>
            ))}
          </div>
        )}
  <div className="mt-6 text-sm text-gray-400">TODO: implement full {title.toLowerCase()} feature.</div>
      </div>
    </main>
  );
}
