import sharp from "sharp";

const svg = String.raw`
<svg xmlns="http://www.w3.org/2000/svg" width="620" height="760" viewBox="0 0 620 760">
  <rect width="620" height="760" fill="#ffffff"/>
  <text x="310" y="60" font-family="monospace" font-size="30" text-anchor="middle" font-weight="bold">TESCO SUPERSTORE</text>
  <text x="310" y="95" font-family="monospace" font-size="18" text-anchor="middle">12 High Street, London</text>
  <text x="310" y="118" font-family="monospace" font-size="18" text-anchor="middle">2026-09-11 14:32</text>
  <line x1="20" y1="140" x2="600" y2="140" stroke="#000" stroke-width="2"/>
  <text x="30" y="175" font-family="monospace" font-size="20">Semi Skimmed Milk 4pt</text>
  <text x="520" y="175" font-family="monospace" font-size="20" text-anchor="end">2.10</text>
  <text x="30" y="205" font-family="monospace" font-size="20">Wholemeal Bread 800g</text>
  <text x="520" y="205" font-family="monospace" font-size="20" text-anchor="end">1.50</text>
  <text x="30" y="235" font-family="monospace" font-size="20">Free Range Eggs x12</text>
  <text x="520" y="235" font-family="monospace" font-size="20" text-anchor="end">3.20</text>
  <text x="30" y="265" font-family="monospace" font-size="20">Ground Coffee 500g</text>
  <text x="520" y="265" font-family="monospace" font-size="20" text-anchor="end">4.75</text>
  <text x="30" y="295" font-family="monospace" font-size="20">Bananas 1.2kg</text>
  <text x="520" y="295" font-family="monospace" font-size="20" text-anchor="end">1.45</text>
  <text x="30" y="325" font-family="monospace" font-size="20">Still Water 500ml</text>
  <text x="520" y="325" font-family="monospace" font-size="20" text-anchor="end">0.60</text>
  <line x1="20" y1="355" x2="600" y2="355" stroke="#000" stroke-width="2"/>
  <text x="420" y="390" font-family="monospace" font-size="22" font-weight="bold">TOTAL</text>
  <text x="560" y="390" font-family="monospace" font-size="22" font-weight="bold" text-anchor="end">GBP 13.60</text>
  <text x="420" y="420" font-family="monospace" font-size="18">CARD</text>
  <text x="560" y="420" font-family="monospace" font-size="18" text-anchor="end">XXXX 1234</text>
  <line x1="20" y1="445" x2="600" y2="445" stroke="#000" stroke-width="2"/>
  <text x="310" y="480" font-family="monospace" font-size="18" text-anchor="middle">VAT Reg 123 4567 89</text>
  <text x="310" y="505" font-family="monospace" font-size="18" text-anchor="middle">Thank you for shopping with us</text>
</svg>
`;

async function main(): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile("e2e-receipt.png");
  console.log("wrote e2e-receipt.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});