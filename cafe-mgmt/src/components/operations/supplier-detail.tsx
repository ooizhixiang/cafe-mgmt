"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { updateSupplier } from "@/actions/supplier.actions";
import { useToast } from "@/components/ui/toast";

interface SupplierProduct {
  id: string;
  ingredientId: string;
  ingredientName: string;
  priceInCents: number;
  unit: string;
}

interface SupplierData {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  reminderDays: number;
  lastOrderDate: string | null;
  products: SupplierProduct[];
}

interface PurchaseRow {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  totalPriceInCents: number;
  createdAt: string;
}

interface Props {
  supplier: SupplierData;
  purchases: PurchaseRow[];
  mode: "manager" | "readonly";
}

function formatRM(cents: number): string {
  return `RM ${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SupplierDetail({ supplier: initialSupplier, purchases, mode }: Props) {
  const isManager = mode === "manager";
  const [supplier, setSupplier] = useState(initialSupplier);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(initialSupplier.name);
  const [editPhone, setEditPhone] = useState(initialSupplier.phone ?? "");
  const [editNotes, setEditNotes] = useState(initialSupplier.notes ?? "");
  const [editReminder, setEditReminder] = useState(initialSupplier.reminderDays);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function startEdit() {
    setEditName(supplier.name);
    setEditPhone(supplier.phone ?? "");
    setEditNotes(supplier.notes ?? "");
    setEditReminder(supplier.reminderDays);
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  function handleSave() {
    if (!editName.trim()) {
      toast("Name is required");
      return;
    }
    if (
      !Number.isInteger(editReminder) ||
      editReminder < 1 ||
      editReminder > 90
    ) {
      toast("Reminder must be a whole number between 1 and 90");
      return;
    }
    startTransition(async () => {
      const result = await updateSupplier({
        id: supplier.id,
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        notes: editNotes.trim() || undefined,
        reminderDays: editReminder,
      });
      if (!result.success) {
        toast(result.error);
        return;
      }
      setSupplier((prev) => ({
        ...prev,
        name: editName.trim(),
        phone: editPhone.trim() || null,
        notes: editNotes.trim() || null,
        reminderDays: editReminder,
      }));
      setIsEditing(false);
      toast("Supplier updated");
    });
  }

  return (
    <div className="space-y-[var(--space-6)]">
      {/* Back link */}
      <Link
        href="/suppliers"
        className="inline-flex items-center gap-1 text-meta text-[var(--color-info)] font-medium"
      >
        <ArrowLeft size={14} /> Suppliers
      </Link>

      {/* Contact section */}
      <section>
        {isEditing && isManager ? (
          <div className="space-y-[var(--space-2)]">
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Name
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Name"
              />
            </div>
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Phone
              </label>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Phone"
              />
            </div>
            <div>
              <label className="text-meta text-[var(--text-secondary)] block mb-0.5">
                Notes
              </label>
              <input
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full rounded border border-[var(--border-default)] bg-[var(--bg-primary)] px-2 py-1.5 text-body"
                placeholder="Notes"
              />
            </div>
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
            <div className="flex gap-[var(--space-2)] pt-[var(--space-1)]">
              <button
                type="button"
                onClick={cancelEdit}
                className="flex-1 rounded-lg border border-[var(--border-default)] px-3 py-1.5 text-meta"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="flex-1 rounded-lg bg-[var(--color-info)] px-3 py-1.5 text-meta font-medium text-white disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-headline mb-[var(--space-1)]">{supplier.name}</h1>
              {supplier.phone ? (
                <p className="text-body">
                  <a
                    href={`tel:${supplier.phone}`}
                    className="text-[var(--color-info)] font-medium"
                  >
                    {supplier.phone}
                  </a>
                </p>
              ) : (
                <p className="text-body text-[var(--text-secondary)]">
                  No phone number
                </p>
              )}
              {supplier.notes && (
                <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
                  {supplier.notes}
                </p>
              )}
              <p className="text-meta text-[var(--text-secondary)] mt-[var(--space-1)]">
                Reminder every {supplier.reminderDays}{" "}
                {supplier.reminderDays === 1 ? "day" : "days"}
              </p>
              {supplier.lastOrderDate && (
                <p className="text-meta text-[var(--text-secondary)]">
                  Last order:{" "}
                  {new Date(supplier.lastOrderDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
            {isManager && (
              <button
                type="button"
                onClick={startEdit}
                className="touch-target inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-meta text-[var(--color-info)] font-medium"
                aria-label="Edit supplier"
              >
                <Pencil size={14} /> Edit
              </button>
            )}
          </div>
        )}
      </section>

      {/* Products supplied */}
      <section className="pt-[var(--space-4)] border-t border-[var(--border-default)]">
        <h2 className="text-body font-semibold mb-[var(--space-2)]">
          Products supplied
        </h2>
        {supplier.products.length === 0 ? (
          <p className="text-meta text-[var(--text-secondary)]">
            No ingredients linked yet
          </p>
        ) : (
          <div className="space-y-[var(--space-1)]">
            {supplier.products.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-[var(--border-default)] p-[var(--space-2)] text-meta"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.ingredientName}</div>
                </div>
                <div className="text-[var(--text-secondary)] shrink-0">
                  {formatRM(p.priceInCents)}/{p.unit}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Purchase history */}
      <section className="pt-[var(--space-4)] border-t border-[var(--border-default)]">
        <h2 className="text-body font-semibold mb-[var(--space-2)]">
          Purchase history
        </h2>
        {purchases.length === 0 ? (
          <p className="text-meta text-[var(--text-secondary)]">
            No purchases logged yet
          </p>
        ) : (
          <div className="space-y-[var(--space-1)]">
            {purchases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border border-[var(--border-default)] p-[var(--space-2)] text-meta"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{p.ingredientName}</div>
                  <div className="text-[var(--text-secondary)]">
                    {p.quantity} {p.unit} · {formatRM(p.totalPriceInCents)}
                  </div>
                </div>
                <div className="text-[var(--text-secondary)] shrink-0">
                  {formatDate(p.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
