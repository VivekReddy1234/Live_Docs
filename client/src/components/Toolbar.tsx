import React from 'react';
import { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  Highlighter,
} from 'lucide-react';
import { clsx } from 'clsx';

interface ToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ editor, disabled = false }) => {
  if (!editor) {
    return null;
  }

  const buttonClass = (isActive: boolean = false) =>
    clsx(
      'p-1.5 rounded-md text-sm font-medium transition-colors',
      isActive
        ? 'bg-brand-100 text-brand-700 shadow-xs'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
    );

  const divider = <div className="h-5 w-px bg-slate-200 mx-1 self-center" />;

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 bg-white/95 backdrop-blur-xs border-b border-slate-200 sticky top-16 z-20">
      {/* History */}
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={disabled || !editor.can().undo()}
        className={buttonClass(false)}
        title="Undo (Ctrl+Z)"
      >
        <Undo className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={disabled || !editor.can().redo()}
        className={buttonClass(false)}
        title="Redo (Ctrl+Y)"
      >
        <Redo className="w-4 h-4" />
      </button>

      {divider}

      {/* Headings */}
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('heading', { level: 1 }))}
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('heading', { level: 2 }))}
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('heading', { level: 3 }))}
        title="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </button>

      {divider}

      {/* Text styles */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('bold'))}
        title="Bold (Ctrl+B)"
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('italic'))}
        title="Italic (Ctrl+I)"
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('underline'))}
        title="Underline (Ctrl+U)"
      >
        <UnderlineIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('strike'))}
        title="Strikethrough"
      >
        <Strikethrough className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('highlight'))}
        title="Highlight"
      >
        <Highlighter className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleCode().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('code'))}
        title="Inline Code"
      >
        <Code className="w-4 h-4" />
      </button>

      {divider}

      {/* Lists & Blocks */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('bulletList'))}
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('orderedList'))}
        title="Ordered List"
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        disabled={disabled}
        className={buttonClass(editor.isActive('blockquote'))}
        title="Quote Block"
      >
        <Quote className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        disabled={disabled}
        className={buttonClass(false)}
        title="Horizontal Divider"
      >
        <Minus className="w-4 h-4" />
      </button>
    </div>
  );
};
