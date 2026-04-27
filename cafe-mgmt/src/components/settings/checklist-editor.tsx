"use client";

import { useState, useTransition } from "react";
import {
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  reorderChecklistItems,
} from "@/actions/checklist.actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";

interface TemplateItem {
  id: string;
  text: string;
  displayOrder: number;
  notes: string | null;
  role: string | null;
}

interface ChecklistEditorProps {
  templateId: string;
  templateName: string;
  period: string;
  initialItems: TemplateItem[];
}

const ROLE_OPTIONS = [
  { value: "", label: "Both" },
  { value: "MANAGER", label: "Manager" },
  { value: "STAFF", label: "Staff" },
];

export function ChecklistEditor({
  templateId,
  templateName,
  period,
  initialItems,
}: ChecklistEditorProps) {
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRole, setEditRole] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newRole, setNewRole] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TemplateItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function startEdit(item: TemplateItem) {
    setEditingId(item.id);
    setEditText(item.text);
    setEditNotes(item.notes ?? "");
    setEditRole(item.role ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleSaveEdit(id: string) {
    startTransition(async () => {
      const result = await updateChecklistItem(
        id,
        editText,
        editNotes || undefined,
        (editRole as "MANAGER" | "STAFF") || null
      );
      if (result.success) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id
              ? { ...i, text: editText, notes: editNotes || null, role: editRole || null }
              : i
          )
        );
        setEditingId(null);
        toast("Item updated");
      } else {
        toast(result.error);
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      const result = await deleteChecklistItem(id);
      if (result.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setDeleteTarget(null);
        toast("Item removed");
      } else {
        toast(result.error);
      }
    });
  }

  function handleAdd() {
    if (!newText.trim()) return;
    startTransition(async () => {
      const result = await addChecklistItem(
        templateId,
        newText.trim(),
        newNotes.trim() || undefined,
        (newRole as "MANAGER" | "STAFF") || null
      );
      if (result.success) {
        setItems((prev) => [
          ...prev,
          {
            id: result.data.id,
            text: newText.trim(),
            displayOrder: prev.length,
            notes: newNotes.trim() || null,
            role: newRole || null,
          },
        ]);
        setNewText("");
        setNewNotes("");
        setNewRole("");
        setShowAdd(false);
        toast("Item added");
      } else {
        toast(result.error);
      }
    });
  }

  function handleReorder(id: string, direction: "up" | "down") {
    const idx = items.findIndex((i) => i.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const newItems = [...items];
    [newItems[idx], newItems[swapIdx]] = [newItems[swapIdx], newItems[idx]];

    // Update display orders
    const reordered = newItems.map((item, i) => ({
      ...item,
      displayOrder: i,
    }));
    setItems(reordered);

    startTransition(async () => {
      await reorderChecklistItems(
        reordered.map((item) => ({ id: item.id, displayOrder: item.displayOrder }))
      );
    });
  }

  return (
    <section className="mb-[var(--space-6)]">
      <h3 className="text-value mb-[var(--space-2)]">{templateName}</h3>
      <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-3)]">
        {period.replace("_", "-")} period
      </p>

      {items.length > 10 && (
        <div className="flex items-center gap-[var(--space-2)] rounded-lg bg-amber-50 border border-amber-200 p-[var(--space-3)] mb-[var(--space-3)]">
          <AlertTriangle size={16} className="text-[var(--color-warning)] shrink-0" />
          <span className="text-meta text-[var(--color-warning)]">
            We recommend 8 items or fewer per checklist
          </span>
        </div>
      )}

      <div className="space-y-[var(--space-2)]">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="rounded-lg border border-[var(--border-default)] p-[var(--space-3)]"
          >
            {editingId === item.id ? (
              <div className="space-y-[var(--space-2)]">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] px-2 py-1 text-body"
                  placeholder="Item text"
                />
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded border border-[var(--border-default)] px-2 py-1 text-meta"
                  placeholder="Notes (optional)"
                />
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="rounded border border-[var(--border-default)] px-2 py-1 text-meta"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-[var(--space-2)]">
                  <button
                    onClick={() => handleSaveEdit(item.id)}
                    disabled={isPending}
                    className="touch-target p-1 text-[var(--color-success)]"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="touch-target p-1 text-[var(--text-secondary)]"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-[var(--space-2)]">
                <div className="flex-1 min-w-0">
                  <span className="text-body">{item.text}</span>
                  {item.notes && (
                    <p className="text-meta text-[var(--text-secondary)] mt-0.5">
                      {item.notes}
                    </p>
                  )}
                  {item.role && (
                    <span className="inline-block text-[10px] font-medium uppercase tracking-wider bg-[var(--bg-secondary)] rounded px-1.5 py-0.5 mt-1">
                      {item.role}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleReorder(item.id, "up")}
                    disabled={idx === 0 || isPending}
                    className="touch-target p-1 text-[var(--text-secondary)] disabled:opacity-30"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    onClick={() => handleReorder(item.id, "down")}
                    disabled={idx === items.length - 1 || isPending}
                    className="touch-target p-1 text-[var(--text-secondary)] disabled:opacity-30"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    onClick={() => startEdit(item)}
                    disabled={isPending}
                    className="touch-target p-1 text-[var(--color-info)]"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(item)}
                    disabled={isPending}
                    className="touch-target p-1 text-[var(--color-urgent)]"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="mt-[var(--space-3)] rounded-lg border border-dashed border-[var(--border-default)] p-[var(--space-3)] space-y-[var(--space-2)]">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] px-2 py-1 text-body"
            placeholder="Item text"
          />
          <input
            type="text"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] px-2 py-1 text-meta"
            placeholder="Notes (optional)"
          />
          <div className="flex items-center gap-[var(--space-2)]">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="rounded border border-[var(--border-default)] px-2 py-1 text-meta"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={isPending || !newText.trim()}
              className="touch-target p-1 text-[var(--color-success)] disabled:opacity-30"
            >
              <Check size={18} />
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setNewText("");
                setNewNotes("");
                setNewRole("");
              }}
              className="touch-target p-1 text-[var(--text-secondary)]"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-[var(--space-3)] flex items-center gap-[var(--space-2)] text-body text-[var(--color-info)]"
        >
          <Plus size={18} />
          Add item
        </button>
      )}

      <ConfirmationDialog
        open={!!deleteTarget}
        title="Remove item?"
        message={`Remove "${deleteTarget?.text}" from this checklist?`}
        confirmLabel="Remove"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
