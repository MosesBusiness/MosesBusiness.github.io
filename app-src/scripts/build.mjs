// Bundles the app and writes one publishable page: dist/index.html (no doctype/html/head/body;
// the artifact host adds the skeleton). React loads from cdnjs as UMD globals.
import * as esbuild from 'esbuild';
import fs from 'node:fs';

const globals = {
  name: 'umd-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom\/client|-dom)?$/ }, a => ({ path: a.path, namespace: 'g' }));
    b.onLoad({ filter: /.*/, namespace: 'g' }, a => ({
      contents: a.path === 'react' ? 'module.exports = window.React' : 'module.exports = window.ReactDOM',
      loader: 'js',
    }));
  },
};

const r = await esbuild.build({
  entryPoints: ['src/main.tsx'], bundle: true, format: 'iife', write: false, minify: true,
  target: ['es2020', 'safari15'], jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  plugins: [globals], legalComments: 'none', charset: 'utf8',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/styles.css', 'utf8');
const html = `<title>הון שקט</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#0a1416">
<meta name="color-scheme" content="dark light">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Frank+Ruhl+Libre:wght@500;700;900&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<noscript>הון שקט צריך JavaScript כדי לפעול.</noscript>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(1) + ' KB');
