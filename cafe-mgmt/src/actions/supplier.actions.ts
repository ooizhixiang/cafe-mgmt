"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import type { ActionResult } from "@/types";

// ─── Schemas ────────────────────────────────────────────────

const addSupplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  reminderDays: z.number().int().min(1).max(90).optional(),
});

const updateSupplierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  phone: z.string().max(20).optional(),
  notes: z.string().max(500).optional(),
  reminderDays: z.number().int().min(1).max(90).optional(),
});

const logOutcomeSchema = z.object({
  supplierId: z.string().min(1),
  outcome: z.enum(["ORDERED", "NO_ANSWER", "CALL_BACK"]),
});

// ─── Supplier CRUD (Story 4.1) ─────────────────────────────

export async function getSuppliers(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      phone: string | null;
      notes: string | null;
      lastOrderDate: string | null;
      reminderDays: number;
      ingredients: Array<{ id: string; name: string; unit: string }>;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const suppliers = await prisma.supplier.findMany({
      where: { cafeId: session.user.cafeId },
      include: {
        ingredients: {
          select: { id: true, name: true, unit: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { displayOrder: "asc" },
    });

    return {
      success: true,
      data: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        notes: s.notes,
        lastOrderDate: s.lastOrderDate?.toISOString() ?? null,
        reminderDays: s.reminderDays,
        ingredients: s.ingredients,
      })),
    };
  } catch {
    return { success: false, error: "Failed to load suppliers" };
  }
}

export async function addSupplier(
  input: z.infer<typeof addSupplierSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = addSupplierSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const maxOrder = await prisma.supplier.aggregate({
      where: { cafeId },
      _max: { displayOrder: true },
    });

    const supplier = await prisma.supplier.create({
      data: {
        cafeId,
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
        reminderDays: parsed.data.reminderDays ?? 7,
        displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
      },
    });

    return { success: true, data: { id: supplier.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add supplier" };
  }
}

export async function updateSupplier(
  input: z.infer<typeof updateSupplierSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = updateSupplierSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const existing = await prisma.supplier.findFirst({
      where: { id: parsed.data.id, cafeId },
    });
    if (!existing) {
      return { success: false, error: "Supplier not found" };
    }

    await prisma.supplier.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        notes: parsed.data.notes ?? null,
        reminderDays: parsed.data.reminderDays ?? existing.reminderDays,
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update supplier" };
  }
}

export async function deleteSupplier(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const existing = await prisma.supplier.findFirst({
      where: { id, cafeId },
    });
    if (!existing) {
      return { success: false, error: "Supplier not found" };
    }

    await prisma.supplier.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete supplier" };
  }
}

// ─── Call Outcome Logging (Story 4.2) ───────────────────────

export async function logCallOutcome(
  input: z.infer<typeof logOutcomeSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;
    const parsed = logOutcomeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const supplier = await prisma.supplier.findFirst({
      where: { id: parsed.data.supplierId, cafeId },
    });
    if (!supplier) {
      return { success: false, error: "Supplier not found" };
    }

    await prisma.supplierCallLog.create({
      data: {
        supplierId: parsed.data.supplierId,
        outcome: parsed.data.outcome,
        calledById: session.user.id,
      },
    });

    // Update lastOrderDate when ORDERED
    if (parsed.data.outcome === "ORDERED") {
      await prisma.supplier.update({
        where: { id: parsed.data.supplierId },
        data: { lastOrderDate: new Date() },
      });
    }

    return { success: true, data: undefined };
  } catch {
    return { success: false, error: "Failed to log call outcome" };
  }
}

export async function getCallLog(
  supplierId: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      outcome: string;
      calledByName: string;
      createdAt: string;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, cafeId },
    });
    if (!supplier) {
      return { success: false, error: "Supplier not found" };
    }

    const logs = await prisma.supplierCallLog.findMany({
      where: { supplierId },
      include: { calledBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      success: true,
      data: logs.map((l) => ({
        id: l.id,
        outcome: l.outcome,
        calledByName: l.calledBy.name,
        createdAt: l.createdAt.toISOString(),
      })),
    };
  } catch {
    return { success: false, error: "Failed to load call log" };
  }
}
