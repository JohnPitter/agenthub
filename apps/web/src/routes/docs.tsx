import { useState, useEffect, useCallback, useRef } from "react";
import type { editor as monacoEditor } from "monaco-editor";
import { Plus, BookOpen, Search, Pin, Pencil, Eye, Save, Trash2, ChevronRight, Link2, Check } from "lucide-react";
import { CommandBar } from "../components/layout/command-bar";
import { CodeEditor } from "../components/files/code-editor";
import { MarkdownContent } from "../lib/markdown";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { EmptyState } from "../components/ui/empty-state";
import { cn, api, formatRelativeTime } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace-store";
import { useNotificationStore } from "../stores/notification-store";
import type { DocArticle } from "@agenthub/shared";

interface DocTreeNode extends DocArticle {
  children: DocTreeNode[];
}

function buildDocTree(docs: DocArticle[]): DocTreeNode[] {
  const map = new Map<string, DocTreeNode>();
  const roots: DocTreeNode[] = [];

  for (const doc of docs) {
    map.set(doc.id, { ...doc, children: [] });
  }

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: DocTreeNode[]) => {
    nodes.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    nodes.forEach(n => sortChildren(n.children));
  };
  sortChildren(roots);

  return roots;
}

function getAncestors(docs: DocArticle[], docId: string): DocArticle[] {
  const ancestors: DocArticle[] = [];
  let current = docs.find(d => d.id === docId);
  while (current?.parentId) {
    const parent = docs.find(d => d.id === current!.parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }
  return ancestors;
}

function DocTreeItem({
  node, depth, selectedId, expandedIds, onSelect, onToggle
}: {
  node: DocTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const isActive = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <>
      <button
        onClick={() => onSelect(node.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-all",
          isActive ? "bg-gradient-to-r from-brand-light to-transparent text-brand shadow-xs"
                   : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
        )}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isExpanded && "rotate-90")}
            onClick={(e) => { e.stopPropagation(); onToggle(node.id); }}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <BookOpen className={cn("h-4 w-4 shrink-0", isActive ? "text-brand" : "text-neutral-fg3")} />
        <span className={cn("truncate text-[13px] font-medium", isActive ? "text-brand" : "text-neutral-fg1")}>
          {node.title}
        </span>
        {node.pinned && <Pin className="h-3 w-3 shrink-0 text-brand" />}
      </button>
      {hasChildren && isExpanded && node.children.map(child => (
        <DocTreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

export function DocsPage() {
  const projects = useWorkspaceStore((s) => s.projects);
  const addToast = useNotificationStore((s) => s.addToast);
  const [docs, setDocs] = useState<DocArticle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);

  const selected = docs.find((d) => d.id === selectedId) ?? null;

  const hasChanges = selected
    ? editTitle !== selected.title ||
      editContent !== selected.content ||
      (editCategory || null) !== (selected.category || null)
    : false;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Register @mention completion provider on editor mount
  const handleEditorMount = useCallback((ed: monacoEditor.IStandaloneCodeEditor, monacoInstance: typeof import("monaco-editor")) => {
    editorRef.current = ed;
    monacoInstance.languages.registerCompletionItemProvider("markdown", {
      triggerCharacters: ["@"],
      provideCompletionItems: (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        // Match @[ or just @ at end
        const mentionMatch = textUntilPosition.match(/@\[?([^\]]*)$/);
        if (!mentionMatch) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: textUntilPosition.lastIndexOf("@") + 1,
          endColumn: position.column,
        };

        const suggestions = projects.map((p) => ({
          label: `@[${p.name}]`,
          kind: monacoInstance.languages.CompletionItemKind.Reference,
          insertText: `@[${p.name}]`,
          range,
          detail: "Projeto",
        }));
        return { suggestions };
      },
    });
  }, [projects]);

  // Insert link at cursor position in editor
  const insertLink = () => {
    const ed = editorRef.current;
    if (!ed) return;
    const selection = ed.getSelection();
    if (!selection) return;
    const selectedText = ed.getModel()?.getValueInRange(selection) ?? "";
    const linkText = selectedText || "texto";
    const snippet = `[${linkText}](url)`;
    ed.executeEdits("insert-link", [{
      range: selection,
      text: snippet,
    }]);
    // Select "url" so user can type the actual URL
    const startCol = selection.startColumn + linkText.length + 2; // after "[text]("
    ed.setSelection({
      startLineNumber: selection.startLineNumber,
      startColumn: startCol,
      endLineNumber: selection.startLineNumber,
      endColumn: startCol + 3, // select "url"
    });
    ed.focus();
  };

  // Fetch docs on mount
  const fetchDocs = useCallback(async () => {
    try {
      const { docs: data } = await api<{ docs: DocArticle[] }>("/docs");
      setDocs(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // Sync edit fields when selection changes
  useEffect(() => {
    if (selected) {
      setEditTitle(selected.title);
      setEditContent(selected.content);
      setEditCategory(selected.category ?? "");
      setMode("view");
    }
    // intentionally only selectedId, not selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Auto-expand ancestors on selection
  useEffect(() => {
    if (!selectedId) return;
    const ancestors = getAncestors(docs, selectedId);
    if (ancestors.length > 0) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        for (const a of ancestors) next.add(a.id);
        return next;
      });
    }
  }, [selectedId, docs]);

  // Create new doc
  const handleCreate = async () => {
    try {
      const { doc } = await api<{ doc: DocArticle }>("/docs", {
        method: "POST",
        body: JSON.stringify({ title: "Novo Documento" }),
      });
      setDocs((prev) => [doc, ...prev]);
      setSelectedId(doc.id);
      setMode("edit");
    } catch {
      /* silent */
    }
  };

  // Save current doc
  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { doc } = await api<{ doc: DocArticle }>(`/docs/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          category: editCategory || null,
        }),
      });
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
      addToast("success", "Documento salvo");
    } catch {
      addToast("error", "Erro ao salvar documento");
    } finally {
      setSaving(false);
    }
  };

  // Delete current doc
  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await api(`/docs/${selectedId}`, { method: "DELETE" });
      setDocs((prev) => prev.filter((d) => d.id !== selectedId));
      setSelectedId(null);
      setDeleteConfirm(false);
    } catch {
      /* silent */
    }
  };

  // Toggle pin
  const handleTogglePin = async (id: string, currentPinned: boolean) => {
    try {
      const { doc } = await api<{ doc: DocArticle }>(`/docs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: !currentPinned }),
      });
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
    } catch {
      /* silent */
    }
  };

  // Filter by search
  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  // Build tree for sidebar
  const tree = buildDocTree(docs);

  return (
    <div className="flex h-full flex-col">
      <CommandBar
        actions={
          <button
            onClick={handleCreate}
            className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Novo Documento
          </button>
        }
      >
        <BookOpen className="h-5 w-5 text-brand" />
        <span className="text-neutral-fg1">Documentação</span>
        {docs.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-brand-light px-1.5 text-[10px] font-semibold text-brand">
            {docs.length}
          </span>
        )}
      </CommandBar>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — doc list */}
        <nav className="w-[280px] shrink-0 border-r border-stroke2 bg-neutral-bg-subtle flex flex-col">
          {/* Search */}
          <div className="px-4 pt-4 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-fg3" />
              <input
                type="text"
                placeholder="Buscar documentos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-stroke2 bg-neutral-bg1 py-2 pl-9 pr-3 text-[13px] text-neutral-fg1 placeholder:text-neutral-fg-disabled focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {search ? (
              <div className="space-y-1">
                {filtered.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedId(doc.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-all",
                      selectedId === doc.id
                        ? "bg-gradient-to-r from-brand-light to-transparent text-brand shadow-xs"
                        : "text-neutral-fg2 hover:bg-neutral-bg-hover hover:text-neutral-fg1",
                    )}
                  >
                    <BookOpen className={cn("h-4 w-4 shrink-0", selectedId === doc.id ? "text-brand" : "text-neutral-fg3")} />
                    <span className={cn("truncate text-[13px] font-medium", selectedId === doc.id ? "text-brand" : "text-neutral-fg1")}>
                      {doc.title}
                    </span>
                    {doc.pinned && <Pin className="h-3 w-3 shrink-0 text-brand" />}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {tree.map(node => (
                  <DocTreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    expandedIds={expandedIds}
                    onSelect={setSelectedId}
                    onToggle={toggleExpand}
                  />
                ))}
              </div>
            )}

            {filtered.length === 0 && !loading && (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <BookOpen className="h-8 w-8 text-neutral-fg-disabled" />
                <p className="text-[12px] text-neutral-fg3">
                  {search ? "Nenhum documento encontrado" : "Nenhum documento criado"}
                </p>
              </div>
            )}
          </div>
        </nav>

        {/* Right — Doc detail */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <div className="flex h-full flex-col">
              {/* Doc header */}
              <div className="flex items-center justify-between border-b border-stroke2 px-8 py-4">
                <div className="flex-1 min-w-0 mr-4">
                  {/* Breadcrumbs */}
                  {(() => {
                    const ancestors = getAncestors(docs, selected.id);
                    if (ancestors.length === 0) return null;
                    return (
                      <div className="flex items-center gap-1 mb-1 text-[11px] text-neutral-fg3">
                        {ancestors.map((a, i) => (
                          <span key={a.id} className="flex items-center gap-1">
                            {i > 0 && <span>/</span>}
                            <button
                              onClick={() => setSelectedId(a.id)}
                              className="hover:text-brand transition-colors"
                            >
                              {a.title}
                            </button>
                          </span>
                        ))}
                        <span>/</span>
                      </div>
                    );
                  })()}
                  {mode === "edit" ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full text-[18px] font-semibold text-neutral-fg1 bg-transparent border-b border-dashed border-stroke2 focus:border-brand focus:outline-none pb-1"
                      placeholder="Título do documento"
                    />
                  ) : (
                    <h2 className="text-[18px] font-semibold text-neutral-fg1 truncate">{selected.title}</h2>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {mode === "edit" ? (
                      <input
                        type="text"
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        placeholder="Categoria (ex: APIs, Guias)"
                        className="rounded-md border border-stroke2 bg-neutral-bg2 px-2.5 py-1 text-[12px] text-neutral-fg2 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20"
                      />
                    ) : selected.category ? (
                      <span className="rounded-md bg-brand-light px-2.5 py-1 text-[11px] font-semibold text-brand">
                        {selected.category}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-neutral-fg-disabled">
                      Atualizado {formatRelativeTime(selected.updatedAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Subpage creation button */}
                  <button
                    onClick={async () => {
                      try {
                        const { doc } = await api<{ doc: DocArticle }>("/docs", {
                          method: "POST",
                          body: JSON.stringify({ title: "Nova Subpágina", parentId: selected.id }),
                        });
                        setDocs((prev) => [doc, ...prev]);
                        setSelectedId(doc.id);
                        setMode("edit");
                        // Auto-expand the parent
                        setExpandedIds(prev => new Set(prev).add(selected.id));
                      } catch { /* silent */ }
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
                    title="Criar subpágina"
                  >
                    <Plus className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleTogglePin(selected.id, selected.pinned)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg transition-all",
                      selected.pinned
                        ? "bg-brand-light text-brand"
                        : "text-neutral-fg3 hover:bg-neutral-bg-hover",
                    )}
                    title={selected.pinned ? "Desafixar" : "Fixar"}
                  >
                    <Pin className="h-4 w-4" />
                  </button>

                  <div className="flex items-center rounded-lg bg-neutral-bg2 p-1">
                    <button
                      onClick={() => setMode("edit")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all",
                        mode === "edit"
                          ? "bg-neutral-bg1 text-neutral-fg1 shadow-xs"
                          : "text-neutral-fg3 hover:text-neutral-fg2",
                      )}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      onClick={() => setMode("view")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all",
                        mode === "view"
                          ? "bg-neutral-bg1 text-neutral-fg1 shadow-xs"
                          : "text-neutral-fg3 hover:text-neutral-fg2",
                      )}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                  </div>

                  {mode === "edit" && (
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-all",
                        hasChanges
                          ? "btn-primary text-white"
                          : "bg-neutral-bg2 text-neutral-fg3 cursor-default",
                      )}
                    >
                      {saving ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Salvando...
                        </>
                      ) : hasChanges ? (
                        <>
                          <Save className="h-4 w-4" />
                          Salvar
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Salvo
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => setDeleteConfirm(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-fg3 hover:bg-danger-light hover:text-danger transition-colors"
                    title="Excluir documento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Doc content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {mode === "edit" ? (
                  <>
                    {/* Editor toolbar */}
                    <div className="flex items-center gap-1 border-b border-stroke2 px-4 py-1.5 bg-neutral-bg-subtle">
                      <button
                        onClick={insertLink}
                        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-neutral-fg3 hover:bg-neutral-bg-hover hover:text-neutral-fg1 transition-colors"
                        title="Inserir link (Markdown)"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Link
                      </button>
                      <span className="mx-2 h-4 w-px bg-stroke2" />
                      <span className="text-[11px] text-neutral-fg-disabled">
                        Digite <code className="rounded bg-neutral-bg-hover px-1 py-0.5 text-[10px] font-mono">@</code> para mencionar projetos
                      </span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <CodeEditor
                        value={editContent}
                        language="markdown"
                        onChange={(val) => setEditContent(val ?? "")}
                        onSave={handleSave}
                        onEditorMount={handleEditorMount}
                      />
                    </div>
                  </>
                ) : (
                  <div className="h-full overflow-y-auto px-8 py-6">
                    {selected.content ? (
                      <MarkdownContent
                        content={selected.content}
                        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                      />
                    ) : (
                      <p className="text-[13px] text-neutral-fg-disabled italic">
                        Documento vazio. Clique em Editar para começar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={BookOpen}
              title="Documentação"
              description={docs.length === 0
                ? "Crie seu primeiro documento para começar a base de conhecimento."
                : "Selecione um documento na lista para visualizar ou editar."
              }
              action={docs.length === 0 ? { label: "Novo Documento", onClick: handleCreate, icon: Plus } : undefined}
              className="h-full"
            />
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && selected && (
        <ConfirmDialog
          title="Excluir Documento"
          message={`Tem certeza que deseja excluir "${selected.title}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
