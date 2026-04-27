"use client";

import { useState, useEffect, useTransition } from "react";
import {
  getGrabAndGoItems,
  createGrabAndGoItem,
  updateGrabAndGoItem,
  updateGrabAndGoStock,
  deleteGrabAndGoItem,
} from "@/actions/grab-and-go.actions";
import { useToast } from "@/components/ui/toast";
import { Pencil, Trash2, ImagePlus, Minus, Plus } from "lucide-react";

interface Item {
  id: string;
  name: string;
  imageUrl: string | null;
  priceInCents: number;
  stockCount: number;
  isActive: boolean;
}

function compressImage(file: File, maxSize = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = (height / width) * maxSize; width = maxSize; }
          else { width = (width / height) * maxSize; height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function GrabAndGoList({ isManager }: { isManager: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const { toast } = useToast();

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setLoading(true);
    const result = await getGrabAndGoItems();
    if (result.success) setItems(result.data);
    setLoading(false);
  }

  function handleAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const priceInCents = newPrice ? Math.round(parseFloat(newPrice) * 100) : 0;
      const result = await createGrabAndGoItem({ name: newName.trim(), priceInCents });
      if (!result.success) { toast(result.error); return; }
      setNewName(""); setNewPrice(""); setShowAdd(false);
      loadItems();
      toast("Item added");
    });
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditPrice(item.priceInCents ? (item.priceInCents / 100).toFixed(2) : "");
  }

  function handleSaveEdit(id: string) {
    startTransition(async () => {
      const priceInCents = editPrice ? Math.round(parseFloat(editPrice) * 100) : 0;
      const result = await updateGrabAndGoItem(id, { name: editName.trim(), priceInCents });
      if (!result.success) { toast(result.error); return; }
      setEditingId(null);
      loadItems();
      toast("Item updated");
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this item?")) return;
    startTransition(async () => {
      const result = await deleteGrabAndGoItem(id);
      if (!result.success) { toast(result.error); return; }
      loadItems();
      toast("Item deleted");
    });
  }

  function handleImagePick(id: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const dataUrl = await compressImage(file);
      startTransition(async () => {
        const result = await updateGrabAndGoItem(id, { imageUrl: dataUrl });
        if (!result.success) { toast(result.error); return; }
        loadItems();
      });
    };
    input.click();
  }

  if (loading) {
    return <div className="text-meta text-[var(--text-secondary)]">Loading...</div>;
  }

  return (
    <div className="space-y-[var(--space-3)]">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-3)] flex items-center gap-[var(--space-3)]"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {editingId === item.id ? (
            <div className="flex-1 space-y-[var(--space-2)]">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                autoFocus
              />
              <input
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="Price (RM)"
                type="number"
                step="0.01"
                min="0"
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
              />
              <div className="flex gap-[var(--space-2)]">
                <button onClick={() => setEditingId(null)} className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta">Cancel</button>
                <button onClick={() => handleSaveEdit(item.id)} disabled={isPending || !editName.trim()} className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50">Save</button>
              </div>
            </div>
          ) : (
            <>
              {/* Image */}
              <div className="relative shrink-0">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded-lg object-cover" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-[var(--bg-secondary,#f3f4f6)] flex items-center justify-center text-[var(--text-secondary)] text-lg">
                    {item.name.charAt(0)}
                  </div>
                )}
                {isManager && (
                  <button
                    onClick={() => handleImagePick(item.id)}
                    className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--color-info)] text-white flex items-center justify-center"
                  >
                    <ImagePlus size={12} />
                  </button>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-[var(--space-2)]">
                  <span className="text-body font-medium truncate">{item.name}</span>
                  {item.priceInCents > 0 && (
                    <span className="text-meta text-[var(--text-secondary)] shrink-0">
                      RM {(item.priceInCents / 100).toFixed(2)}
                    </span>
                  )}
                </div>
                {/* Stock controls */}
                <div className="flex items-center gap-[var(--space-2)] mt-[var(--space-1)]">
                  <span className="text-meta text-[var(--text-secondary)]">Stock:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const newCount = Math.max(0, item.stockCount - 1);
                        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, stockCount: newCount } : i));
                        startTransition(async () => { await updateGrabAndGoStock(item.id, newCount); });
                      }}
                      disabled={item.stockCount === 0}
                      className="flex size-7 items-center justify-center rounded border border-[var(--border-default)] text-[var(--text-secondary)] disabled:opacity-30"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.stockCount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const newCount = raw === "" ? 0 : parseInt(raw, 10);
                        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, stockCount: newCount } : i));
                      }}
                      onBlur={() => {
                        startTransition(async () => { await updateGrabAndGoStock(item.id, item.stockCount); });
                      }}
                      className={`w-12 text-center rounded border border-[var(--border-default)] bg-[var(--bg-primary)] py-0.5 text-meta font-medium ${item.stockCount === 0 ? "text-[var(--color-urgent,#dc2626)]" : item.stockCount <= 5 ? "text-[var(--color-warning)]" : "text-[var(--color-success)]"}`}
                    />
                    <button
                      onClick={() => {
                        const newCount = item.stockCount + 1;
                        setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, stockCount: newCount } : i));
                        startTransition(async () => { await updateGrabAndGoStock(item.id, newCount); });
                      }}
                      className="flex size-7 items-center justify-center rounded border border-[var(--border-default)] text-[var(--color-info)]"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {isManager && (
                <div className="flex items-center gap-[var(--space-1)] shrink-0">
                  <button onClick={() => startEdit(item)} className="touch-target p-1 text-[var(--text-secondary)]">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(item.id)} className="touch-target p-1 text-[var(--color-urgent,#dc2626)]">
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {items.length === 0 && !showAdd && (
        <p className="text-body text-[var(--text-secondary)] text-center py-[var(--space-4)]">
          No items yet
        </p>
      )}

      {/* Add item */}
      {isManager && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-lg border border-dashed border-[var(--border-default)] p-[var(--space-3)] text-body text-[var(--color-info)] font-medium"
        >
          + Add Item
        </button>
      )}

      {isManager && showAdd && (
        <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-3)] space-y-[var(--space-2)]" style={{ boxShadow: "var(--shadow-card)" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Item name"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <input
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            placeholder="Price in RM (optional)"
            type="number"
            step="0.01"
            min="0"
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
          />
          <div className="flex gap-[var(--space-2)]">
            <button onClick={() => { setShowAdd(false); setNewName(""); setNewPrice(""); }} className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta">Cancel</button>
            <button onClick={handleAdd} disabled={isPending || !newName.trim()} className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
