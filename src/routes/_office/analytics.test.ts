import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
const source = readFileSync("src/routes/_office/analytics.tsx","utf8");
describe("Analytics overview safety and accessibility",()=>{
 it("does not present speculative counts as real data",()=>{
  expect(source).toContain("Live metrics not connected");
  expect(source).toContain("Data not connected");
  expect(source).toContain("No invented figures");
 });
 it("keeps existing Analytics file and skills access",()=>{
  expect(source).toContain('<OfficeFiles room="analytics"/>');
  expect(source).toContain('<RoomSkillsLink route="/analytics"/>');
 });
 it("supports mouse, keyboard, and screen reader drill-down",()=>{
  expect(source).toContain('type="button"');
  expect(source).toContain('role="dialog"');
  expect(source).toContain('aria-modal="true"');
  expect(source).toContain('event.key === "Escape"');
 });
 it("provides every approved section",()=>{
  for(const title of ["Spending & Budget","API Credits","Builder Performance","Projects & Launch","Time Management","Office Health","Efficiency & Improvements","Top Three Actions"]){
   expect(source).toContain(title);
  }
 });
});