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

  const lime = await g("Fresh Lime", "pcs", 0);
  const ginger = await g("Fresh Ginger", "gm", 0);
  const bottle = await g("Bottle 300ml", "pcs", 100);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Fresh Lime & Ginger Juice" } });
  if (r) { console.log("Already exists"); return; }

  // Total cost RM 1.50 per serving, 20 bottles per batch
  r = await prisma.recipe.create({
    data: {
      name: "Fresh Lime & Ginger Juice",
      description: "Fresh pressed lime and ginger juice",
      notes: "Batch makes 20 bottles\nTotal batch cost: RM 30.00 (RM 1.50 per bottle)",
      cafeId,
    }
  });
  console.log("+ Recipe: Fresh Lime & Ginger Juice");

  // Lime variant
  const lv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Lime" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: lv.id, ingredientId: lime.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
    { variationId: lv.id, ingredientId: bottle.id, quantityPerServing: 1, subtotalOverrideInCents: 100 },
  ]});
  console.log("+ Lime variation (RM 1.50)");

  // Ginger variant
  const gv = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Ginger" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: gv.id, ingredientId: ginger.id, quantityPerServing: 1, subtotalOverrideInCents: 50 },
    { variationId: gv.id, ingredientId: bottle.id, quantityPerServing: 1, subtotalOverrideInCents: 100 },
  ]});
  console.log("+ Ginger variation (RM 1.50)");

  console.log("Total cost per bottle: RM 1.50");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
