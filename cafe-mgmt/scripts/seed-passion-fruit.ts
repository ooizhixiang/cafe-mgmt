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

  const passionFruit = await g("Passion Fruit", "pcs", 0);
  const bottle = await g("Bottle 300ml", "pcs", 100);

  let r = await prisma.recipe.findFirst({ where: { cafeId, name: "Passion Fruit Juice" } });
  if (r) { console.log("Already exists"); return; }

  r = await prisma.recipe.create({
    data: {
      name: "Passion Fruit Juice",
      description: "Fresh passion fruit juice",
      notes: "Batch makes 30 bottles\nTotal cost per bottle: RM 3.23",
      cafeId,
    }
  });
  console.log("+ Recipe: Passion Fruit Juice");

  // RM 3.23 per serving: fruit RM 2.23 + bottle RM 1.00
  await prisma.recipeIngredient.createMany({ data: [
    { recipeId: r.id, ingredientId: passionFruit.id, quantityPerServing: 1, subtotalOverrideInCents: 223 },
    { recipeId: r.id, ingredientId: bottle.id, quantityPerServing: 1, subtotalOverrideInCents: 100 },
  ]});

  console.log("Total cost: RM 3.23");
  console.log("Done!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
