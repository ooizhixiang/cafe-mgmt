import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const cafe = await prisma.cafe.findFirst();
  if (!cafe) { console.log("No cafe"); return; }
  const cafeId = cafe.id;
  console.log("Cafe:", cafe.name);

  // Get or create ingredients
  async function g(name: string, unit: string, costCents: number) {
    let i = await prisma.ingredient.findFirst({ where: { cafeId, name } });
    if (!i) {
      const mx = await prisma.ingredient.findFirst({ where: { cafeId }, orderBy: { displayOrder: "desc" }, select: { displayOrder: true } });
      i = await prisma.ingredient.create({ data: { name, unit, cafeId, displayOrder: (mx?.displayOrder ?? 0) + 1, costPerUnitInCents: costCents } });
      console.log("+ " + name);
    }
    return i;
  }

  const choc = await g("Chocolate Devon", "gm", 6);
  const fm = await g("Fresh Milk", "ml", 0);
  const om = await g("Oat Milk", "ml", 0);
  const ice = await g("Ice", "cup", 20);
  const plasticCup = await g("Plastic Cup 12oz", "pcs", 50);

  // Check if recipe exists
  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Iced Chocolate" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Iced Chocolate", description: "Blended chocolate drink with ice", cafeId } });
  console.log("+ Recipe: Iced Chocolate");

  // Base/Original - shared base ingredients
  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: choc.id, quantityPerServing: 25, subtotalOverrideInCents: 138 },
    { recipeId: r.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { recipeId: r.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.recipeStep.createMany({ data: [
    { recipeId: r.id, stepNumber: 1, instruction: "25g Devon Chocolate powder into a blender" },
    { recipeId: r.id, stepNumber: 2, instruction: "Mix 175ml milk together with chocolate in the blender" },
    { recipeId: r.id, stepNumber: 3, instruction: "Blend it for 1 minute" },
    { recipeId: r.id, stepNumber: 4, instruction: "Add ice until the 12oz plastic cup is filled" },
  ]});

  // Fresh Milk variation - RM 2.38
  const fv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Fresh Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: fv.id, ingredientId: choc.id, quantityPerServing: 25, subtotalOverrideInCents: 138 },
    { variationId: fv.id, ingredientId: fm.id, quantityPerServing: 175, subtotalOverrideInCents: 30 },
    { variationId: fv.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { variationId: fv.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: fv.id, stepNumber: 1, instruction: "25g Devon Chocolate powder into a blender" },
    { variationId: fv.id, stepNumber: 2, instruction: "Mix 175ml fresh milk together with chocolate in the blender" },
    { variationId: fv.id, stepNumber: 3, instruction: "Blend it for 1 minute" },
    { variationId: fv.id, stepNumber: 4, instruction: "Add ice until the 12oz plastic cup is filled" },
  ]});
  console.log("+ Fresh Milk variation (RM 2.38)");

  // Oat Milk variation - RM 2.50
  const ov = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Oat Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ov.id, ingredientId: choc.id, quantityPerServing: 25, subtotalOverrideInCents: 138 },
    { variationId: ov.id, ingredientId: om.id, quantityPerServing: 175, subtotalOverrideInCents: 70 },
    { variationId: ov.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { variationId: ov.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: ov.id, stepNumber: 1, instruction: "25g Devon Chocolate powder into a blender" },
    { variationId: ov.id, stepNumber: 2, instruction: "Mix 175ml oat milk together with chocolate in the blender" },
    { variationId: ov.id, stepNumber: 3, instruction: "Blend it for 1 minute" },
    { variationId: ov.id, stepNumber: 4, instruction: "Add ice until the 12oz plastic cup is filled" },
  ]});
  console.log("+ Oat Milk variation (RM 2.50)");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
