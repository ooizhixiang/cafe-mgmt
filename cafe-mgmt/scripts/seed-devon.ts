import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const cafe = await prisma.cafe.findFirst();
  if (!cafe) { console.log("No cafe - register first"); return; }
  console.log("Cafe:", cafe.name);
  const cafeId = cafe.id;

  async function g(name: string, unit: string, cost: number) {
    let i = await prisma.ingredient.findFirst({ where: { cafeId, name } });
    if (!i) {
      const mx = await prisma.ingredient.findFirst({ where: { cafeId }, orderBy: { displayOrder: "desc" }, select: { displayOrder: true } });
      i = await prisma.ingredient.create({ data: { name, unit, cafeId, displayOrder: (mx?.displayOrder ?? 0) + 1, costPerUnitInCents: cost } });
      console.log("+ " + name);
    }
    return i;
  }

  const choc = await g("Chocolate Devon", "gm", 6);
  const fm = await g("Fresh Milk", "ml", 0);
  const om = await g("Oat Milk", "ml", 0);
  const cup = await g("Paper Cup 8oz", "pcs", 50);
  const hw = await g("Hot Water", "ml", 0);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Devon Chocolate" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Devon Chocolate", description: "Rich chocolate drink with steamed milk", cafeId } });
  console.log("+ Recipe: Devon Chocolate");

  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: choc.id, quantityPerServing: 25, subtotalOverrideInCents: 110 },
    { recipeId: r.id, ingredientId: hw.id, quantityPerServing: 30 },
    { recipeId: r.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.recipeStep.createMany({ data: [
    { recipeId: r.id, stepNumber: 1, instruction: "25g Devon Chocolate powder into a cup" },
    { recipeId: r.id, stepNumber: 2, instruction: "Add Hot Water 30ml into the cup" },
    { recipeId: r.id, stepNumber: 3, instruction: "Mix together" },
  ]});

  const fv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Fresh Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: fv.id, ingredientId: choc.id, quantityPerServing: 25, subtotalOverrideInCents: 110 },
    { variationId: fv.id, ingredientId: fm.id, quantityPerServing: 175, subtotalOverrideInCents: 30 },
    { variationId: fv.id, ingredientId: hw.id, quantityPerServing: 30 },
    { variationId: fv.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: fv.id, stepNumber: 1, instruction: "25g Devon Chocolate powder into a cup" },
    { variationId: fv.id, stepNumber: 2, instruction: "Add Hot Water 30ml into the cup" },
    { variationId: fv.id, stepNumber: 3, instruction: "Mix together" },
    { variationId: fv.id, stepNumber: 4, instruction: "Fresh Milk 175ml" },
    { variationId: fv.id, stepNumber: 5, instruction: "Use espresso machine to steam together" },
  ]});
  console.log("+ Fresh Milk variation (RM 2.10)");

  const ov = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Oat Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ov.id, ingredientId: choc.id, quantityPerServing: 25, subtotalOverrideInCents: 110 },
    { variationId: ov.id, ingredientId: om.id, quantityPerServing: 175, subtotalOverrideInCents: 70 },
    { variationId: ov.id, ingredientId: hw.id, quantityPerServing: 30 },
    { variationId: ov.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: ov.id, stepNumber: 1, instruction: "25g Devon Chocolate powder into a cup" },
    { variationId: ov.id, stepNumber: 2, instruction: "Add Hot Water 30ml into the cup" },
    { variationId: ov.id, stepNumber: 3, instruction: "Mix together" },
    { variationId: ov.id, stepNumber: 4, instruction: "Oat Milk 175ml" },
    { variationId: ov.id, stepNumber: 5, instruction: "Use espresso machine to steam together" },
  ]});
  console.log("+ Oat Milk variation (RM 2.50)");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
