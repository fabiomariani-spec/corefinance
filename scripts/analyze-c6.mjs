import { readFileSync } from "fs";
const data = JSON.parse(readFileSync("/tmp/c6-extract.json", "utf8"));
const items = data.items;
const charged = items.filter((it) => it.chargedThisMonth !== false);

console.log("itens:", items.length, "| charged:", charged.length);
console.log("soma charged:", charged.reduce((s, i) => s + i.amount, 0).toFixed(2));
console.log("totalAmount:", data.totalAmount);

const seen = new Map();
for (const it of charged) {
  const key = `${(it.description || "").toLowerCase().trim()}|${it.amount.toFixed(2)}`;
  if (!seen.has(key)) seen.set(key, []);
  seen.get(key).push(it);
}
console.log("\n=== DUPLICATAS (mesma descrição+valor, charged) ===");
let dupSum = 0;
for (const [k, arr] of seen) {
  if (arr.length > 1) {
    const amt = arr[0].amount;
    dupSum += amt * (arr.length - 1);
    console.log(`${arr.length}x  R$${amt.toFixed(2)}  ${k.split("|")[0].slice(0, 45)}  (datas: ${arr.map((x) => x.date).join(", ")})`);
  }
}
console.log("=> soma excedente por duplicata exata:", dupSum.toFixed(2));

console.log("\n=== 12 maiores itens charged ===");
[...charged].sort((a, b) => b.amount - a.amount).slice(0, 12).forEach((it) =>
  console.log(`R$${it.amount.toFixed(2)}  ${it.date}  ${(it.description || "").slice(0, 40)}`)
);

console.log("\n=== itens NÃO chargedThisMonth ===");
items.filter((it) => it.chargedThisMonth === false).forEach((it) =>
  console.log(`R$${it.amount.toFixed(2)}  ${it.date}  ${(it.description || "").slice(0, 45)}`)
);
