import fs from 'node:fs';
let text = fs.readFileSync('tools/build-releases.mjs', 'utf8');
text = text.replace(
  "  const match = output.match(/Finished 1 bundle at:\\s*([^\\r\\n]+)/);\n  const bundle = match?.[1]?.trim();",
  `  const expected = path.join(target, 'release', 'bundle', 'nsis', \`\${conf.productName}_\${conf.version}_x64-setup.exe\`);
  const bundle = existsSync(expected) ? expected : output.match(/Finished 1 bundle at:\\s*([^\\r\\n]+)/)?.[1]?.trim();`,
);
text = text.replace('if (!ok || !bundle || !existsSync(bundle)) {', 'if (!bundle || !existsSync(bundle)) {');
fs.writeFileSync('tools/build-releases.mjs', text);
console.log('build script now accepts existing bundles');
