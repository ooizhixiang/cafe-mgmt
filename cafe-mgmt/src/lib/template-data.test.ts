import { describe, it, expect } from "vitest";
import { TEMPLATES, getTemplateById } from "./template-data";

describe("TEMPLATES", () => {
  it("has 3 templates", () => {
    expect(TEMPLATES).toHaveLength(3);
  });

  it("all templates have unique ids", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each template has ingredients, checklists, and suppliers", () => {
    for (const template of TEMPLATES) {
      expect(template.ingredients.length).toBeGreaterThan(0);
      expect(template.checklists).toHaveLength(3);
      expect(template.suppliers.length).toBeGreaterThan(0);
    }
  });

  it("each template has 3 checklists covering all periods", () => {
    for (const template of TEMPLATES) {
      const periods = template.checklists.map((c) => c.period).sort();
      expect(periods).toEqual(["CLOSING", "MID_DAY", "OPENING"]);
    }
  });

  it("each checklist has items", () => {
    for (const template of TEMPLATES) {
      for (const checklist of template.checklists) {
        expect(checklist.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("each ingredient has a name and unit", () => {
    for (const template of TEMPLATES) {
      for (const ingredient of template.ingredients) {
        expect(ingredient.name.length).toBeGreaterThan(0);
        expect(ingredient.unit.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getTemplateById", () => {
  it("returns template for valid id", () => {
    const result = getTemplateById("specialty-coffee");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Specialty Coffee");
  });

  it("returns undefined for invalid id", () => {
    expect(getTemplateById("nonexistent")).toBeUndefined();
  });
});
