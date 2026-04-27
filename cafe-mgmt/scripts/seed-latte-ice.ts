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

  async function g(name: string, unit: string, costCents: number) {
    let i = await prisma.ingredient.findFirst({ where: { cafeId, name } });
    if (!i) {
      const mx = await prisma.ingredient.findFirst({ where: { cafeId }, orderBy: { displayOrder: "desc" }, select: { displayOrder: true } });
      i = await prisma.ingredient.create({ data: { name, unit, cafeId, displayOrder: (mx?.displayOrder ?? 0) + 1, costPerUnitInCents: costCents } });
      console.log("+ " + name);
    }
    return i;
  }

  const espresso = await g("Espresso Blend", "gm", 8);
  const fm = await g("Fresh Milk", "ml", 0);
  const om = await g("Oat Milk", "ml", 0);
  const ice = await g("Ice", "cup", 20);
  const plasticCup = await g("Plastic Cup 12oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Latte (Ice)" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Latte (Ice)", description: "Iced latte with fresh or oat milk", cafeId } });
  console.log("+ Recipe: Latte (Ice)");

  // No original — only variations

  // Fresh Milk - RM 2.50
  const fv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Fresh Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: fv.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { variationId: fv.id, ingredientId: fm.id, quantityPerServing: 200, subtotalOverrideInCents: 30 },
    { variationId: fv.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { variationId: fv.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: fv.id, stepNumber: 1, instruction: "Add 2 shot espresso in a plastic cup" },
    { variationId: fv.id, stepNumber: 2, instruction: "Add 200ml fresh milk into the cup" },
    { variationId: fv.id, stepNumber: 3, instruction: "Add half cup of ice" },
  ]});
  console.log("+ Fresh Milk variation (RM 2.50)");

  // Oat Milk - RM 2.90
  const ov = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Oat Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ov.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { variationId: ov.id, ingredientId: om.id, quantityPerServing: 200, subtotalOverrideInCents: 70 },
    { variationId: ov.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { variationId: ov.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: ov.id, stepNumber: 1, instruction: "Add 2 shot espresso in a plastic cup" },
    { variationId: ov.id, stepNumber: 2, instruction: "Add 200ml oat milk into the cup" },
    { variationId: ov.id, stepNumber: 3, instruction: "Add half cup of ice" },
  ]});
  console.log("+ Oat Milk variation (RM 2.90)");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
