/* eslint-disable prettier/prettier */
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Editor from './editor/Editor';
import TypeCommand from './editor/TypeCommand';
import DeleteCommand from './editor/DeleteCommand';
import HistoryManager from './editor/HistoryManager';

type Doc = {
  id: string;
  name: string;
  filePath?: string;
  editor: Editor;
  history: HistoryManager;
  isDirty: boolean;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  recovered?: boolean;
};

const genId = () => Math.random().toString(36).slice(2, 10);
// removed duplicate definition

type PreviewProps = {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontColor: string;
};

const simpleMarkdownToHtml = (src: string): string => {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  const inline = (s: string): string => {
    let t = escape(s);
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    t = t.replace(/__(.+?)__/g, '<u>$1</u>');
    t = t.replace(/~~(.+?)~~/g, '<del>$1</del>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    return t;
  };

  lines.forEach((line) => {
    if (/^\s*-\s+/.test(line)) {
      if (!inList) {
        inList = true;
        out.push('<ul>');
      }
      const item = line.replace(/^\s*-\s+/, '');
      out.push(`<li>${inline(item)}</li>`);
      return;
    }
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (line.trim().length === 0) {
      out.push('');
    } else {
      out.push(`<p>${inline(line)}</p>`);
    }
  });
  if (inList) out.push('</ul>');
  return out.join('\n');
};

function MarkdownPreview({
  text,
  fontFamily,
  fontSize,
  fontColor,
}: PreviewProps) {
  if (text.length === 0) {
    return (
      <div className="rounded border border-slate-300 bg-white p-3 text-sm">
        <span className="text-slate-400">Nothing to show</span>
      </div>
    );
  }
  const html = simpleMarkdownToHtml(text);
  return (
    <div
      className="prose prose-slate max-w-none rounded border border-slate-300 bg-white p-3 text-sm"
      style={{ fontFamily, fontSize, color: fontColor }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function App() {
  const [docs, setDocs] = useState<Doc[]>(() => [
    {
      id: genId(),
      name: 'Untitled',
      editor: new Editor(),
      history: new HistoryManager(),
      isDirty: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 14,
      fontColor: '#0f172a',
    },
  ]);
  const [activeId, setActiveId] = useState<string>(docs[0].id);
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [showFind, setShowFind] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);

  const activeDoc = useMemo(
    () => docs.find((d) => d.id === activeId) ?? docs[0],
    [docs, activeId],
  );

  // Restore recovery on load
  useEffect(() => {
    (async () => {
      const recovered = await window.api?.recovery.readAll();
      if (recovered && recovered.length > 0) {
        const recoveredDocs: Doc[] = recovered.map((r: any) => {
          const ed = new Editor();
          ed.setText(r.content || '');
          return {
            id: r.docId || genId(),
            name: r?.meta?.name || 'Recovered',
            filePath: r?.meta?.filePath,
            editor: ed,
            history: new HistoryManager(),
            isDirty: true,
            fontFamily:
              r?.meta?.fontFamily ||
              'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: r?.meta?.fontSize || 14,
            fontColor: r?.meta?.fontColor || '#0f172a',
            recovered: true,
          } as Doc;
        });
        setDocs((prev) => {
          const first =
            prev.length === 1 &&
            prev[0].editor.getText().length === 0 &&
            !prev[0].filePath
              ? []
              : prev;
          return [...first, ...recoveredDocs];
        });
        setActiveId((prev) => prev);
      }
    })();
  }, []);

  const updateDoc = (id: string, partial: Partial<Doc>) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...partial } : d)),
    );
  };

  const newTab = useCallback(() => {
    const doc: Doc = {
      id: genId(),
      name: 'Untitled',
      editor: new Editor(),
      history: new HistoryManager(),
      isDirty: false,
      fontFamily:
        activeDoc?.fontFamily ||
        'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: activeDoc?.fontSize || 14,
      fontColor: activeDoc?.fontColor || '#0f172a',
    };
    setDocs((prev) => [...prev, doc]);
    setActiveId(doc.id);
  }, [activeDoc]);

  const closeTab = useCallback(
    (id: string) => {
      setDocs((prev) => {
        const remaining = prev.filter((d) => d.id !== id);
        if (remaining.length === 0) {
          const doc: Doc = {
            id: genId(),
            name: 'Untitled',
            editor: new Editor(),
            history: new HistoryManager(),
            isDirty: false,
            fontFamily:
              activeDoc?.fontFamily ||
              'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: activeDoc?.fontSize || 14,
            fontColor: activeDoc?.fontColor || '#0f172a',
          };
          setActiveId(doc.id);
          return [doc];
        }
        if (activeId === id) {
          setActiveId(remaining[remaining.length - 1].id);
        }
        return remaining;
      });
      window.api?.recovery.clear(id);
    },
    [activeDoc, activeId],
  );

  const openFile = useCallback(async (filePath?: string) => {
    const result = filePath
      ? await window.api?.file.openPath(filePath)
      : await window.api?.file.open();
    if (!result || (result as any).canceled) return;
    const fp = (result as any).filePath;
    const content = (result as any).content as string;
    const ed = new Editor();
    ed.setText(content);
    const name = fp ? fp.split(/[\\/]/).pop() || 'Untitled' : 'Untitled';
    const doc: Doc = {
      id: genId(),
      name,
      filePath: fp,
      editor: ed,
      history: new HistoryManager(),
      isDirty: false,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 14,
      fontColor: '#0f172a',
    };
    setDocs((prev) => [...prev, doc]);
    setActiveId(doc.id);
    if (fp) await window.api?.recent.push(fp);
  }, []);

  const saveAs = useCallback(async (doc: Doc) => {
    if (!doc) return;
    const content = doc.editor.getText();
    const meta = {
      fontFamily: doc.fontFamily,
      fontSize: doc.fontSize,
      fontColor: doc.fontColor,
    };
    const res = await window.api?.file.saveAs(content, meta);
    if (!res || (res as any).canceled) return;
    const filePath = (res as any).filePath as string;
    const name = filePath.split(/[\\/]/).pop() || 'Untitled';
    updateDoc(doc.id, { filePath, name, isDirty: false });
    window.api?.recovery.clear(doc.id);
    await window.api?.recent.push(filePath);
  }, []);

  const saveFile = useCallback(
    async (doc: Doc) => {
      if (!doc) return;
      const content = doc.editor.getText();
      if (doc.filePath) {
        const meta = {
          fontFamily: doc.fontFamily,
          fontSize: doc.fontSize,
          fontColor: doc.fontColor,
        };
        const res = await window.api?.file.save(doc.filePath, content, meta);
        if (res) {
          updateDoc(doc.id, { isDirty: false, name: doc.name });
          window.api?.recovery.clear(doc.id);
          await window.api?.recent.push(doc.filePath);
        }
      } else {
        await saveAs(doc);
      }
    },
    [saveAs],
  );

  // Listen to menu actions
  useEffect(() => {
    const unsub = window.api?.onMenuAction(async (action, payload) => {
      if (action === 'file:new') newTab();
      if (action === 'file:open') await openFile();
      if (action === 'file:openPath' && typeof payload === 'string')
        await openFile(payload);
      if (action === 'file:save') await saveFile(activeDoc);
      if (action === 'file:saveAs') await saveAs(activeDoc);
      if (action === 'recent:clear') await window.api?.recent.clear();
    });
    return () => {
      if (unsub) unsub();
    };
  }, [activeDoc, newTab, openFile, saveAs, saveFile]);

  // Autosave recovery for active doc
  useEffect(() => {
    const handle = setTimeout(() => {
      if (!activeDoc) return;
      const payload = {
        content: activeDoc.editor.getText(),
        meta: {
          name: activeDoc.name,
          filePath: activeDoc.filePath,
          fontFamily: activeDoc.fontFamily,
          fontSize: activeDoc.fontSize,
          fontColor: activeDoc.fontColor,
          ts: Date.now(),
        },
      };
      window.api?.recovery.write(activeDoc.id, payload);
    }, 1000);
    return () => clearTimeout(handle);
  }, [activeDoc]);

  const applyDiffEdit = useCallback(
    (newValue: string) => {
      const currentValue = activeDoc.editor.getText();
      if (
        newValue.length >= currentValue.length &&
        newValue.startsWith(currentValue)
      ) {
        const toAdd = newValue.slice(currentValue.length);
        if (toAdd.length > 0)
          new TypeCommand(activeDoc.editor, activeDoc.history, toAdd).execute();
      } else if (
        newValue.length < currentValue.length &&
        currentValue.startsWith(newValue)
      ) {
        const delCount = currentValue.length - newValue.length;
        if (delCount > 0)
          new DeleteCommand(
            activeDoc.editor,
            activeDoc.history,
            delCount,
          ).execute();
      } else {
        if (currentValue.length > 0)
          new DeleteCommand(
            activeDoc.editor,
            activeDoc.history,
            currentValue.length,
          ).execute();
        if (newValue.length > 0)
          new TypeCommand(
            activeDoc.editor,
            activeDoc.history,
            newValue,
          ).execute();
      }
      updateDoc(activeDoc.id, { isDirty: true });
    },
    [activeDoc],
  );

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    applyDiffEdit(e.target.value);
  };

  const handleUndo = useCallback(() => {
    activeDoc.history.undo(activeDoc.editor);
    updateDoc(activeDoc.id, { isDirty: true });
  }, [activeDoc]);

  const handleRedo = useCallback(() => {
    activeDoc.history.redo(activeDoc.editor);
    updateDoc(activeDoc.id, { isDirty: true });
  }, [activeDoc]);

  // Renderer keyboard shortcuts (Cmd/Ctrl + Z/Y/N/O/S/Shift+S/F/W)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          // redo
          activeDoc.history.redo(activeDoc.editor);
          updateDoc(activeDoc.id, { isDirty: true });
        } else {
          // undo
          activeDoc.history.undo(activeDoc.editor);
          updateDoc(activeDoc.id, { isDirty: true });
        }
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        activeDoc.history.redo(activeDoc.editor);
        updateDoc(activeDoc.id, { isDirty: true });
        return;
      }
      if (key === 'f') {
        e.preventDefault();
        setShowFind(true);
        setTimeout(() => findInputRef.current?.focus(), 0);
      } else if (key === 'n') {
        e.preventDefault();
        newTab();
      } else if (key === 'o') {
        e.preventDefault();
        openFile();
      } else if (key === 's' && e.shiftKey) {
        e.preventDefault();
        saveAs(activeDoc);
      } else if (key === 's') {
        e.preventDefault();
        saveFile(activeDoc);
      } else if (key === 'w') {
        e.preventDefault();
        closeTab(activeDoc.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeDoc, closeTab, newTab, openFile, saveAs, saveFile]);

  const wrapSelection = (prefix: string, suffix: string = prefix) => {
    const text = activeDoc.editor.getText();
    const { start, end } = selection;
    const before = text.slice(0, start);
    const selected = text.slice(start, end);
    const after = text.slice(end);
    activeDoc.history.saveState(activeDoc.editor);
    activeDoc.editor.setText(`${before}${prefix}${selected}${suffix}${after}`);
    updateDoc(activeDoc.id, { isDirty: true });
    setTimeout(() => {
      if (textAreaRef.current) {
        const newStart = start + prefix.length;
        const newEnd = newStart + selected.length;
        textAreaRef.current.selectionStart = newStart;
        textAreaRef.current.selectionEnd = newEnd;
        textAreaRef.current.focus();
      }
    }, 0);
  };

  const findRegex = useCallback(() => {
    const flags = matchCase ? 'g' : 'gi';
    const esc = findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = wholeWord ? `\\b${esc}\\b` : esc;
    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }, [findQuery, matchCase, wholeWord]);

  const findNext = () => {
    const text = activeDoc.editor.getText();
    if (!findQuery) return;
    const regex = findRegex();
    if (!regex) return;
    regex.lastIndex = selection.end;
    const m =
      regex.exec(text) ||
      (() => {
        regex.lastIndex = 0;
        return regex.exec(text);
      })();
    if (m && textAreaRef.current) {
      const start = m.index;
      const end = start + m[0].length;
      textAreaRef.current.selectionStart = start;
      textAreaRef.current.selectionEnd = end;
      setSelection({ start, end });
      textAreaRef.current.focus();
    }
  };

  const replaceOne = () => {
    if (!findQuery) return;
    const text = activeDoc.editor.getText();
    const { start, end } = selection;
    if (
      end > start &&
      text.slice(start, end).toLowerCase() === findQuery.toLowerCase()
    ) {
      activeDoc.history.saveState(activeDoc.editor);
      activeDoc.editor.setText(
        text.slice(0, start) + replaceText + text.slice(end),
      );
      updateDoc(activeDoc.id, { isDirty: true });
      setSelection({ start, end: start + replaceText.length });
    } else {
      findNext();
    }
  };

  const replaceAll = () => {
    if (!findQuery) return;
    const regex = findRegex();
    if (!regex) return;
    const text = activeDoc.editor.getText();
    activeDoc.history.saveState(activeDoc.editor);
    const next = text.replace(regex, replaceText);
    activeDoc.editor.setText(next);
    updateDoc(activeDoc.id, { isDirty: true });
  };

  const onSelect = () => {
    if (!textAreaRef.current) return;
    setSelection({
      start: textAreaRef.current.selectionStart,
      end: textAreaRef.current.selectionEnd,
    });
  };

  const lineAndColumn = () => {
    const text = activeDoc.editor.getText();
    const upToCursor = text.slice(0, selection.start);
    const lines = upToCursor.split(/\n/);
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    return { line, col };
  };

  const words =
    activeDoc.editor.getText().trim().length === 0
      ? 0
      : activeDoc.editor.getText().trim().split(/\s+/).length;
  const chars = activeDoc.editor.getText().length;

  return (
    <div className="h-screen w-screen bg-slate-50 text-slate-900">
      <div className="flex h-full w-full flex-col gap-2 p-2">
        <header className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1">
          <div className="flex items-center gap-1">
            <button
              title="New (⌘/Ctrl+N)"
              className="rounded p-2 text-sm hover:bg-slate-100"
              type="button"
              onClick={newTab}
            >
              ＋
            </button>
            <button
              title="Open (⌘/Ctrl+O)"
              className="rounded p-2 text-sm hover:bg-slate-100"
              type="button"
              onClick={() => openFile()}
            >
              📂
            </button>
            <button
              title="Save (⌘/Ctrl+S)"
              className="rounded p-2 text-sm hover:bg-slate-100"
              type="button"
              onClick={() => saveFile(activeDoc)}
            >
              💾
            </button>
            <button
              title="Save As (⇧+⌘/Ctrl+S)"
              className="rounded p-2 text-sm hover:bg-slate-100"
              type="button"
              onClick={() => saveAs(activeDoc)}
            >
              📝
            </button>
            <div className="mx-2 h-5 w-px bg-slate-200" />
            <button
              title="Undo"
              className="rounded p-2 text-sm hover:bg-slate-100 disabled:opacity-40"
              onClick={handleUndo}
              disabled={!activeDoc.history.canUndo()}
              type="button"
            >
              ↶
            </button>
            <button
              title="Redo"
              className="rounded p-2 text-sm hover:bg-slate-100 disabled:opacity-40"
              onClick={handleRedo}
              disabled={!activeDoc.history.canRedo()}
              type="button"
            >
              ↷
            </button>
            <div className="mx-2 h-5 w-px bg-slate-200" />
            <button
              title={showPreview ? 'Hide Preview' : 'Show Preview'}
              className="rounded p-2 text-sm hover:bg-slate-100"
              type="button"
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? '▣' : '▢'}
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="truncate text-sm text-slate-700"
              title={activeDoc.filePath || activeDoc.name}
            >
              {activeDoc.name}
              {activeDoc.isDirty ? '*' : ''}
            </div>
            <div className="mx-1 h-5 w-px bg-slate-200" />
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              value={activeDoc.fontFamily}
              onChange={(e) =>
                updateDoc(activeDoc.id, { fontFamily: e.target.value })
              }
            >
              <option value="ui-monospace, SFMono-Regular, Menlo, monospace">
                Monospace
              </option>
              <option value="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, sans-serif">
                Sans
              </option>
              <option value="ui-serif, Georgia, Cambria, Times New Roman, Times, serif">
                Serif
              </option>
            </select>
            <input
              className="w-16 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              type="number"
              min={10}
              max={32}
              value={activeDoc.fontSize}
              onChange={(e) =>
                updateDoc(activeDoc.id, { fontSize: Number(e.target.value) })
              }
            />
            <input
              className="h-7 w-7 cursor-pointer"
              type="color"
              value={activeDoc.fontColor}
              onChange={(e) =>
                updateDoc(activeDoc.id, { fontColor: e.target.value })
              }
            />
            <div className="ml-1 flex items-center gap-1">
              <button
                title="Bold"
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => wrapSelection('**')}
              >
                B
              </button>
              <button
                title="Italic"
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => wrapSelection('*')}
              >
                I
              </button>
              <button
                title="Underline"
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => wrapSelection('__')}
              >
                U
              </button>
              <button
                title="Strikethrough"
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                onClick={() => wrapSelection('~~')}
              >
                S
              </button>
            </div>
          </div>
        </header>

        <nav className="flex items-center gap-2 overflow-x-auto">
          {docs.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${d.id === activeId ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-white'}`}
            >
              <span className="truncate max-w-[200px]">
                {d.name}
                {d.isDirty ? '*' : ''}
                {d.recovered ? ' (recovered)' : ''}
              </span>
              <span
                role="button"
                tabIndex={0}
                className="text-slate-400"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(d.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeTab(d.id);
                  }
                }}
              >
                ✕
              </span>
            </button>
          ))}
        </nav>

        <div
          className={`grid min-h-0 flex-1 grid-cols-1 gap-2 ${showPreview ? 'md:grid-cols-3' : ''}`}
        >
          <div
            className={`${showPreview ? 'col-span-2' : 'col-span-1'} flex min-h-0 flex-col gap-2`}
          >
            <textarea
              ref={textAreaRef}
              className="flex-1 resize-none rounded border border-slate-300 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sky-400"
              style={{
                fontFamily: activeDoc.fontFamily,
                fontSize: activeDoc.fontSize,
                color: activeDoc.fontColor,
              }}
              value={activeDoc.editor.getText()}
              onChange={handleChange}
              onSelect={onSelect}
              placeholder="Start typing..."
            />
            <div className="flex items-center justify-between rounded border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              <div>
                Line {lineAndColumn().line}, Col {lineAndColumn().col}
              </div>
              <div>
                {words} words | {chars} chars
              </div>
            </div>
          </div>
          {showPreview && (
            <aside className="flex flex-col gap-2">
              <section>
                <h2 className="mb-2 text-sm font-medium text-slate-600">
                  Preview
                </h2>
                <MarkdownPreview
                  text={activeDoc.editor.getText()}
                  fontFamily={activeDoc.fontFamily}
                  fontSize={activeDoc.fontSize}
                  fontColor={activeDoc.fontColor}
                />
              </section>
            </aside>
          )}
        </div>
      </div>

      {showFind && (
        <div className="fixed right-3 top-3 z-50 w-[min(420px,90vw)] rounded border border-slate-300 bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-600">
              Find & Replace
            </div>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => setShowFind(false)}
            >
              ✕
            </button>
          </div>
          <div className="mb-2 flex gap-2">
            <input
              ref={findInputRef}
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Find"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
            />
            <input
              className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
              placeholder="Replace"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
          </div>
          <div className="mb-2 flex items-center gap-3 text-xs text-slate-700">
            <label htmlFor="matchCase" className="flex items-center gap-1">
              <input
                id="matchCase"
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
              />
              <span>Case sensitive</span>
            </label>
            <label htmlFor="wholeWord" className="flex items-center gap-1">
              <input
                id="wholeWord"
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
              />
              <span>Whole word</span>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded bg-slate-200 px-2 py-1 text-sm"
              onClick={findNext}
            >
              Find next
            </button>
            <button
              type="button"
              className="rounded bg-slate-200 px-2 py-1 text-sm"
              onClick={replaceOne}
            >
              Replace
            </button>
            <button
              type="button"
              className="rounded bg-slate-200 px-2 py-1 text-sm"
              onClick={replaceAll}
            >
              Replace all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
