import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import WelcomePage from "./pages/WelcomePage";
import PatientDashboard from "./pages/PatientDashboard";
import TherapistDashboard from "./pages/TherapistDashboard";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import MemoryGame from "./pages/MemoryGame";
import StroopGame from "./pages/StroopGame";
import Games from "./pages/Games";
import Exercises from "./pages/Exercises";
import Reports from "./pages/Reports";
import Messages from "./pages/Messages";
import Notifications from "./pages/Notifications";
import Settings from "./pages/Settings";
import ExerciseNew from "./pages/ExerciseNew";
import ExerciseRunner from "./pages/ExerciseRunner";
import Templates from "./pages/Templates";
import TherapistReports from "./pages/TherapistReports";
import TherapistNotifications from "./pages/TherapistNotifications";
import PatientCalendar from "./pages/PatientCalendar";
import TherapistCalendar from "./pages/TherapistCalendar";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Register />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route
            path="/patient"
            element={
              <ProtectedRoute requiredRole="patient">
                <PatientDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/games/memory" element={<ProtectedRoute requiredRole="patient"><MemoryGame /></ProtectedRoute>} />
          <Route path="/games/stroop" element={<ProtectedRoute requiredRole="patient"><StroopGame /></ProtectedRoute>} />
          <Route path="/games" element={<ProtectedRoute><Games /></ProtectedRoute>} />
          <Route path="/exercises" element={<ProtectedRoute><Exercises /></ProtectedRoute>} />
          <Route path="/exercises/new" element={<ProtectedRoute requiredRole="therapist"><ExerciseNew /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute requiredRole="therapist"><Templates /></ProtectedRoute>} />
          <Route path="/exercises/run" element={<ProtectedRoute requiredRole="patient"><ExerciseRunner /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute><PatientCalendar /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/therapist/reports" element={<ProtectedRoute requiredRole="therapist"><TherapistReports /></ProtectedRoute>} />
          <Route path="/therapist/notifications" element={<ProtectedRoute requiredRole="therapist"><TherapistNotifications /></ProtectedRoute>} />
          <Route path="/therapist/calendar" element={<ProtectedRoute requiredRole="therapist"><TherapistCalendar /></ProtectedRoute>} />
          <Route
            path="/therapist"
            element={
              <ProtectedRoute requiredRole="therapist">
                <TherapistDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
