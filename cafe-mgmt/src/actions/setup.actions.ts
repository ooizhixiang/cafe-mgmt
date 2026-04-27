"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { logError } from "@/lib/log-error";
import { getTemplateById } from "@/lib/template-data";
import type { ActionResult } from "@/types";

const selectTemplateSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
});

export async function skipTemplate(): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    await prisma.cafe.update({
      where: { id: session.user.cafeId },
      data: { templateSelected: "none" },
    });
    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function selectTemplate(
  templateId: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = selectTemplateSchema.safeParse({ templateId });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const template = getTemplateById(parsed.data.templateId);
    if (!template) {
      return { success: false, error: "Invalid template" };
    }

    // Check if already selected (idempotent — skip if same template)
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { templateSelected: true },
    });

    if (cafe?.templateSelected === template.id) {
      return { success: true, data: undefined };
    }

    // Apply template in a transaction
    await prisma.$transaction(async (tx) => {
      // Upsert ingredients
      const existingIngredients = await tx.ingredient.findMany({
        where: { cafeId },
        select: { name: true },
      });
      const existingNames = new Set(existingIngredients.map((i) => i.name));

      const newIngredients = template.ingredients.filter(
        (i) => !existingNames.has(i.name)
      );

      if (newIngredients.length > 0) {
        await tx.ingredient.createMany({
          data: newIngredients.map((ing, idx) => ({
            name: ing.name,
            unit: ing.unit,
            displayOrder: existingIngredients.length + idx,
            cafeId,
          })),
        });
      }

      // Upsert checklists
      for (const checklist of template.checklists) {
        const existing = await tx.checklistTemplate.findFirst({
          where: { cafeId, period: checklist.period },
        });

        if (!existing) {
          await tx.checklistTemplate.create({
            data: {
              name: checklist.name,
              period: checklist.period,
              cafeId,
              items: {
                create: checklist.items.map((item, idx) => ({
                  text: item.text,
                  displayOrder: idx,
                })),
              },
            },
          });
        }
      }

      // Upsert suppliers
      const existingSuppliers = await tx.supplier.findMany({
        where: { cafeId },
        select: { name: true },
      });
      const existingSupplierNames = new Set(
        existingSuppliers.map((s) => s.name)
      );

      const newSuppliers = template.suppliers.filter(
        (s) => !existingSupplierNames.has(s.name)
      );

      if (newSuppliers.length > 0) {
        await tx.supplier.createMany({
          data: newSuppliers.map((sup, idx) => ({
            name: sup.name,
            notes: sup.notes,
            displayOrder: existingSuppliers.length + idx,
            cafeId,
          })),
        });
      }

      // Mark template as selected
      await tx.cafe.update({
        where: { id: cafeId },
        data: { templateSelected: template.id },
      });
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to apply template";
    await logError({ context: "selectTemplate", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function getIngredients(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      unit: string;
      displayOrder: number;
    }>
  >
> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const ingredients = await prisma.ingredient.findMany({
      where: { cafeId },
      select: { id: true, name: true, unit: true, displayOrder: true },
      orderBy: { displayOrder: "asc" },
    });

    return { success: true, data: ingredients };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

const updateIngredientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  unit: z.string().min(1, "Unit is required"),
});

export async function updateIngredient(
  id: string,
  name: string,
  unit: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = updateIngredientSchema.safeParse({ id, name, unit });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      select: { cafeId: true },
    });

    if (!ingredient || ingredient.cafeId !== cafeId) {
      return { success: false, error: "Ingredient not found" };
    }

    await prisma.ingredient.update({
      where: { id },
      data: { name: parsed.data.name, unit: parsed.data.unit },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to update ingredient";
    await logError({ context: "updateIngredient", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function deleteIngredient(
  id: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const ingredient = await prisma.ingredient.findUnique({
      where: { id },
      select: { cafeId: true },
    });

    if (!ingredient || ingredient.cafeId !== cafeId) {
      return { success: false, error: "Ingredient not found" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { ingredientId: id } });
      await tx.inventoryCount.deleteMany({ where: { ingredientId: id } });
      await tx.wastageEntry.deleteMany({ where: { ingredientId: id } });
      await tx.compEntry.deleteMany({ where: { ingredientId: id } });
      await tx.feedAlert.deleteMany({ where: { ingredientId: id } });
      await tx.ingredient.delete({ where: { id } });
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to delete ingredient";
    await logError({ context: "deleteIngredient", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

const addIngredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  unit: z.string().min(1, "Unit is required"),
});

export async function addIngredient(
  name: string,
  unit: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = addIngredientSchema.safeParse({ name, unit });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    // Get next display order
    const maxOrder = await prisma.ingredient.findFirst({
      where: { cafeId },
      orderBy: { displayOrder: "desc" },
      select: { displayOrder: true },
    });

    const ingredient = await prisma.ingredient.create({
      data: {
        name: parsed.data.name,
        unit: parsed.data.unit,
        displayOrder: (maxOrder?.displayOrder ?? -1) + 1,
        cafeId,
      },
    });

    return { success: true, data: { id: ingredient.id } };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to add ingredient";
    await logError({ context: "addIngredient", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

// ─── Ingredient ↔ Supplier links ────────────────────────────

const addIngredientSupplierSchema = z.object({
  ingredientId: z.string().min(1),
  supplierId: z.string().min(1),
  priceInCents: z.number().int().min(0),
  unit: z.string().min(1).max(20),
});

const updateIngredientSupplierSchema = z.object({
  id: z.string().min(1),
  priceInCents: z.number().int().min(0),
  unit: z.string().min(1).max(20),
});

const removeIngredientSupplierSchema = z.object({
  id: z.string().min(1),
});

export async function addIngredientSupplier(
  input: z.infer<typeof addIngredientSupplierSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = addIngredientSupplierSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    // Verify ingredient + supplier both belong to this cafe
    const [ingredient, supplier] = await Promise.all([
      prisma.ingredient.findFirst({
        where: { id: parsed.data.ingredientId, cafeId },
        select: { id: true },
      }),
      prisma.supplier.findFirst({
        where: { id: parsed.data.supplierId, cafeId },
        select: { id: true },
      }),
    ]);
    if (!ingredient) {
      return { success: false, error: "Ingredient not found" };
    }
    if (!supplier) {
      return { success: false, error: "Supplier not found" };
    }

    // Block duplicates
    const existing = await prisma.ingredientSupplier.findFirst({
      where: {
        ingredientId: parsed.data.ingredientId,
        supplierId: parsed.data.supplierId,
        cafeId,
      },
      select: { id: true },
    });
    if (existing) {
      return { success: false, error: "Supplier already added" };
    }

    const link = await prisma.ingredientSupplier.create({
      data: {
        ingredientId: parsed.data.ingredientId,
        supplierId: parsed.data.supplierId,
        cafeId,
        priceInCents: parsed.data.priceInCents,
        unit: parsed.data.unit,
      },
    });

    return { success: true, data: { id: link.id } };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to add supplier link";
    await logError({ context: "addIngredientSupplier", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function updateIngredientSupplier(
  input: z.infer<typeof updateIngredientSupplierSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = updateIngredientSupplierSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const link = await prisma.ingredientSupplier.findFirst({
      where: { id: parsed.data.id, cafeId },
      select: { id: true },
    });
    if (!link) {
      return { success: false, error: "Supplier not found" };
    }

    await prisma.ingredientSupplier.update({
      where: { id: parsed.data.id },
      data: {
        priceInCents: parsed.data.priceInCents,
        unit: parsed.data.unit,
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to update supplier link";
    await logError({ context: "updateIngredientSupplier", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function removeIngredientSupplier(
  input: z.infer<typeof removeIngredientSupplierSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const parsed = removeIngredientSupplierSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0].message };
    }

    const link = await prisma.ingredientSupplier.findFirst({
      where: { id: parsed.data.id, cafeId },
      select: { id: true, _count: { select: { purchases: true } } },
    });
    if (!link) {
      return { success: false, error: "Supplier not found" };
    }

    if (link._count.purchases > 0) {
      return {
        success: false,
        error: "Has purchase history; archive supplier instead",
      };
    }

    await prisma.ingredientSupplier.delete({
      where: { id: parsed.data.id },
    });

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to remove supplier link";
    await logError({ context: "removeIngredientSupplier", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}

export async function reorderIngredient(
  id: string,
  direction: "up" | "down"
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;

    const ingredients = await prisma.ingredient.findMany({
      where: { cafeId },
      orderBy: { displayOrder: "asc" },
      select: { id: true, displayOrder: true },
    });

    const idx = ingredients.findIndex((i) => i.id === id);
    if (idx === -1) {
      return { success: false, error: "Ingredient not found" };
    }

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ingredients.length) {
      return { success: true, data: undefined }; // no-op
    }

    // Swap display orders
    const current = ingredients[idx];
    const swap = ingredients[swapIdx];

    await prisma.$transaction([
      prisma.ingredient.update({
        where: { id: current.id },
        data: { displayOrder: swap.displayOrder },
      }),
      prisma.ingredient.update({
        where: { id: swap.id },
        data: { displayOrder: current.displayOrder },
      }),
    ]);

    return { success: true, data: undefined };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    const message =
      error instanceof Error ? error.message : "Failed to reorder ingredient";
    await logError({ context: "reorderIngredient", message });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
