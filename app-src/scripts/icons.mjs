import fs from 'node:fs';
const names = process.argv.slice(2);
const out = {};
for (const n of names) {
  const s = fs.readFileSync(`node_modules/lucide-static/icons/${n}.svg`, 'utf8');
  const inner = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
  out[n] = inner;
}
fs.writeFileSync('src/ui/iconData.ts', '// Line icons from lucide-static (ISC license)\nexport const ICONS: Record<string, string> = ' + JSON.stringify(out, null, 0).replace(/","/g, '",\n"') + ';\n');
console.log(Object.keys(out).length, 'icons');
