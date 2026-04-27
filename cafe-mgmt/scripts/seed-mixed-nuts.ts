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

  const almond = await g("Almonds", "gm", 0);
  const cashew = await g("Cashews", "gm", 0);
  const walnut = await g("Walnuts", "gm", 0);
  const goldenRaisin = await g("Golden Raisins", "gm", 0);
  const cranberry = await g("Cranberries", "gm", 0);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Mixed Nuts" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({
    data: {
      name: "Mixed Nuts",
      description: "Healthy daily mix snack packs",
      notes: "Healthy Daily Mix: Almond + Cashew + Walnut + Golden Raisin\nCopy from Cashew Cranberry mix for base recipe",
      cafeId,
    }
  });
  console.log("+ Recipe: Mixed Nuts");

  // Healthy Daily Mix variation
  const hdm = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Healthy Daily Mix" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: hdm.id, ingredientId: almond.id, quantityPerServing: 1 },
    { variationId: hdm.id, ingredientId: cashew.id, quantityPerServing: 1 },
    { variationId: hdm.id, ingredientId: walnut.id, quantityPerServing: 1 },
    { variationId: hdm.id, ingredientId: goldenRaisin.id, quantityPerServing: 1 },
  ]});
  console.log("+ Healthy Daily Mix (Almond + Cashew + Walnut + Golden Raisin)");

  // Cashew Cranberry Mix variation
  const ccm = await prisma.recipeVariation.create({ data: { recipeId: r.id, name: "Cashew Cranberry Mix" } });
  await prisma.variationIngredient.createMany({ data: [
    { variationId: ccm.id, ingredientId: cashew.id, quantityPerServing: 1 },
    { variationId: ccm.id, ingredientId: cranberry.id, quantityPerServing: 1 },
  ]});
  console.log("+ Cashew Cranberry Mix");

  console.log("Done! Update quantities and costs in the recipe detail.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
