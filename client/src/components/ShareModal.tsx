import React, { useState } from 'react';
import { X, UserPlus, Globe, Lock, Trash2, Check, Copy, Shield } from 'lucide-react';
import { DocumentDetail, DocumentRole } from '@livedocs/shared';
import { apiRequest } from '../lib/api';

interface ShareModalProps {
  document: DocumentDetail;
  onClose: () => void;
  onUpdate: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ document, onClose, onUpdate }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(document.isPublic);
  const [defaultRole, setDefaultRole] = useState<DocumentRole>(document.defaultRole);

  const isOwner = document.userRole === 'OWNER';
  const shareUrl = `${window.location.origin}/doc/${document.id}`;

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/documents/${document.id}/share`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setEmail('');
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to share document.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      await apiRequest(`/api/documents/${document.id}/share/${userId}`, {
        method: 'DELETE',
      });
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to remove collaborator.');
    }
  };

  const handleTogglePublic = async (newIsPublic: boolean, newDefaultRole: DocumentRole) => {
    try {
      setIsPublic(newIsPublic);
      setDefaultRole(newDefaultRole);
      await apiRequest(`/api/documents/${document.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPublic: newIsPublic, defaultRole: newDefaultRole }),
      });
      onUpdate();
    } catch (err: any) {
      setError(err.message || 'Failed to update public share settings.');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Share "{document.title}"</h2>
              <p className="text-xs text-slate-500">Manage collaborator permissions & access</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Invite Form (Owner Only) */}
          {isOwner ? (
            <form onSubmit={handleInvite} className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Invite Collaborator
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="collaborator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  required
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-brand-500"
                >
                  <option value="EDITOR">Can edit</option>
                  <option value="VIEWER">Can view</option>
                </select>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  {isSubmitting ? 'Adding...' : 'Invite'}
                </button>
              </div>
              {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
            </form>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              Only the document owner can invite or remove collaborators.
            </div>
          )}

          {/* Collaborator List */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">
              People with access
            </h3>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
              {/* Owner */}
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                <div className="flex items-center space-x-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: document.owner?.avatarColor || '#3b82f6' }}
                  >
                    {document.owner?.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                      {document.owner?.name}
                      <span className="text-xs text-slate-400 font-normal">(Owner)</span>
                    </p>
                    <p className="text-xs text-slate-500">{document.owner?.email}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                  Owner
                </span>
              </div>

              {/* Shared Permissions */}
              {document.permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{ backgroundColor: perm.user.avatarColor }}
                    >
                      {perm.user.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{perm.user.name}</p>
                      <p className="text-xs text-slate-500">{perm.user.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-xs font-medium px-2.5 py-1 rounded-md ${
                        perm.role === 'EDITOR'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {perm.role === 'EDITOR' ? 'Can edit' : 'Can view'}
                    </span>

                    {isOwner && (
                      <button
                        onClick={() => handleRevoke(perm.userId)}
                        className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                        title="Remove access"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Public Link Sharing */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isPublic ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {isPublic ? 'Anyone with the link' : 'Restricted access'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isPublic
                      ? `Anyone on the internet with the link can ${
                          defaultRole === 'EDITOR' ? 'edit' : 'view'
                        }`
                      : 'Only invited collaborators can access'}
                  </p>
                </div>
              </div>

              {isOwner && (
                <div className="flex items-center space-x-2">
                  {isPublic && (
                    <select
                      value={defaultRole}
                      onChange={(e) =>
                        handleTogglePublic(isPublic, e.target.value as DocumentRole)
                      }
                      className="text-xs border border-slate-300 rounded-md py-1 px-2 text-slate-700 font-medium"
                    >
                      <option value="VIEWER">Viewer</option>
                      <option value="EDITOR">Editor</option>
                    </select>
                  )}
                  <button
                    onClick={() => handleTogglePublic(!isPublic, defaultRole)}
                    className="text-xs font-medium text-brand-600 hover:text-brand-800 underline"
                  >
                    {isPublic ? 'Make Restricted' : 'Make Public'}
                  </button>
                </div>
              )}
            </div>

            {/* Copy Link Button */}
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg truncate select-all"
              />
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors shadow-2xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
