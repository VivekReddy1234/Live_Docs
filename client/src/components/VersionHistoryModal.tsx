import React, { useState, useEffect } from 'react';
import { X, History, RotateCcw, Clock, Save, Eye, AlertCircle } from 'lucide-react';
import { SnapshotItem, SnapshotDetail } from '@livedocs/shared';
import { apiRequest } from '../lib/api';
import * as Y from 'yjs';

interface VersionHistoryModalProps {
  documentId: string;
  canEdit: boolean;
  onClose: () => void;
  onRestore: () => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  documentId,
  canEdit,
  onClose,
  onRestore,
}) => {
  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotDetail | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshots = async () => {
    try {
      setIsLoading(true);
      const list = await apiRequest<SnapshotItem[]>(`/api/documents/${documentId}/snapshots`);
      setSnapshots(list);
      if (list.length > 0) {
        loadSnapshotPreview(list[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load version history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
  }, [documentId]);

  const loadSnapshotPreview = async (snapshotId: string) => {
    try {
      const detail = await apiRequest<SnapshotDetail>(
        `/api/documents/${documentId}/snapshots/${snapshotId}`
      );
      setSelectedSnapshot(detail);

      // Decode preview text from binary state
      if (detail.binaryStateBase64) {
        const binary = Uint8Array.from(atob(detail.binaryStateBase64), (c) => c.charCodeAt(0));
        const tempDoc = new Y.Doc();
        Y.applyUpdate(tempDoc, binary);
        const fragment = tempDoc.getXmlFragment('default');
        const text = fragment.toString().replace(/<[^>]*>?/gm, ' ').trim();
        setPreviewText(text || 'Empty document snapshot');
      } else {
        setPreviewText('Initial document state (Empty)');
      }
    } catch (err: any) {
      console.error('Error loading snapshot preview:', err);
    }
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      setIsCreatingSnapshot(true);
      await apiRequest(`/api/documents/${documentId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ title: newTitle.trim(), comment: newComment.trim() || undefined }),
      });
      setNewTitle('');
      setNewComment('');
      setShowCreateForm(false);
      await fetchSnapshots();
    } catch (err: any) {
      setError(err.message || 'Failed to create snapshot.');
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRestore = async (snapshotId: string) => {
    if (!window.confirm('Are you sure you want to restore this version? Any unsaved edits will be replaced.')) {
      return;
    }

    try {
      setIsRestoring(true);
      await apiRequest(`/api/documents/${documentId}/snapshots/${snapshotId}/restore`, {
        method: 'POST',
      });
      onRestore();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to restore version.');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Version History</h2>
              <p className="text-xs text-slate-500">Inspect snapshots and roll back state seamlessly</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {canEdit && !showCreateForm && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors"
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                Save Snapshot
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Snapshot creation banner if toggled */}
        {showCreateForm && (
          <form
            onSubmit={handleCreateSnapshot}
            className="p-4 bg-brand-50/70 border-b border-brand-100 flex flex-wrap gap-2 items-center"
          >
            <input
              type="text"
              placeholder="Version name (e.g. Major draft revision)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
              className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
            <input
              type="text"
              placeholder="Optional comment / notes"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={isCreatingSnapshot}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-2xs"
            >
              {isCreatingSnapshot ? 'Saving...' : 'Save Checkpoint'}
            </button>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-lg"
            >
              Cancel
            </button>
          </form>
        )}

        {error && (
          <div className="px-6 py-2 bg-red-50 text-red-700 text-xs flex items-center gap-1.5 border-b border-red-100">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Content Body: Sidebar List + Preview Window */}
        <div className="flex-1 flex overflow-hidden">
          {/* Snapshots Sidebar */}
          <div className="w-80 border-r border-slate-200 overflow-y-auto bg-slate-50/40 divide-y divide-slate-100">
            {isLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Loading history...</div>
            ) : snapshots.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">No version snapshots recorded yet.</div>
            ) : (
              snapshots.map((s) => {
                const isSelected = selectedSnapshot?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => loadSnapshotPreview(s.id)}
                    className={`w-full text-left p-4 transition-all flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-white shadow-xs border-l-4 border-brand-600'
                        : 'hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {s.title}
                      </span>
                      <span className="text-[11px] text-slate-400 flex items-center">
                        <Clock className="w-3 h-3 mr-1 inline" />
                        {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {s.comment && (
                      <p className="text-xs text-slate-600 italic line-clamp-1">{s.comment}</p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span>{s.createdBy?.name || 'Automated'}</span>
                      <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Preview Panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {selectedSnapshot ? (
              <>
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-slate-500" />
                      Preview: {selectedSnapshot.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Captured on {new Date(selectedSnapshot.createdAt).toLocaleString()} by{' '}
                      {selectedSnapshot.createdBy?.name || 'System'}
                    </p>
                  </div>

                  {canEdit && (
                    <button
                      onClick={() => handleRestore(selectedSnapshot.id)}
                      disabled={isRestoring}
                      className="inline-flex items-center px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      {isRestoring ? 'Restoring...' : 'Restore this version'}
                    </button>
                  )}
                </div>

                <div className="flex-1 p-8 overflow-y-auto font-sans leading-relaxed text-slate-700 bg-white select-text">
                  <div className="max-w-2xl mx-auto whitespace-pre-wrap font-sans text-sm">
                    {previewText}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
                Select a version from the left panel to preview.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
