import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import CharacterCount from '@tiptap/extension-character-count';
import * as Y from 'yjs';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { LiveDocsSocketProvider, SyncStatus } from '../lib/yjs-socket-provider';
import { Toolbar } from '../components/Toolbar';
import { CollaboratorsList } from '../components/CollaboratorsList';
import { ShareModal } from '../components/ShareModal';
import { VersionHistoryModal } from '../components/VersionHistoryModal';
import { DocumentDetail, DocumentRole } from '@livedocs/shared';
import {
  FileText,
  ChevronLeft,
  Share2,
  History,
  Cloud,
  CloudOff,
  RefreshCw,
  Eye,
  CheckCircle2,
} from 'lucide-react';

export const EditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [docTitle, setDocTitle] = useState('Untitled Document');
  const [role, setRole] = useState<DocumentRole>('VIEWER');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('connecting');
  const [isLoading, setIsLoading] = useState(true);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTitleSaving, setIsTitleSaving] = useState(false);

  // Yjs & Provider Refs
  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<LiveDocsSocketProvider | null>(null);

  // 1. Fetch document metadata
  const fetchDocMetadata = async () => {
    if (!id) return;
    try {
      const data = await apiRequest<DocumentDetail>(`/api/documents/${id}`);
      setDocument(data);
      setDocTitle(data.title);
      setRole(data.userRole);
    } catch (err: any) {
      console.error('Failed to load document metadata:', err);
      navigate('/');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocMetadata();

    const handlePermissionsUpdated = (e: any) => {
      if (e.detail?.documentId === id) {
        fetchDocMetadata();
      }
    };

    window.addEventListener('livedocs:permissions_updated', handlePermissionsUpdated);
    return () => {
      window.removeEventListener('livedocs:permissions_updated', handlePermissionsUpdated);
    };
  }, [id]);

  // 2. Initialize Yjs Doc & Socket Provider
  if (!ydocRef.current && id && user) {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const provider = new LiveDocsSocketProvider(id, ydoc, {
      id: user.id,
      name: user.name,
      color: user.avatarColor,
      email: user.email,
    });

    providerRef.current = provider;

    provider.onStatus((status) => {
      setSyncStatus(status);
    });

    provider.onRole((serverRole) => {
      setRole(serverRole);
    });
  }

  // 3. Initialize Tiptap Editor
  const canEdit = role === 'OWNER' || role === 'EDITOR';

  const editor = useEditor(
    {
      editable: canEdit,
      extensions: [
        // CRITICAL NOTE: Disable built-in history when using Yjs Collaboration extension!
        StarterKit.configure({
          history: false,
        }),
        Collaboration.configure({
          document: ydocRef.current!,
        }),
        CollaborationCursor.configure({
          provider: providerRef.current!,
          user: {
            name: user?.name || 'Anonymous',
            color: user?.avatarColor || '#3b82f6',
          },
        }),
        Placeholder.configure({
          placeholder: 'Start writing your document here...',
        }),
        Highlight,
        Underline,
        CharacterCount.configure({
          limit: 100000,
        }),
      ],
    },
    [id, user?.id]
  );

  // Sync editor editable state when role changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      providerRef.current = null;
      ydocRef.current = null;
    };
  }, []);

  // Title debounce update
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setDocTitle(newTitle);
  };

  const handleTitleBlur = async () => {
    if (!id || !canEdit || !docTitle.trim() || docTitle === document?.title) return;
    try {
      setIsTitleSaving(true);
      await apiRequest(`/api/documents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: docTitle.trim() }),
      });
      if (document) {
        setDocument({ ...document, title: docTitle.trim() });
      }
    } catch (err) {
      console.error('Error updating title:', err);
    } finally {
      setIsTitleSaving(false);
    }
  };

  if (isLoading || !document) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center space-x-2 text-slate-500 text-sm">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-600" />
          <span>Loading collaborative workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/60 flex flex-col">
      {/* Top Header Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          {/* Left: Back button & Document Title */}
          <div className="flex items-center space-x-3 flex-1 min-w-0 pr-4">
            <Link
              to="/"
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
              title="Back to Dashboard"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>

            <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>

            <div className="flex-1 min-w-0 max-w-md flex items-center gap-2">
              {canEdit ? (
                <input
                  type="text"
                  value={docTitle}
                  onChange={handleTitleChange}
                  onBlur={handleTitleBlur}
                  className="w-full font-semibold text-slate-900 text-sm sm:text-base bg-transparent hover:bg-slate-100 focus:bg-white px-2 py-1 rounded-md border border-transparent focus:border-brand-500 focus:outline-hidden transition-all truncate"
                  placeholder="Untitled Document"
                />
              ) : (
                <h1 className="font-semibold text-slate-900 text-sm sm:text-base px-2 py-1 truncate">
                  {docTitle}
                </h1>
              )}
              {isTitleSaving && (
                <span className="text-[10px] text-slate-400 shrink-0">Saving...</span>
              )}
            </div>

            {/* Sync & Role Badges */}
            <div className="hidden lg:flex items-center space-x-2 shrink-0">
              {syncStatus === 'synced' || syncStatus === 'connected' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <Cloud className="w-3 h-3 mr-1" /> Online
                </span>
              ) : syncStatus === 'offline' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200/60" title="Changes buffered in IndexedDB">
                  <CloudOff className="w-3 h-3 mr-1" /> Offline (Buffered)
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200/60">
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Syncing
                </span>
              )}

              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                  role === 'OWNER'
                    ? 'bg-purple-50 text-purple-700'
                    : role === 'EDITOR'
                    ? 'bg-blue-50 text-blue-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {role}
              </span>
            </div>
          </div>

          {/* Right: Presence Collaborators, History, Share & User */}
          <div className="flex items-center space-x-3 shrink-0">
            {/* Live Presence Avatars */}
            <CollaboratorsList awareness={providerRef.current?.awareness || null} />

            {/* Version History Button */}
            <button
              onClick={() => setIsHistoryOpen(true)}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors shadow-2xs"
              title="Version History"
            >
              <History className="w-4 h-4 sm:mr-1.5" />
              <span className="hidden sm:inline">History</span>
            </button>

            {/* Share Button */}
            <button
              onClick={() => setIsShareOpen(true)}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-xs"
            >
              <Share2 className="w-3.5 h-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      </header>

      {/* Read-Only Notice for Viewers */}
      {!canEdit && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-xs text-amber-800 flex items-center justify-center space-x-1.5">
          <Eye className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            You are viewing this document in <strong>Read-Only</strong> mode. You cannot make edits.
          </span>
        </div>
      )}

      {/* Formatting Toolbar */}
      <Toolbar editor={editor} disabled={!canEdit} />

      {/* Main Document Content Canvas */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-8 sm:p-14 min-h-[750px] transition-all">
          <EditorContent editor={editor} />
        </div>

        {/* Word & Character Count Footer */}
        {editor && (
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400 px-2">
            <span>
              {editor.storage.characterCount.words()} words · {editor.storage.characterCount.characters()} characters
            </span>
            <span className="flex items-center text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-500" />
              CRDT Synced
            </span>
          </div>
        )}
      </main>

      {/* Share Modal */}
      {isShareOpen && (
        <ShareModal
          document={document}
          onClose={() => setIsShareOpen(false)}
          onUpdate={fetchDocMetadata}
        />
      )}

      {/* Version History Modal */}
      {isHistoryOpen && (
        <VersionHistoryModal
          documentId={document.id}
          canEdit={canEdit}
          onClose={() => setIsHistoryOpen(false)}
          onRestore={() => {
            // Version restored: Yjs updates are automatically broadcasted to the provider
          }}
        />
      )}
    </div>
  );
};
