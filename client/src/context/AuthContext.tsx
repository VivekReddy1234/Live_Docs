import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserProfile, AuthResponse } from '@livedocs/shared';
import { apiRequest, setAccessToken, getAccessToken, getApiUrl } from '../lib/api';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    async function loadUser() {
      try {
        const token = getAccessToken();
        if (token) {
          const res = await apiRequest<{ user: UserProfile }>('/api/auth/me');
          setUser(res.user);
        } else {
          // Attempt silent refresh via httpOnly cookie
          const refreshRes = await fetch(getApiUrl('/api/auth/refresh'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          });
          if (refreshRes.ok) {
            const data: AuthResponse = await refreshRes.json();
            setAccessToken(data.accessToken);
            setUser(data.user);
          }
        }
      } catch {
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();

    const handleUnauthorized = () => {
      setUser(null);
      setAccessToken(null);
    };

    window.addEventListener('livedocs:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('livedocs:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const data = await apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      requiresAuth: false,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const data = await apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
      requiresAuth: false,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST', requiresAuth: false });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
