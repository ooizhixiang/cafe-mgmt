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
  const cup = await g("Paper Cup 8oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Latte (Hot)" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Latte (Hot)", description: "Double shot espresso with steamed milk and foam", cafeId } });
  console.log("+ Recipe: Latte (Hot)");

  // NO original — only Fresh Milk and Oat Milk variations

  // Fresh Milk variation - RM 2.40
  const fv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Fresh Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: fv.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { variationId: fv.id, ingredientId: fm.id, quantityPerServing: 200, subtotalOverrideInCents: 30 },
    { variationId: fv.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: fv.id, stepNumber: 1, instruction: "Add 2 shot espresso in a paper cup" },
    { variationId: fv.id, stepNumber: 2, instruction: "Add steamed 200ml fresh milk into a cup (temperature is 60°C)" },
    { variationId: fv.id, stepNumber: 3, instruction: "Pour 2 quarter of foam into the cup with everything" },
  ]});
  console.log("+ Fresh Milk variation (RM 2.40)");

  // Oat Milk variation - RM 2.80
  const ov = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Oat Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ov.id, ingredientId: espresso.id, quantityPerServing: 18, subtotalOverrideInCents: 150 },
    { variationId: ov.id, ingredientId: om.id, quantityPerServing: 200, subtotalOverrideInCents: 70 },
    { variationId: ov.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: ov.id, stepNumber: 1, instruction: "Add 2 shot espresso in a paper cup" },
    { variationId: ov.id, stepNumber: 2, instruction: "Add steamed 200ml oat milk into a cup (temperature is 60°C)" },
    { variationId: ov.id, stepNumber: 3, instruction: "Pour 2 quarter of foam into the cup with everything" },
  ]});
  console.log("+ Oat Milk variation (RM 2.80)");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
