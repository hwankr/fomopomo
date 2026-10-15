import assert from 'node:assert/strict';

// Run against a built app or the production deployment. No login is required.
const base = new URL(process.argv[2] ?? 'http://localhost:3000');
const origin = 'https://fomopomo.com';
const publicPages = new Map([
  ['/', '집중 시간을 기록하는 뽀모도로 타이머'],
  ['/contact', 'Contact'],
  ['/support', 'Fomopomo 후원하기'],
  ['/privacy', '개인정보처리방침'],
  ['/terms', '이용약관'],
]);
const internalPages = [
  '/plan', '/friends', '/groups', '/groups/seo-audit-placeholder', '/profile',
  '/admin', '/admin/changelog', '/admin/users/seo-audit-placeholder', '/test-error',
];
const agents = ['fomopomo-seo-check', 'Googlebot'];

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(([tag]) =>
    Object.fromEntries([...tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)]
      .map(([, key, value]) => [key.toLowerCase(), value])));
}

async function get(path, agent = agents[0]) {
  const response = await fetch(new URL(path, base), {
    redirect: 'manual', headers: { 'user-agent': agent },
    signal: AbortSignal.timeout(30_000),
  });
  return { response, html: await response.text() };
}

for (const agent of agents) {
  for (const [path, heading] of publicPages) {
    for (const suffix of ['', '?utm_source=seo-audit']) {
      const { response, html } = await get(path + suffix, agent);
      const label = `${agent} ${path}${suffix}`;
      assert.equal(response.status, 200, `${label}: HTTP status`);
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
      const canonical = tags(head, 'link').filter(tag => tag.rel === 'canonical');
      assert.equal(canonical.length, 1, `${label}: exactly one canonical in head`);
      assert.equal(new URL(canonical[0].href).href, new URL(path, origin).href, `${label}: canonical`);
      const meta = tags(head, 'meta');
      const robots = meta.filter(tag => ['robots', 'googlebot'].includes(tag.name));
      assert(robots.some(tag => /\bindex\b/.test(tag.content)), `${label}: explicit index`);
      assert(!robots.some(tag => /\b(noindex|none)\b/.test(tag.content)), `${label}: unexpected noindex`);
      assert(!/\b(noindex|none)\b/i.test(response.headers.get('x-robots-tag') ?? ''), `${label}: X-Robots-Tag`);
      assert.equal(new URL(meta.find(tag => tag.property === 'og:url')?.content).href,
        new URL(path, origin).href, `${label}: OG URL`);
      const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(match => match[1]);
      assert(headings.some(text => text.includes(heading)), `${label}: public heading in initial HTML`);
    }
  }
  for (const path of internalPages) {
    const { response, html } = await get(path, agent);
    assert.equal(response.status, 200, `${path}: current client-side route shell`);
    assert(tags(html, 'meta').some(tag => tag.name === 'robots' && /\bnoindex\b/.test(tag.content)),
      `${agent} ${path}: inherited noindex`);
    assert.equal(tags(html, 'link').filter(tag => tag.rel === 'canonical').length, 0,
      `${path}: no unrelated home canonical`);
  }
  console.log(`PASS ${agent}: public pages, query variants, and internal routes`);
}

const sitemap = await get('/sitemap.xml');
assert.equal(sitemap.response.status, 200);
const locations = [...sitemap.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).href);
assert.deepEqual(locations.sort(), [...publicPages.keys()].map(path => new URL(path, origin).href).sort());
assert(!sitemap.html.includes('<lastmod>'), 'Do not claim build time as content modification time');

const robots = await get('/robots.txt');
assert.equal(robots.response.status, 200);
assert(robots.html.includes(`Sitemap: ${origin}/sitemap.xml`));
// This repository intentionally uses one wildcard group and only an API disallow.
assert.deepEqual([...robots.html.matchAll(/^Disallow:\s*(\S+)/gm)].map(match => match[1]), ['/api/']);
assert(/^Allow:\s*\/$/m.test(robots.html), 'HTML routes must remain crawlable to expose noindex');

const slash = await get('/contact/');
assert([301, 308].includes(slash.response.status), 'Trailing slash should permanently redirect');
assert.equal(new URL(slash.response.headers.get('location'), base).pathname, '/contact');
console.log('PASS sitemap, robots.txt, and trailing-slash redirect');
console.log('HTTP checks do not prove Google-selected canonical or actual indexing. Verify those in Search Console.');
