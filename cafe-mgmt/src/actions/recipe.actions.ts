"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { getCafeNow } from "@/lib/format";
import type { ActionResult } from "@/types";

// ─── Schemas ────────────────────────────────────────────────

const createRecipeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  servingSize: z.string().max(50).optional(),
  imageUrl: z.string().optional(),
});

const updateRecipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  servingSize: z.string().max(50).optional(),
  imageUrl: z.string().nullable().optional(),
});

const addIngredientSchema = z.object({
  recipeId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantityPerServing: z.number().int().min(1),
});

const addStepSchema = z.object({
  recipeId: z.string().min(1),
  instruction: z.string().min(1, "Instruction is required").max(500),
});

const updateStepSchema = z.object({
  id: z.string().min(1),
  instruction: z.string().min(1, "Instruction is required").max(500),
});

const reorderStepsSchema = z.object({
  recipeId: z.string().min(1),
  stepIds: z.array(z.string().min(1)).min(1),
});

// ─── Recipe CRUD (Story 4.3) ────────────────────────────────

export async function getRecipes(): Promise<
  ActionResult<
    Array<{
      id: string;
      name: string;
      description: string | null;
      ingredientCount: number;
      costPerServingInCents: number | null;
      category: string | null;
      discontinued: boolean;
    }>
  >
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const recipes = await prisma.recipe.findMany({
      where: { cafeId },
      include: {
        ingredients: {
          include: {
            ingredient: {
              select: { costPerUnitInCents: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return {
      success: true,
      data: recipes.map((r) => {
        const hasAllCosts = r.ingredients.every(
          (ri) => ri.subtotalOverrideInCents !== null || ri.ingredient.costPerUnitInCents !== null
        );
        const costPerServingInCents = hasAllCosts
          ? r.ingredients.reduce(
              (sum, ri) =>
                sum + (ri.subtotalOverrideInCents ?? ri.quantityPerServing * (ri.ingredient.costPerUnitInCents ?? 0)),
              0
            )
          : null;

        return {
          id: r.id,
          name: r.name,
          description: r.description,
          ingredientCount: r.ingredients.length,
          costPerServingInCents,
          category: r.category,
          discontinued: r.discontinued,
        };
      }),
    };
  } catch {
    return { success: false, error: "Failed to load recipes" };
  }
}

export async function getRecipe(
  id: string
): Promise<
  ActionResult<{
    id: string;
    name: string;
    description: string | null;
    servingSize: string | null;
    imageUrl: string | null;
    notes: string | null;
    category: string | null;
    sellingPriceInCents: number | null;
    discontinued: boolean;
    ingredients: Array<{
      id: string;
      ingredientId: string;
      ingredientName: string;
      unit: string;
      quantityPerServing: number;
      costPerUnitInCents: number | null;
      subtotalOverrideInCents: number | null;
      currentStock: number | null;
      lowStockThreshold: number | null;
    }>;
    steps: Array<{
      id: string;
      stepNumber: number;
      instruction: string;
    }>;
    variations: Array<{
      id: string;
      name: string;
      sellingPriceInCents: number | null;
      ingredients: Array<{
        id: string;
        ingredientId: string;
        ingredientName: string;
        unit: string;
        quantityPerServing: number;
        costPerUnitInCents: number | null;
        subtotalOverrideInCents: number | null;
      }>;
      steps: Array<{
        id: string;
        stepNumber: number;
        instruction: string;
      }>;
    }>;
    costPerServingInCents: number | null;
  }>
> {
  try {
    const session = await requireAuth();
    const cafeId = session.user.cafeId;

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { timezone: true },
    });
    if (!cafe) return { success: false, error: "Cafe not found" };

    const today = getCafeNow(cafe.timezone);
    today.setHours(0, 0, 0, 0);

    const recipe = await prisma.recipe.findFirst({
      where: { id, cafeId },
      include: {
        ingredients: {
          include: {
            ingredient: {
              select: {
                name: true,
                unit: true,
                costPerUnitInCents: true,
                lowStockThreshold: true,
                inventoryCounts: {
                  where: { countDate: today },
                  select: { quantity: true },
                  take: 1,
                },
              },
            },
          },
        },
        steps: {
          orderBy: { stepNumber: "asc" },
        },
        variations: {
          include: {
            ingredients: {
              include: {
                ingredient: { select: { name: true, unit: true, costPerUnitInCents: true } },
              },
            },
            steps: {
              orderBy: { stepNumber: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!recipe) return { success: false, error: "Recipe not found" };

    const hasAllCosts = recipe.ingredients.every(
      (ri) => ri.subtotalOverrideInCents !== null || ri.ingredient.costPerUnitInCents !== null
    );
    const costPerServingInCents = hasAllCosts
      ? recipe.ingredients.reduce(
          (sum, ri) =>
            sum + (ri.subtotalOverrideInCents ?? ri.quantityPerServing * (ri.ingredient.costPerUnitInCents ?? 0)),
          0
        )
      : null;

    return {
      success: true,
      data: {
        id: recipe.id,
        name: recipe.name,
        description: recipe.description,
        servingSize: recipe.servingSize,
        imageUrl: recipe.imageUrl,
        notes: recipe.notes,
        category: recipe.category,
        sellingPriceInCents: recipe.sellingPriceInCents,
        discontinued: recipe.discontinued,
        ingredients: recipe.ingredients.map((ri) => ({
          id: ri.id,
          ingredientId: ri.ingredientId,
          ingredientName: ri.ingredient.name,
          unit: ri.ingredient.unit,
          quantityPerServing: ri.quantityPerServing,
          costPerUnitInCents: ri.ingredient.costPerUnitInCents,
          subtotalOverrideInCents: ri.subtotalOverrideInCents,
          currentStock: ri.ingredient.inventoryCounts[0]?.quantity ?? null,
          lowStockThreshold: ri.ingredient.lowStockThreshold,
        })),
        steps: recipe.steps.map((s) => ({
          id: s.id,
          stepNumber: s.stepNumber,
          instruction: s.instruction,
        })),
        variations: recipe.variations.map((v) => ({
          id: v.id,
          name: v.name,
          sellingPriceInCents: v.sellingPriceInCents,
          ingredients: v.ingredients.map((vi) => ({
            id: vi.id,
            ingredientId: vi.ingredientId,
            ingredientName: vi.ingredient.name,
            unit: vi.ingredient.unit,
            quantityPerServing: vi.quantityPerServing,
            costPerUnitInCents: vi.ingredient.costPerUnitInCents,
            subtotalOverrideInCents: vi.subtotalOverrideInCents,
          })),
          steps: v.steps.map((s) => ({
            id: s.id,
            stepNumber: s.stepNumber,
            instruction: s.instruction,
          })),
        })),
        costPerServingInCents,
      },
    };
  } catch {
    return { success: false, error: "Failed to load recipe" };
  }
}

export async function createRecipe(
  input: z.infer<typeof createRecipeSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = createRecipeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const recipe = await prisma.recipe.create({
      data: {
        cafeId: session.user.cafeId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        servingSize: parsed.data.servingSize ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
      },
    });

    return { success: true, data: { id: recipe.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to create recipe" };
  }
}

export async function updateRecipe(
  input: z.infer<typeof updateRecipeSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = updateRecipeSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const existing = await prisma.recipe.findFirst({
      where: { id: parsed.data.id, cafeId: session.user.cafeId },
    });
    if (!existing) return { success: false, error: "Recipe not found" };

    await prisma.recipe.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        servingSize: parsed.data.servingSize ?? null,
        ...(parsed.data.imageUrl !== undefined && { imageUrl: parsed.data.imageUrl }),
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update recipe" };
  }
}

export async function deleteRecipe(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const existing = await prisma.recipe.findFirst({
      where: { id, cafeId: session.user.cafeId },
    });
    if (!existing) return { success: false, error: "Recipe not found" };

    await prisma.recipe.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete recipe" };
  }
}

export async function updateSellingPrice(
  id: string,
  sellingPriceInCents: number | null,
  type: "recipe" | "variation" = "recipe"
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    if (type === "variation") {
      await prisma.recipeVariation.update({ where: { id }, data: { sellingPriceInCents } });
    } else {
      await prisma.recipe.update({ where: { id }, data: { sellingPriceInCents } });
    }
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to update price" };
  }
}

export async function updateRecipeCategory(
  id: string,
  category: string | null
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const recipe = await prisma.recipe.findFirst({ where: { id, cafeId: session.user.cafeId } });
    if (!recipe) return { success: false, error: "Recipe not found" };
    await prisma.recipe.update({ where: { id }, data: { category } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to update category" };
  }
}

export async function updateRecipeNotes(
  id: string,
  notes: string | null
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const recipe = await prisma.recipe.findFirst({ where: { id, cafeId: session.user.cafeId } });
    if (!recipe) return { success: false, error: "Recipe not found" };
    await prisma.recipe.update({ where: { id }, data: { notes } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") return { success: false, error: "Unauthorized" };
    return { success: false, error: "Failed to update notes" };
  }
}

export async function toggleDiscontinued(id: string): Promise<ActionResult<{ discontinued: boolean }>> {
  try {
    const session = await requireRole("MANAGER");
    const recipe = await prisma.recipe.findFirst({
      where: { id, cafeId: session.user.cafeId },
      select: { discontinued: true },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    const updated = await prisma.recipe.update({
      where: { id },
      data: { discontinued: !recipe.discontinued },
      select: { discontinued: true },
    });
    return { success: true, data: { discontinued: updated.discontinued } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update recipe" };
  }
}

// ─── Recipe Ingredients ─────────────────────────────────────

export async function addRecipeIngredient(
  input: z.infer<typeof addIngredientSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const cafeId = session.user.cafeId;
    const parsed = addIngredientSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    // Verify recipe and ingredient belong to cafe
    const [recipe, ingredient] = await Promise.all([
      prisma.recipe.findFirst({ where: { id: parsed.data.recipeId, cafeId } }),
      prisma.ingredient.findFirst({ where: { id: parsed.data.ingredientId, cafeId } }),
    ]);
    if (!recipe) return { success: false, error: "Recipe not found" };
    if (!ingredient) return { success: false, error: "Ingredient not found" };

    const ri = await prisma.recipeIngredient.create({
      data: {
        recipeId: parsed.data.recipeId,
        ingredientId: parsed.data.ingredientId,
        quantityPerServing: parsed.data.quantityPerServing,
      },
    });

    return { success: true, data: { id: ri.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add ingredient" };
  }
}

export async function removeRecipeIngredient(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const ri = await prisma.recipeIngredient.findUnique({
      where: { id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!ri || ri.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Not found" };
    }

    await prisma.recipeIngredient.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to remove ingredient" };
  }
}

// ─── Recipe Steps ───────────────────────────────────────────

export async function addRecipeStep(
  input: z.infer<typeof addStepSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = addStepSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId: session.user.cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    const maxStep = await prisma.recipeStep.aggregate({
      where: { recipeId: parsed.data.recipeId },
      _max: { stepNumber: true },
    });

    const step = await prisma.recipeStep.create({
      data: {
        recipeId: parsed.data.recipeId,
        stepNumber: (maxStep._max.stepNumber ?? 0) + 1,
        instruction: parsed.data.instruction,
      },
    });

    return { success: true, data: { id: step.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add step" };
  }
}

export async function updateRecipeStep(
  input: z.infer<typeof updateStepSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = updateStepSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const step = await prisma.recipeStep.findUnique({
      where: { id: parsed.data.id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!step || step.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Step not found" };
    }

    await prisma.recipeStep.update({
      where: { id: parsed.data.id },
      data: { instruction: parsed.data.instruction },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update step" };
  }
}

export async function deleteRecipeStep(id: string): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const step = await prisma.recipeStep.findUnique({
      where: { id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!step || step.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Step not found" };
    }

    await prisma.recipeStep.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete step" };
  }
}

export async function reorderRecipeSteps(
  input: z.infer<typeof reorderStepsSchema>
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = reorderStepsSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input" };
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId: session.user.cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    await prisma.$transaction(
      parsed.data.stepIds.map((stepId, index) =>
        prisma.recipeStep.update({
          where: { id: stepId },
          data: { stepNumber: index + 1 },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to reorder steps" };
  }
}

export async function updateSubtotalOverride(
  recipeIngredientId: string,
  subtotalOverrideInCents: number | null
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.recipeIngredient.update({
      where: { id: recipeIngredientId },
      data: { subtotalOverrideInCents },
    });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update subtotal" };
  }
}

export async function updateVariationSubtotalOverride(
  variationIngredientId: string,
  subtotalOverrideInCents: number | null
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationIngredient.update({
      where: { id: variationIngredientId },
      data: { subtotalOverrideInCents },
    });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update subtotal" };
  }
}

// ─── Variation CRUD ─────────────────────────────────────────

const createVariationSchema = z.object({
  recipeId: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100),
  duplicateFromId: z.string().optional(),
});

const addVariationIngredientSchema = z.object({
  variationId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantityPerServing: z.number().int().min(1),
});

export async function createVariation(
  input: z.infer<typeof createVariationSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = createVariationSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const recipe = await prisma.recipe.findFirst({
      where: { id: parsed.data.recipeId, cafeId: session.user.cafeId },
    });
    if (!recipe) return { success: false, error: "Recipe not found" };

    const variation = await prisma.$transaction(async (tx) => {
      const v = await tx.recipeVariation.create({
        data: {
          recipeId: parsed.data.recipeId,
          name: parsed.data.name,
        },
      });

      // Duplicate ingredients and steps from source
      if (parsed.data.duplicateFromId) {
        const source = parsed.data.duplicateFromId;

        if (source === "__base__") {
          // Duplicate from base recipe
          const baseIngs = await tx.recipeIngredient.findMany({ where: { recipeId: parsed.data.recipeId } });
          const baseSteps = await tx.recipeStep.findMany({ where: { recipeId: parsed.data.recipeId }, orderBy: { stepNumber: "asc" } });
          for (const ing of baseIngs) {
            await tx.variationIngredient.create({ data: { variationId: v.id, ingredientId: ing.ingredientId, quantityPerServing: ing.quantityPerServing } });
          }
          for (const step of baseSteps) {
            await tx.variationStep.create({ data: { variationId: v.id, instruction: step.instruction, stepNumber: step.stepNumber } });
          }
        } else {
          // Duplicate from another variation
          const srcIngs = await tx.variationIngredient.findMany({ where: { variationId: source } });
          const srcSteps = await tx.variationStep.findMany({ where: { variationId: source }, orderBy: { stepNumber: "asc" } });
          for (const ing of srcIngs) {
            await tx.variationIngredient.create({ data: { variationId: v.id, ingredientId: ing.ingredientId, quantityPerServing: ing.quantityPerServing } });
          }
          for (const step of srcSteps) {
            await tx.variationStep.create({ data: { variationId: v.id, instruction: step.instruction, stepNumber: step.stepNumber } });
          }
        }
      }

      return v;
    });

    return { success: true, data: { id: variation.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to create variation" };
  }
}

export async function deleteVariation(
  id: string
): Promise<ActionResult<void>> {
  try {
    const session = await requireRole("MANAGER");

    const variation = await prisma.recipeVariation.findUnique({
      where: { id },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!variation || variation.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Variation not found" };
    }

    await prisma.recipeVariation.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete variation" };
  }
}

export async function addVariationIngredient(
  input: z.infer<typeof addVariationIngredientSchema>
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("MANAGER");
    const parsed = addVariationIngredientSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }

    const variation = await prisma.recipeVariation.findUnique({
      where: { id: parsed.data.variationId },
      include: { recipe: { select: { cafeId: true } } },
    });
    if (!variation || variation.recipe.cafeId !== session.user.cafeId) {
      return { success: false, error: "Variation not found" };
    }

    const ingredient = await prisma.ingredient.findFirst({
      where: { id: parsed.data.ingredientId, cafeId: session.user.cafeId },
    });
    if (!ingredient) return { success: false, error: "Ingredient not found" };

    const vi = await prisma.variationIngredient.create({
      data: {
        variationId: parsed.data.variationId,
        ingredientId: parsed.data.ingredientId,
        quantityPerServing: parsed.data.quantityPerServing,
      },
    });

    return { success: true, data: { id: vi.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add variation ingredient" };
  }
}

export async function removeVariationIngredient(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationIngredient.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to remove variation ingredient" };
  }
}

export async function addVariationStep(
  input: { variationId: string; instruction: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole("MANAGER");
    const maxStep = await prisma.variationStep.findFirst({
      where: { variationId: input.variationId },
      orderBy: { stepNumber: "desc" },
      select: { stepNumber: true },
    });
    const step = await prisma.variationStep.create({
      data: {
        variationId: input.variationId,
        instruction: input.instruction,
        stepNumber: (maxStep?.stepNumber ?? 0) + 1,
      },
    });
    return { success: true, data: { id: step.id } };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to add step" };
  }
}

export async function deleteVariationStep(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationStep.delete({ where: { id } });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to delete step" };
  }
}

export async function updateVariationStep(
  input: { id: string; instruction: string }
): Promise<ActionResult<void>> {
  try {
    await requireRole("MANAGER");
    await prisma.variationStep.update({
      where: { id: input.id },
      data: { instruction: input.instruction },
    });
    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return { success: false, error: "Unauthorized" };
    }
    return { success: false, error: "Failed to update step" };
  }
}
