import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { DocumentCard } from '../components/DocumentCard';
import { DocumentItem, PaginatedResponse } from '@livedocs/shared';
import { apiRequest } from '../lib/api';
import { Search, Plus, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'owned' | 'shared'>('all');
  const navigate = useNavigate();

  const fetchDocuments = async () => {
    try {
      setIsLoading(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '12',
        filter,
        ...(search.trim() ? { search: search.trim() } : {}),
      });

      const res = await apiRequest<PaginatedResponse<DocumentItem>>(
        `/api/documents?${queryParams.toString()}`
      );
      setDocuments(res.data);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch (err) {
      console.error('Error fetching documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [page, filter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchDocuments();
  };

  const handleCreateDocument = async () => {
    try {
      setIsCreating(true);
      const newDoc = await apiRequest<DocumentItem>('/api/documents', {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled Document' }),
      });
      navigate(`/doc/${newDoc.id}`);
    } catch (err) {
      console.error('Error creating document:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    try {
      await apiRequest(`/api/documents/${id}`, { method: 'DELETE' });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error deleting document:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar onCreateDocument={handleCreateDocument} isCreating={isCreating} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Controls Bar: Search & Filter Tabs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Documents</h1>
            <p className="text-xs text-slate-500 mt-1">
              {total} {total === 1 ? 'document' : 'documents'} total
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-brand-500 shadow-2xs"
              />
            </form>

            {/* Filter Tabs */}
            <div className="flex items-center bg-slate-200/70 p-1 rounded-lg text-xs font-medium text-slate-600 w-full sm:w-auto">
              <button
                onClick={() => {
                  setFilter('all');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md transition-all ${
                  filter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                onClick={() => {
                  setFilter('owned');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md transition-all ${
                  filter === 'owned' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'hover:text-slate-900'
                }`}
              >
                Owned by me
              </button>
              <button
                onClick={() => {
                  setFilter('shared');
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md transition-all ${
                  filter === 'shared' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'hover:text-slate-900'
                }`}
              >
                Shared
              </button>
            </div>
          </div>
        </div>

        {/* Documents Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-48 bg-white border border-slate-200 rounded-xl p-5 animate-pulse flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-2/3"></div>
                  <div className="h-3 bg-slate-100 rounded w-full"></div>
                  <div className="h-3 bg-slate-100 rounded w-4/5"></div>
                </div>
                <div className="h-3 bg-slate-100 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-2xl p-8">
            <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">No documents found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              {search
                ? `No documents match "${search}". Try another search term.`
                : 'Get started by creating your first collaborative document.'}
            </p>
            <button
              onClick={handleCreateDocument}
              disabled={isCreating}
              className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              {isCreating ? 'Creating...' : 'Create New Document'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {documents.map((doc) => (
              <DocumentCard key={doc.id} document={doc} onDelete={handleDeleteDocument} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-slate-600 px-3">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
