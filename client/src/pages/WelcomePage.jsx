import React from "react";
import { useNavigate } from "react-router-dom";

const Dashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user"));

  if (!user) {
    alert("Please log in first.");
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-gray-100">
      <div className="bg-gray-800 shadow-xl rounded-2xl p-8 w-[400px] text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Welcome, {user.name}! 👋</h1>
        <p className="text-gray-300 mb-3">Role: {user.role}</p>
        <p className="text-gray-400">Email: {user.email}</p>

        <button
          onClick={() => {
            localStorage.removeItem("user");
            navigate("/login");
          }}
          className="mt-6 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
