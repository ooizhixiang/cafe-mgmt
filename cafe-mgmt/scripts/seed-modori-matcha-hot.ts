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

  const modori = await g("Modori Matcha Powder", "gm", 33);
  const fm = await g("Fresh Milk", "ml", 0);
  const om = await g("Oat Milk", "ml", 0);
  const cup = await g("Paper Cup 8oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Modori Matcha (Hot)" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Modori Matcha (Hot)", description: "Whisked Modori matcha with steamed milk", cafeId } });
  console.log("+ Recipe: Modori Matcha (Hot)");

  // Fresh Milk - RM 2.30
  const fv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Fresh Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: fv.id, ingredientId: modori.id, quantityPerServing: 4, subtotalOverrideInCents: 130 },
    { variationId: fv.id, ingredientId: fm.id, quantityPerServing: 175, subtotalOverrideInCents: 30 },
    { variationId: fv.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: fv.id, stepNumber: 1, instruction: "In the whisking cup, add 5g Modori Matcha Powder" },
    { variationId: fv.id, stepNumber: 2, instruction: "Add 50ml of tap water" },
    { variationId: fv.id, stepNumber: 3, instruction: "Whisk the tap water and Modori powder together until smooth" },
    { variationId: fv.id, stepNumber: 4, instruction: "Pour the contents into the paper cup" },
    { variationId: fv.id, stepNumber: 5, instruction: "Add 175ml steamed fresh milk (at 60°C)" },
  ]});
  console.log("+ Fresh Milk variation (RM 2.30)");

  // Oat Milk - RM 2.70
  const ov = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Oat Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ov.id, ingredientId: modori.id, quantityPerServing: 4, subtotalOverrideInCents: 130 },
    { variationId: ov.id, ingredientId: om.id, quantityPerServing: 175, subtotalOverrideInCents: 70 },
    { variationId: ov.id, ingredientId: cup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: ov.id, stepNumber: 1, instruction: "In the whisking cup, add 5g Modori Matcha Powder" },
    { variationId: ov.id, stepNumber: 2, instruction: "Add 50ml of tap water" },
    { variationId: ov.id, stepNumber: 3, instruction: "Whisk the tap water and Modori powder together until smooth" },
    { variationId: ov.id, stepNumber: 4, instruction: "Pour the contents into the paper cup" },
    { variationId: ov.id, stepNumber: 5, instruction: "Add 175ml steamed oat milk (at 60°C)" },
  ]});
  console.log("+ Oat Milk variation (RM 2.70)");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
