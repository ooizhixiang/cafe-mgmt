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

  const modori = await g("Modori Matcha Powder", "gm", 33); // 2.00/6g ≈ 33 cents/g
  const fm = await g("Fresh Milk", "ml", 0);
  const om = await g("Oat Milk", "ml", 0);
  const ice = await g("Ice", "cup", 20);
  const plasticCup = await g("Plastic Cup 12oz", "pcs", 50);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Modori Matcha (Ice)" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({ data: { name: "Modori Matcha (Ice)", description: "Whisked Modori matcha with milk over ice", cafeId } });
  console.log("+ Recipe: Modori Matcha (Ice)");

  // Fresh Milk - RM 3.00
  const fv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Fresh Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: fv.id, ingredientId: modori.id, quantityPerServing: 6, subtotalOverrideInCents: 200 },
    { variationId: fv.id, ingredientId: fm.id, quantityPerServing: 200, subtotalOverrideInCents: 30 },
    { variationId: fv.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { variationId: fv.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: fv.id, stepNumber: 1, instruction: "In the whisking cup, add 6g Modori Matcha Powder" },
    { variationId: fv.id, stepNumber: 2, instruction: "Add 50ml of fresh milk" },
    { variationId: fv.id, stepNumber: 3, instruction: "Whisk the fresh milk and Modori powder together until smooth" },
    { variationId: fv.id, stepNumber: 4, instruction: "Add half cup ice into plastic cup" },
    { variationId: fv.id, stepNumber: 5, instruction: "Pour the matcha and the milk into the cup containing ice" },
  ]});
  console.log("+ Fresh Milk variation (RM 3.00)");

  // Oat Milk - RM 3.40
  const ov = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Oat Milk" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ov.id, ingredientId: modori.id, quantityPerServing: 6, subtotalOverrideInCents: 200 },
    { variationId: ov.id, ingredientId: om.id, quantityPerServing: 200, subtotalOverrideInCents: 70 },
    { variationId: ov.id, ingredientId: ice.id, quantityPerServing: 1, subtotalOverrideInCents: 20 },
    { variationId: ov.id, ingredientId: plasticCup.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
  ]});
  await prisma.variationStep.createMany({ data: [
    { variationId: ov.id, stepNumber: 1, instruction: "In the whisking cup, add 6g Modori Matcha Powder" },
    { variationId: ov.id, stepNumber: 2, instruction: "Add 50ml of oat milk" },
    { variationId: ov.id, stepNumber: 3, instruction: "Whisk the oat milk and Modori powder together until smooth" },
    { variationId: ov.id, stepNumber: 4, instruction: "Add half cup ice into plastic cup" },
    { variationId: ov.id, stepNumber: 5, instruction: "Pour the matcha and the milk into the cup containing ice" },
  ]});
  console.log("+ Oat Milk variation (RM 3.40)");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
