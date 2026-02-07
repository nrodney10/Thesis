import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  
  const initialToken = localStorage.getItem("token") || sessionStorage.getItem("token");
  const initialUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || sessionStorage.getItem("user") || 'null');
    } catch (e) { return null; }
  })();

  const [user, setUser] = useState(initialUser);
  const [token, setToken] = useState(initialToken);
  const [notificationsUnread, setNotificationsUnread] = useState(0);
  const [messagesUnread, setMessagesUnread] = useState(0);
  const [indicatorsLoading, setIndicatorsLoading] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await fetch('http://localhost:5000/api/user/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null;
      const j = await res.json();
      if (j.success) {
        setUser(j.user || null);
        if (localStorage.getItem('token') === token) localStorage.setItem('user', JSON.stringify(j.user));
        else sessionStorage.setItem('user', JSON.stringify(j.user));
        return j.user || null;
      }
    } catch (e) { }
    return null;
  }, [token]);

  useEffect(() => {
 
    if (!token) return;
    if (!user) refreshProfile();
  }, [token, user, refreshProfile]);

  const login = ({ token: newToken, user: newUser, remember }) => {
    if (remember) {
      localStorage.setItem("token", newToken);
      if (newUser) localStorage.setItem("user", JSON.stringify(newUser));
    } else {
      sessionStorage.setItem("token", newToken);
      if (newUser) sessionStorage.setItem("user", JSON.stringify(newUser));
    }
    setToken(newToken);
    setUser(newUser || null);
    setTimeout(() => refreshIndicators(), 50);
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setNotificationsUnread(0);
    setMessagesUnread(0);
  };

  const isAuthenticated = !!token;

  const authFetch = useCallback((url, opts = {}) => {
    const headers = opts.headers ? { ...opts.headers } : {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(url, { ...opts, headers });
  }, [token]);

  const refreshIndicators = useCallback(async () => {
    if (!token) return;
    try {
      setIndicatorsLoading(true);
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const r = await fetch('http://localhost:5000/api/indicators', { headers });
      if (r.ok) {
        const j = await r.json();
        if (j.success) {
          setNotificationsUnread(j.notificationsUnread);
          setMessagesUnread(j.messagesUnread);
        }
      }
    } catch (e) {  }
    finally { setIndicatorsLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!token) return; 
    let interval = setInterval(() => refreshIndicators(), 30000);
    refreshIndicators();
    return () => clearInterval(interval);
  }, [token, refreshIndicators]);

  const decrementNotifications = () => setNotificationsUnread(v => Math.max(0, v - 1));
  const decrementMessages = () => setMessagesUnread(v => Math.max(0, v - 1));
  const incrementMessages = () => setMessagesUnread(v => v + 1);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      login,
      logout,
      isAuthenticated,
      authFetch,
      notificationsUnread,
      messagesUnread,
      refreshIndicators,
      indicatorsLoading,
      refreshProfile,
      decrementNotifications,
      decrementMessages,
      incrementMessages
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export default AuthContext;
