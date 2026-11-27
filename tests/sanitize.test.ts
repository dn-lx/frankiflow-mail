import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { sanitizeEmailHtml, type PurifyLike } from '../src/lib/mail/sanitize.ts';

const { window } = new JSDOM('');
const purify = createDOMPurify(
  window as unknown as Parameters<typeof createDOMPurify>[0],
) as unknown as PurifyLike;

function clean(html: string, allowRemoteImages = false) {
  return sanitizeEmailHtml(html, { allowRemoteImages, purify });
}

function parse(html: string): Document {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
}

function isLocal(value: string): boolean {
  const v = value.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  return v === '' || v.startsWith('#') || v.startsWith('cid:') || /^data:image\/[a-z0-9.+-]+[;,]/.test(v);
}

function assertCssLocal(css: string, where: string): void {
  assert.ok(!css.includes('\\'), `${where}: CSS escapes must not survive: ${css}`);
  assert.ok(!/@import/i.test(css), `${where}: @import must be removed: ${css}`);
  assert.ok(!/image-set\s*\(/i.test(css), `${where}: remote image-set must be removed: ${css}`);
  for (const m of css.matchAll(/url\s*\(\s*(["']?)([^"')]*)/gi)) {
    assert.ok(isLocal(m[2]!), `${where}: remote url() survived: ${css}`);
  }
}

const LINK_TAGS = new Set(['a', 'area']);

/** Every fetchable reference in the sanitized output must be local (data:image, cid:, #frag). */
function assertNoRemote(html: string): void {
  const doc = parse(html);
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const tag = el.nodeName.toLowerCase();
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === 'data-src') continue;
      if ((name === 'href' || name === 'xlink:href') && LINK_TAGS.has(tag)) continue;
      if (name === 'style') {
        assertCssLocal(attr.value, `<${tag} style>`);
      } else if (['src', 'poster', 'background', 'href', 'xlink:href', 'lowsrc', 'dynsrc'].includes(name)) {
        assert.ok(isLocal(attr.value), `<${tag} ${name}="${attr.value}"> must be blocked`);
      } else if (name === 'srcset') {
        for (const part of attr.value.split(',')) {
          assert.ok(isLocal(part.trim().split(/\s+/)[0] ?? ''), `srcset survived: ${attr.value}`);
        }
      }
    }
    if (tag === 'style') assertCssLocal(el.textContent ?? '', '<style>');
  }
}

describe('sanitizeEmailHtml: links and scripts', () => {
  it('removes javascript: links', () => {
    const { html } = clean('<a href="javascript:alert(1)">x</a><a href=" JaVaScRiPt:alert(1)">y</a>');
    assert.ok(!/javascript:/i.test(html), html);
  });

  it('removes data:text/html links', () => {
    const { html } = clean('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    assert.ok(!/data:text\/html/i.test(html), html);
  });

  it('adds target=_blank and rel=noopener noreferrer to links', () => {
    const doc = parse(clean('<a href="https://example.com/">x</a>').html);
    const a = doc.querySelector('a');
    assert.ok(a);
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
    assert.equal(a.getAttribute('href'), 'https://example.com/');
  });

  it('drops script, forms, media and embedding elements', () => {
    const { html } = clean(
      '<p>ok</p><script>x</script><form><input type="image" src="https://t/i"></form>' +
        '<iframe src="https://t/f"></iframe><object data="https://t/o"></object>' +
        '<video src="https://t/v"></video><audio src="https://t/a"></audio>' +
        '<link rel="stylesheet" href="https://t/s.css"><meta http-equiv="refresh" content="0;url=https://t">' +
        '<base href="https://t/"><template><img src="https://t/x"></template>',
    );
    assert.ok(!/<(script|form|input|iframe|object|video|audio|link|meta|base|template)\b/i.test(html), html);
    assert.ok(!html.includes('https://t'), html);
  });
});

describe('sanitizeEmailHtml: remote content blocked by default', () => {
  const bypasses: Array<[string, string]> = [
    ['backslash scheme', String.raw`<img src="https:\\tracker.example\p.gif" width="40" height="40">`],
    ['scheme without slashes', '<img src="https:tracker.example/p.gif" width="40" height="40">'],
    ['leading backslashes', String.raw`<img src="\\tracker.example/p.gif" width="40" height="40">`],
    ['scheme-relative', '<img src="//tracker.example/p.gif" width="40" height="40">'],
    ['http', '<img src="http://tracker.example/p.gif" width="40" height="40">'],
    ['whitespace in scheme', '<img src=" ht&#9;tps://tracker.example/p.gif" width="40" height="40">'],
    ['srcset', '<img srcset="https://t/a.png 1x, https://t/b.png 2x" width="40" height="40">'],
    ['svg image href', '<svg><image href="https://t/p.gif" width="40" height="40"></image></svg>'],
    ['svg image xlink:href', '<svg><image xlink:href="https://t/p.gif" width="40" height="40"></image></svg>'],
    ['svg feImage', '<svg><filter id="f"><feImage href="https://t/p.gif"></feImage></filter></svg>'],
    ['table background', '<table background="https://t/bg.png"><tr><td>x</td></tr></table>'],
    ['url() double quotes', `<div style='background:url("https://t/a.png")'>x</div>`],
    ['url() single quotes', `<div style="background:url('https://t/a.png')">x</div>`],
    ['unquoted url() containing a quote', `<div style="background:url(https://t/a.png?x='1')">x</div>`],
    ['CSS escape \\75rl(', String.raw`<div style="background:\75rl(https://t/a)">x</div>`],
    ['CSS escape u\\rl(', String.raw`<div style="background:u\rl(https://t/a)">x</div>`],
    ['image-set()', `<div style="background-image:image-set('https://t/a.png' 1x)">x</div>`],
    ['-webkit-image-set()', `<div style="background-image:-webkit-image-set(url(https://t/a.png) 1x)">x</div>`],
    ['@import in <style>', '<style>@import "https://t/x.css"; p{color:red}</style><p>x</p>'],
    ['escaped @import', String.raw`<style>@\69mport "https://t/x.css"; p{color:red}</style><p>x</p>`],
    ['url() in <style>', '<style>p{background:url(https://t/a.png)}</style><p>x</p>'],
    ['SVG <style>', '<svg><style>rect{fill:url(https://t/a.svg#x);background:url(https://t/b.png)}</style><rect width="9" height="9"></rect></svg>'],
    ['SVG fill attribute', '<svg><rect width="9" height="9" fill="url(https://t/a.svg#g)"></rect></svg>'],
  ];

  for (const [name, input] of bypasses) {
    it(`blocks ${name}`, () => {
      const res = clean(input);
      assertNoRemote(res.html);
    });
  }

  it('counts the blocked image-bearing inputs', () => {
    for (const [name, input] of bypasses) {
      if (name.includes('@import')) continue; // stylesheet imports are stripped, not counted as images
      const res = clean(input);
      assert.ok(res.blockedImages >= 1, `${name}: expected blockedImages >= 1, got ${res.blockedImages}`);
    }
  });

  it('keeps the original URL in data-src and uses a data: placeholder', () => {
    const doc = parse(clean('<img src="https://cdn.example/a.png" width="40" height="40">').html);
    const img = doc.querySelector('img');
    assert.ok(img);
    assert.equal(img.getAttribute('data-src'), 'https://cdn.example/a.png');
    assert.match(img.getAttribute('src') ?? '', /^data:image\//);
  });

  it('does not let decoded CSS close the <style> element', () => {
    const res = clean(
      String.raw`<style>p{color:red}\3c/style\3e\3cimg src=x onerror=alert(1)\3e</style><p>x</p>`,
    );
    const doc = parse(res.html);
    assert.equal(doc.querySelectorAll('img').length, 0, res.html);
    assert.equal(doc.querySelectorAll('style').length, 1, res.html);
    assert.ok(!res.html.includes('</style><img'), res.html);
  });

  it('keeps data:image and cid: images and counts only remote ones', () => {
    const res = clean(
      '<img src="https://a.example/1.png" width="40" height="40">' +
        '<img src="//a.example/2.png" width="40" height="40">' +
        '<img src="data:image/png;base64,iVBORw0KGgo=" width="40" height="40">' +
        '<img src="cid:logo@frankiflow" width="40" height="40">',
    );
    assert.equal(res.blockedImages, 2);
    const srcs = Array.from(parse(res.html).querySelectorAll('img')).map((i) => i.getAttribute('src'));
    assert.ok(srcs.includes('data:image/png;base64,iVBORw0KGgo='));
    assert.ok(srcs.includes('cid:logo@frankiflow'));
    assertNoRemote(res.html);
  });
});

describe('sanitizeEmailHtml: tracking pixels', () => {
  it('drops a 1x1 tracking pixel and reports it', () => {
    const res = clean('<p>Hallo</p><img src="https://t.example/open.gif" width="1" height="1">');
    assert.equal(res.hasTrackingPixel, true);
    assert.equal(parse(res.html).querySelectorAll('img').length, 0);
    assert.ok(!res.html.includes('t.example'), res.html);
  });

  it('drops hidden pixels even when remote images are allowed', () => {
    const res = clean('<img src="https://t.example/p.gif" style="display:none">', true);
    assert.equal(res.hasTrackingPixel, true);
    assert.ok(!res.html.includes('t.example'), res.html);
  });

  it('does not report a pixel for normal messages', () => {
    const res = clean('<p>Hallo</p><img src="https://t.example/logo.png" width="120" height="40">');
    assert.equal(res.hasTrackingPixel, false);
  });
});

describe('sanitizeEmailHtml: remote images allowed', () => {
  it('keeps https images untouched and counts nothing', () => {
    const res = clean('<img src="https://cdn.example/a.png" width="40" height="40">', true);
    const img = parse(res.html).querySelector('img');
    assert.ok(img);
    assert.equal(img.getAttribute('src'), 'https://cdn.example/a.png');
    assert.equal(img.hasAttribute('data-src'), false);
    assert.equal(res.blockedImages, 0);
  });

  it('keeps CSS url() with https but still strips @import', () => {
    const res = clean(
      `<style>@import "https://t/x.css"; p{background:url("https://cdn.example/bg.png")}</style><p>x</p>`,
      true,
    );
    assert.ok(!/@import/i.test(res.html), res.html);
    assert.ok(res.html.includes('https://cdn.example/bg.png'), res.html);
  });

  it('still removes javascript: URLs', () => {
    const res = clean('<a href="javascript:alert(1)">x</a><img src="javascript:alert(1)">', true);
    assert.ok(!/javascript:/i.test(res.html), res.html);
  });
});

describe('sanitizeEmailHtml: edge cases', () => {
  it('returns empty output for empty input', () => {
    assert.deepEqual(clean('   '), { html: '', blockedImages: 0, hasTrackingPixel: false });
  });

  it('keeps plain content intact', () => {
    const res = clean('<p>Grüße aus <b>Frankfurt</b></p>');
    assert.equal(res.html, '<p>Grüße aus <b>Frankfurt</b></p>');
    assert.equal(res.blockedImages, 0);
  });
});

describe('second-review CSS bypasses (fail closed)', () => {
  const inputs: [string, string][] = [
    ['quote inside unquoted data url', `<style>p{background:url(data:image/png;base64,a");background-image:url(https://tracker.example/p.gif)}</style><p>x</p>`],
    ['newline inside quoted data url', `<style>p{background:url("data:image/png;base64,a\n);background-image:url(https://tracker.example/p.gif)}</style><p>x</p>`],
    ['opposite quote inside image-set string', `<div style="background-image:image-set(&quot;https://tracker.example/p.gif?'&quot; 1x)">x</div>`],
    ['quoted url inside image-set', `<div style="background-image:image-set(url(&quot;https://tracker.example/p.gif&quot;) 1x)">x</div>`],
  ];
  for (const [name, html] of inputs) {
    it(`blocks: ${name}`, () => {
      const out = clean(html).html;
      assert.ok(!out.includes('tracker.example'), `${name}: remote host survived: ${out}`);
    });
  }
  it('keeps a well-formed inline data image in CSS', () => {
    const out = clean(`<div style="background:url('data:image/png;base64,iVBORw0KGgo=')">x</div>`).html;
    assert.ok(out.includes('data:image/png;base64,iVBORw0KGgo='), out);
  });

  it('keeps newsletter text visible and strips white-on-white text color when remote hero background image is blocked', () => {
    const newsletterHtml = `
      <style>
        .hero {
          background-image: url("https://images.example.com/cleanpro-hero.jpg");
          color: #fff;
          padding: 24px;
        }
        .copy {
          color: #334155;
          line-height: 1.5;
        }
        .cta {
          display: inline-block;
          background: #1F8A8A;
          color: #ffffff;
          padding: 10px 18px;
        }
      </style>
      <div class="hero" style="background: url('https://images.example.com/banner.jpg') no-repeat center/cover; color: #fff;">
        <h2>15% Rabatt auf Öko-Konzentrate</h2>
        <p class="copy">Entdecken Sie unsere neuen biologisch abbaubaren Reiniger für Büro- und Treppenhausreinigung.</p>
        <a href="https://cleanpro-bedarf.example.com/aktion" class="cta">Jetzt ansehen</a>
      </div>
    `;
    const res = clean(newsletterHtml, false);
    assertNoRemote(res.html);
    assert.ok(res.blockedImages >= 2, `expected blockedImages >= 2, got ${res.blockedImages}`);
    assert.ok(res.html.includes('15% Rabatt auf Öko-Konzentrate'), 'headline must remain present');
    assert.ok(res.html.includes('biologisch abbaubaren Reiniger'), 'body copy must remain present');
    assert.ok(res.html.includes('Jetzt ansehen'), 'CTA text must remain present');
    // The .copy and .cta rules in <style> must not be wiped out by the hero rule
    assert.ok(res.html.includes('.copy') && res.html.includes('#334155'), '<style> rules without remote fetches must survive');
    // Neither the .hero rule nor the inline style on .hero may retain white text on a now-empty background
    const doc = parse(res.html);
    const hero = doc.querySelector('.hero');
    assert.ok(hero);
    const inlineStyle = hero.getAttribute('style') ?? '';
    assert.ok(!/color\s*:\s*(#fff|#ffffff|white)\b/i.test(inlineStyle), `white inline color survived on blocked bg: ${inlineStyle}`);
    const styleTagText = doc.querySelector('style')?.textContent ?? '';
    const heroRuleMatch = /\.hero\s*\{([^}]*)\}/.exec(styleTagText);
    assert.ok(heroRuleMatch, `<style> .hero rule should survive with safe declarations: ${styleTagText}`);
    assert.ok(!/color\s*:\s*(#fff|#ffffff|white)\b/i.test(heroRuleMatch[1]!), `white rule color survived on blocked bg: ${heroRuleMatch[1]}`);
  });
});
