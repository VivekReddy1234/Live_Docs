import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FileText, LogOut, Plus, Sparkles } from 'lucide-react';

interface NavbarProps {
  onCreateDocument?: () => void;
  isCreating?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onCreateDocument, isCreating }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Link to="/" className="flex items-center space-x-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-sky-400 flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-slate-900 via-slate-800 to-brand-700 bg-clip-text text-transparent">
              LiveDocs
            </span>
          </Link>
          <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-50 text-brand-700 border border-brand-200/60">
            <Sparkles className="w-3 h-3 mr-1 text-brand-500" />
            CRDT Powered
          </span>
        </div>

        <div className="flex items-center space-x-4">
          {onCreateDocument && (
            <button
              onClick={onCreateDocument}
              disabled={isCreating}
              className="inline-flex items-center px-3.5 py-2 text-sm font-medium rounded-lg text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 transition-colors shadow-xs disabled:opacity-50"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {isCreating ? 'Creating...' : 'New Document'}
            </button>
          )}

          {user && (
            <div className="flex items-center space-x-3 pl-2 border-l border-slate-200">
              <div className="flex items-center space-x-2.5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shadow-xs"
                  style={{ backgroundColor: user.avatarColor }}
                  title={user.email}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-slate-800 leading-none">{user.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
