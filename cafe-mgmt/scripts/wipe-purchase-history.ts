import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    const before = {
      lotConsumption: await prisma.lotConsumption.count(),
      ingredientPurchase: await prisma.ingredientPurchase.count(),
      inventoryCount: await prisma.inventoryCount.count(),
    };
    console.log("BEFORE:", JSON.stringify(before, null, 2));

    // Order matters: LotConsumption FK references IngredientPurchase.
    const lc = await prisma.lotConsumption.deleteMany();
    const ip = await prisma.ingredientPurchase.deleteMany();
    const ic = await prisma.inventoryCount.deleteMany();

    console.log(
      "DELETED:",
      JSON.stringify(
        {
          lotConsumption: lc.count,
          ingredientPurchase: ip.count,
          inventoryCount: ic.count,
        },
        null,
        2
      )
    );

    const after = {
      lotConsumption: await prisma.lotConsumption.count(),
      ingredientPurchase: await prisma.ingredientPurchase.count(),
      inventoryCount: await prisma.inventoryCount.count(),
    };
    console.log("AFTER:", JSON.stringify(after, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Wipe failed:", e);
  process.exit(1);
});
