import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Trash2, Globe, Lock, Clock } from 'lucide-react';
import { DocumentItem } from '@livedocs/shared';

interface DocumentCardProps {
  document: DocumentItem;
  onDelete?: (id: string) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({ document, onDelete }) => {
  const isOwner = document.userRole === 'OWNER';

  return (
    <div className="group relative bg-white border border-slate-200/80 hover:border-brand-300 rounded-xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between h-48">
      <div>
        <div className="flex items-start justify-between">
          <Link
            to={`/doc/${document.id}`}
            className="flex items-center space-x-2.5 flex-1 min-w-0"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:bg-brand-600 group-hover:text-white transition-colors">
              <FileText className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-brand-600 transition-colors truncate">
              {document.title}
            </h3>
          </Link>

          {isOwner && onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.confirm(`Delete "${document.title}"?`)) {
                  onDelete(document.id);
                }
              }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded transition-opacity"
              title="Delete document"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <Link to={`/doc/${document.id}`} className="block mt-3">
          <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
            {document.contentPreview || 'No content preview yet. Open to start writing...'}
          </p>
        </Link>
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center space-x-2">
          <span
            className={`px-2 py-0.5 rounded-md font-medium text-[10px] uppercase tracking-wider ${
              document.userRole === 'OWNER'
                ? 'bg-purple-50 text-purple-700'
                : document.userRole === 'EDITOR'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {document.userRole}
          </span>
          {document.isPublic ? (
            <span className="flex items-center text-emerald-600" title="Public document">
              <Globe className="w-3 h-3 mr-0.5" /> Public
            </span>
          ) : (
            <span className="flex items-center text-slate-400" title="Private document">
              <Lock className="w-3 h-3 mr-0.5" /> Private
            </span>
          )}
        </div>

        <div className="flex items-center text-slate-400">
          <Clock className="w-3 h-3 mr-1" />
          {new Date(document.updatedAt).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};
