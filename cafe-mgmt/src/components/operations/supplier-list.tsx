"use client";

import { useState, useTransition } from "react";
import {
  addSupplier,
  updateSupplier,
  deleteSupplier,
  logCallOutcome,
} from "@/actions/supplier.actions";
import { useToast } from "@/components/ui/toast";
import { CallOutcomePrompt } from "./call-outcome-prompt";
import { Phone } from "lucide-react";

interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  lastOrderDate: string | null;
  reminderDays: number;
  ingredients: Array<{ id: string; name: string; unit: string }>;
}

export function SupplierList({
  initialSuppliers,
  isManager,
}: {
  initialSuppliers: Supplier[];
  isManager: boolean;
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [callPromptId, setCallPromptId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  // Add form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editReminder, setEditReminder] = useState(7);

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditPhone(s.phone ?? "");
    setEditNotes(s.notes ?? "");
    setEditReminder(s.reminderDays);
  }

  function handleAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const result = await addSupplier({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        notes: newNotes.trim() || undefined,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSuppliers((prev) => [
        ...prev,
        {
          id: result.data.id,
          name: newName.trim(),
          phone: newPhone.trim() || null,
          notes: newNotes.trim() || null,
          lastOrderDate: null,
          reminderDays: 7,
          ingredients: [],
        },
      ]);
      setNewName("");
      setNewPhone("");
      setNewNotes("");
      setShowAdd(false);
      toast("Supplier added");
    });
  }

  function handleUpdate(id: string) {
    startTransition(async () => {
      const result = await updateSupplier({
        id,
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        notes: editNotes.trim() || undefined,
        reminderDays: editReminder,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSuppliers((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                name: editName.trim(),
                phone: editPhone.trim() || null,
                notes: editNotes.trim() || null,
                reminderDays: editReminder,
              }
            : s
        )
      );
      setEditingId(null);
      toast("Supplier updated");
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this supplier?")) return;
    startTransition(async () => {
      const result = await deleteSupplier(id);
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      toast("Supplier deleted");
    });
  }

  function handleCallOutcome(
    supplierId: string,
    outcome: "ORDERED" | "NO_ANSWER" | "CALL_BACK"
  ) {
    startTransition(async () => {
      const result = await logCallOutcome({ supplierId, outcome });
      if (!result.success) {
        toast(result.error);
        return;
      }
      if (outcome === "ORDERED") {
        setSuppliers((prev) =>
          prev.map((s) =>
            s.id === supplierId
              ? { ...s, lastOrderDate: new Date().toISOString() }
              : s
          )
        );
      }
      setCallPromptId(null);
      toast(
        outcome === "ORDERED"
          ? "Order logged"
          : outcome === "NO_ANSWER"
            ? "No answer recorded"
            : "Call back reminder set"
      );
    });
  }

  return (
    <div className="space-y-[var(--space-2)] lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
      {suppliers.map((supplier) => (
        <div
          key={supplier.id}
          className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)]"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {editingId === supplier.id ? (
            <div className="space-y-[var(--space-2)]">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Name"
              />
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Phone"
              />
              <input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Notes"
              />
              <div className="flex items-center gap-2">
                <label className="text-meta text-[var(--text-secondary)]">
                  Reminder every
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={editReminder}
                  onChange={(e) => setEditReminder(Number(e.target.value))}
                  className="w-16 rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1 text-meta"
                />
                <span className="text-meta text-[var(--text-secondary)]">days</span>
              </div>
              <div className="flex gap-[var(--space-2)]">
                <button
                  onClick={() => setEditingId(null)}
                  className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUpdate(supplier.id)}
                  disabled={isPending}
                  className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <span className="text-body font-medium">{supplier.name}</span>
                  {supplier.notes && (
                    <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
                      {supplier.notes}
                    </p>
                  )}
                  {supplier.lastOrderDate && (
                    <p className="text-meta text-[var(--text-secondary)]">
                      Last order:{" "}
                      {new Date(supplier.lastOrderDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  )}
                </div>

                {/* Tap-to-call */}
                {supplier.phone && (
                  <a
                    href={`tel:${supplier.phone}`}
                    onClick={() => setCallPromptId(supplier.id)}
                    className="touch-target flex size-[44px] items-center justify-center rounded-lg bg-[var(--color-info)]/10 text-[var(--color-info)] active:scale-95"
                    title={`Call ${supplier.phone}`}
                  >
                    <Phone size={20} />
                  </a>
                )}
              </div>

              {/* What they supply */}
              {supplier.ingredients.length > 0 && (
                <div className="mt-[var(--space-2)] pt-[var(--space-2)] border-t border-[var(--border-default)]">
                  <p className="text-meta text-[var(--text-secondary)] mb-[var(--space-1)]">Supplies</p>
                  <div className="flex flex-wrap gap-1">
                    {supplier.ingredients.map((ing) => (
                      <span
                        key={ing.id}
                        className="text-meta rounded-full bg-[var(--bg-secondary,#f3f4f6)] px-2 py-0.5"
                      >
                        {ing.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Manager actions */}
              {isManager && (
                <div className="flex gap-[var(--space-3)] mt-[var(--space-2)]">
                  <button
                    onClick={() => startEdit(supplier)}
                    className="text-meta text-[var(--color-info)] font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(supplier.id)}
                    className="text-meta text-[var(--color-urgent,#dc2626)] font-medium"
                  >
                    Delete
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {/* Call outcome prompt */}
      {callPromptId && (
        <CallOutcomePrompt
          onSelect={(outcome) => handleCallOutcome(callPromptId, outcome)}
          onClose={() => setCallPromptId(null)}
        />
      )}

      {/* Add supplier */}
      {isManager && !showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full rounded-lg border-2 border-dashed border-[var(--border-default)] p-[var(--space-3)] text-body text-[var(--color-info)] font-medium active:scale-[0.98]"
        >
          + Add Supplier
        </button>
      )}

      {isManager && showAdd && (
        <div className="rounded-lg bg-[var(--bg-primary)] p-[var(--space-4)] space-y-[var(--space-2)]" style={{ boxShadow: "var(--shadow-card)" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            placeholder="Supplier name"
            autoFocus
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            placeholder="Phone number"
          />
          <input
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
            placeholder="Notes (optional)"
          />
          <div className="flex gap-[var(--space-2)]">
            <button
              onClick={() => setShowAdd(false)}
              className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={isPending || !newName.trim()}
              className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
