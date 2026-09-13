import { resolveCatalogue, type CatalogueDoor, type OperatorIdentity } from "../shared/catalogue";
import { DOORS } from "../shared/doors";
const N: OperatorIdentity = { displayName: "Northwind Agency", legalName: "Northwind Agency s.r.o.", entity: "A marketing agency registered in Prague.", termsUrl: "https://northwind.example/terms", contact: "https://northwind.example/contact" };
const inner = resolveCatalogue(DOORS, null, { house: "adgrant-ai", mount: "" }) as CatalogueDoor[];
const hops = resolveCatalogue(inner, { identity: N, services: { "ad-grants": { mode: "white-label", offered: true } } }) as CatalogueDoor[];
const base = resolveCatalogue(DOORS, { identity: N, services: { "ad-grants": { mode: "white-label", offered: true } }, base: "adgrant-ai" }) as CatalogueDoor[];
const p = (r: CatalogueDoor[]) => r.find(d => d.id === "ad-grants")!;
console.log("hops path:", p(hops).path, "| base path:", p(base).path);
// ai-builds under white-label
const ab = resolveCatalogue(DOORS, { identity: N, services: { "ai-builds": { mode: "white-label", offered: true } }, base: "adgrant-ai" }) as CatalogueDoor[];
console.log("ai-builds blurb:", ab.find(d=>d.id==="ai-builds")!.blurb);
console.log("ai-builds entity:", ab.find(d=>d.id==="ai-builds")!.contract.entity);
// white-label door row under white-label
const wl = resolveCatalogue(DOORS, { identity: N, services: { "white-label": { mode: "white-label", offered: true } }, base: "adgrant-ai" }) as CatalogueDoor[];
console.log("white-label blurb:", wl.find(d=>d.id==="white-label")!.blurb);
