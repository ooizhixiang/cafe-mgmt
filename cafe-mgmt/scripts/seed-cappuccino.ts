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

  const espresso = await g("Espresso Powder (Brazil Minas Gerais Dark Roast)", "gm", 8);
  const fm = await g("Fresh Milk", "ml", 0);
  const om = await g("Oat Milk", "ml", 0);
  const cup = await g("Paper Cup 8oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Cappuccino (Hot)" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Cappuccino (Hot)", description: "Double shot espresso with steamed milk and foam", cafeId } });
  console.log("+ Recipe: Cappuccino (Hot)");

  // Base/Original
  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { recipeId: r.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.recipeStep.createMany({ data: [
    { recipeId: r.id, stepNumber: 1, instruction: "Put 2 shot espresso with the 200ml milk" },
    { recipeId: r.id, stepNumber: 2, instruction: "Steam it until the temperature reaches 60 degrees celsius" },
    { recipeId: r.id, stepNumber: 3, instruction: "Pour into the cup until half foam" },
    { recipeId: r.id, stepNumber: 4, instruction: "Add the remaining of it with milk until full" },
  ]});

  // Fresh Milk variation - RM 2.30
  const fv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Fresh Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: fv.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { variationId: fv.id, ingredientId: fm.id, quantityPerServing: 200, subtotalOverrideInCents: 30 },
    { variationId: fv.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: fv.id, stepNumber: 1, instruction: "Put 2 shot espresso with 200ml fresh milk" },
    { variationId: fv.id, stepNumber: 2, instruction: "Steam it until the temperature reaches 60 degrees celsius" },
    { variationId: fv.id, stepNumber: 3, instruction: "Pour into the cup until half foam" },
    { variationId: fv.id, stepNumber: 4, instruction: "Add the remaining of it with milk until full" },
  ]});
  console.log("+ Fresh Milk variation (RM 2.30)");

  // Oat Milk variation - RM 2.70
  const ov = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Oat Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ov.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { variationId: ov.id, ingredientId: om.id, quantityPerServing: 200, subtotalOverrideInCents: 70 },
    { variationId: ov.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: ov.id, stepNumber: 1, instruction: "Put 2 shot espresso with 200ml oat milk" },
    { variationId: ov.id, stepNumber: 2, instruction: "Steam it until the temperature reaches 60 degrees celsius" },
    { variationId: ov.id, stepNumber: 3, instruction: "Pour into the cup until half foam" },
    { variationId: ov.id, stepNumber: 4, instruction: "Add the remaining of it with milk until full" },
  ]});
  console.log("+ Oat Milk variation (RM 2.70)");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
