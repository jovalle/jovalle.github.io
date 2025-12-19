import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { chromium } from 'playwright';

const FEATURED_PROJECTS = [
  { name: '.jsh', repo: 'jovalle/.jsh' },
  { name: 'technis', repo: 'jovalle/technis' },
  { name: 'stargate', repo: 'jovalle/stargate' },
  { name: 'nexus', repo: 'jovalle/nexus' },
  { name: 'mothership', repo: 'jovalle/mothership' },
  { name: 'watchtower', repo: 'jovalle/watchtower' },
];

const OUTPUT_DIR = path.join(process.cwd(), 'static', 'images', 'projects');
const PROJECTS_DATA_OUT = path.join(process.cwd(), 'data', 'projects_generated.json');
const CACHE_DIR = path.join(process.cwd(), '.cache', 'repo-archives');
const MAX_AGE_DAYS = Number.parseInt(process.env.THUMBNAIL_MAX_AGE_DAYS ?? '14', 10);
const FORCE = process.env.THUMBNAIL_FORCE === '1' || process.argv.includes('--force');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const DESCRIPTIONS_ONLY = process.argv.includes('--descriptions-only');
const THUMBNAILS_ONLY = process.argv.includes('--thumbnails-only');
const FORCE_DESCRIPTIONS =
  process.env.DESCRIPTIONS_FORCE === '1' || process.argv.includes('--force-descriptions');

function slugifyRepoName(repoName) {
  // Keep it deterministic across template + script.
  const cleaned = repoName.replace(/^[^a-zA-Z0-9]+/, '');
  return cleaned
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fileIsFresh(filePath) {
  try {
    const stat = await fs.stat(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return ageMs <= maxAgeMs;
  } catch {
    return false;
  }
}

async function anyFresh(paths) {
  for (const p of paths) {
    if (await fileIsFresh(p)) return true;
  }
  return false;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function runTarList(archivePath) {
  const result = spawnSync('tar', ['-tzf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const err = (result.stderr || '').trim();
    throw new Error(`tar list failed: ${err || 'unknown error'}`);
  }
  return (result.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

function runTarExtractToBuffer(archivePath, memberPath) {
  const result = spawnSync('tar', ['-xzf', archivePath, '-O', memberPath], {
    encoding: null,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`tar extract failed for ${memberPath}`);
  }
  return Buffer.from(result.stdout);
}

async function fetchDefaultBranch(owner, repoName) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jovalle.github.io-thumbnail-generator',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
    headers,
    redirect: 'follow',
  });
  if (!res.ok) return 'main';
  const json = await res.json();
  return json.default_branch || 'main';
}

async function downloadRepoArchive(owner, repoName, ref) {
  await ensureDir(CACHE_DIR);
  const archivePath = path.join(CACHE_DIR, `${owner}-${repoName}-${ref}.tar.gz`);

  if (!FORCE && (await fileIsFresh(archivePath))) return archivePath;

  const url = `https://codeload.github.com/${owner}/${repoName}/tar.gz/${ref}`;
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to download archive: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(archivePath, buf);
  return archivePath;
}

function stripArchivePrefix(memberPath) {
  const idx = memberPath.indexOf('/');
  return idx === -1 ? memberPath : memberPath.slice(idx + 1);
}

function findBestImageInArchive(files, repoName) {
  const repoLower = repoName.toLowerCase();
  const repoLowerStripped = repoLower.replace(/^[^a-z0-9]+/, '');
  const repoSlug = slugifyRepoName(repoName);
  const repoCandidates = Array.from(
    new Set(
      [repoLower, repoLowerStripped, repoSlug].filter((v) => typeof v === 'string' && v.length > 0),
    ),
  );
  const wantedDirs = [
    '',
    '.github/assets',
    '.github',
    'public/images',
    'public',
    'static/images',
    'static',
    'images',
    'assets',
    'docs',
  ];

  const wantedFiles = [
    { name: 'thumbnail.png', ext: 'png' },
    { name: 'logo.svg', ext: 'svg' },
    { name: 'logo.png', ext: 'png' },
    { name: 'logo.jpg', ext: 'jpg' },
    { name: 'logo.jpeg', ext: 'jpeg' },
    ...repoCandidates.flatMap((candidate) => [
      { name: `${candidate}.png`, ext: 'png' },
      { name: `${candidate}.svg`, ext: 'svg' },
      { name: `${candidate}.jpg`, ext: 'jpg' },
      { name: `${candidate}.jpeg`, ext: 'jpeg' },
    ]),
  ];

  const matches = [];

  for (const member of files) {
    if (member.endsWith('/')) continue;
    const rel = stripArchivePrefix(member);
    const relLower = rel.toLowerCase();
    const baseLower = path.posix.basename(relLower);

    for (let f = 0; f < wantedFiles.length; f += 1) {
      if (baseLower !== wantedFiles[f].name) continue;

      for (let d = 0; d < wantedDirs.length; d += 1) {
        const dir = wantedDirs[d];
        if (dir === '') {
          if (relLower.includes('/')) continue;
        } else {
          if (!(relLower === dir || relLower.startsWith(`${dir}/`))) continue;
        }

        matches.push({
          member,
          ext: wantedFiles[f].ext,
          fileRank: f,
          dirRank: d,
          relLen: relLower.length,
        });
        break;
      }
    }
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    if (a.fileRank !== b.fileRank) return a.fileRank - b.fileRank;
    if (a.dirRank !== b.dirRank) return a.dirRank - b.dirRank;
    return a.relLen - b.relLen;
  });
  return matches[0];
}

async function removeIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}

async function cleanOtherOutputs(slug, keepExt) {
  const exts = ['png', 'svg', 'jpg', 'jpeg'];
  await Promise.all(
    exts
      .filter((e) => e !== keepExt)
      .map((e) => removeIfExists(path.join(OUTPUT_DIR, `${slug}.${e}`))),
  );
}

async function fetchGitHubRepoDescription(repo) {
  const url = `https://api.github.com/repos/${repo}`;
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${url}`);
  const json = await res.json();
  return typeof json.description === 'string' ? json.description : '';
}

async function headOk(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return res.ok;
  } catch {
    return false;
  }
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed download: ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
}

async function gotoFirstOk(page, urls) {
  for (const url of urls) {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (!response) return url;
    const status = response.status();
    if (status >= 200 && status < 400) return url;
  }
  return null;
}

async function screenshotReadme(page, outPath) {
  const THUMB_WIDTH = 1280;
  const THUMB_HEIGHT = 720;

  // Use a wide viewport to make README rendering look good.
  await page.setViewportSize({ width: THUMB_WIDTH, height: THUMB_HEIGHT });

  // Let GitHub load content (README can be below the fold and may load progressively).
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Prefer the rendered Markdown body. On GitHub file/blob views this is usually present.
  const selectors = ['#readme article.markdown-body', 'article.markdown-body', '.markdown-body'];
  let selectorFound = null;
  for (const sel of selectors) {
    try {
      await page.locator(sel).first().waitFor({ timeout: 4000 });
      selectorFound = sel;
      break;
    } catch {
      // Try next selector.
    }
  }

  if (selectorFound) {
    // Render an isolated page containing only the README so we don't include GitHub UI.
    const readmeHtml = await page.evaluate((sel) => {
      const root = document.querySelector(sel);
      if (!root) return null;

      // Make image src/href absolute so they work in an isolated render.
      for (const img of root.querySelectorAll('img')) {
        const src = img.getAttribute('src') || '';
        if (src) img.setAttribute('src', new URL(src, window.location.href).toString());
        const srcset = img.getAttribute('srcset') || '';
        if (srcset) {
          const fixed = srcset
            .split(',')
            .map((part) => {
              const trimmed = part.trim();
              const [u, d] = trimmed.split(/\s+/);
              if (!u) return trimmed;
              const abs = new URL(u, window.location.href).toString();
              return d ? `${abs} ${d}` : abs;
            })
            .join(', ');
          img.setAttribute('srcset', fixed);
        }
      }
      for (const a of root.querySelectorAll('a')) {
        const href = a.getAttribute('href') || '';
        if (href) a.setAttribute('href', new URL(href, window.location.href).toString());
      }

      return root.outerHTML;
    }, selectorFound);

    if (readmeHtml) {
      await page.setContent(
        `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      body { display: flex; justify-content: center; }
      .wrap { width: 100%; max-width: 980px; padding: 32px; box-sizing: border-box; }
      /* Make sure markdown-body looks like GitHub's rendered markdown */
      .markdown-body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
      /* Center common header content */
      .markdown-body > p:first-of-type { text-align: center; }
      .markdown-body h1, .markdown-body h2 { text-align: center; }
    </style>
  </head>
  <body>
    <div class="wrap">${readmeHtml}</div>
  </body>
</html>`,
        { waitUntil: 'domcontentloaded' },
      );

      await page.waitForLoadState('networkidle').catch(() => {});

      // Scroll so that the README header block is vertically centered in the thumbnail.
      const scrollY = await page.evaluate(() => {
        const body = document.querySelector('.markdown-body');
        if (!body) return 0;

        const children = Array.from(body.children).filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.height > 0 && rect.width > 0;
        });

        const headerEls = children.slice(0, 3);
        if (headerEls.length === 0) return 0;

        let top = Infinity;
        let bottom = -Infinity;
        for (const el of headerEls) {
          const r = el.getBoundingClientRect();
          top = Math.min(top, r.top);
          bottom = Math.max(bottom, r.bottom);
        }

        const headerCenter = (top + bottom) / 2;
        const targetCenter = window.innerHeight / 2;
        return Math.max(0, Math.floor(window.scrollY + (headerCenter - targetCenter)));
      });

      await page.evaluate((y) => window.scrollTo(0, y), scrollY);
      await page.waitForTimeout(200);

      await page.screenshot({ path: outPath, fullPage: false });
      return;
    }
  }

  // Fallback: screenshot the visible viewport.
  await page.screenshot({ path: outPath, fullPage: false });
}

async function main() {
  await ensureDir(OUTPUT_DIR);
  await ensureDir(path.dirname(PROJECTS_DATA_OUT));
  await ensureDir(CACHE_DIR);

  // Generate a Hugo data file that mirrors the featured list but uses live repo descriptions.
  // This lets the Hugo template render subtitles from the actual GitHub repository metadata.
  if (!THUMBNAILS_ONLY) {
    if (FORCE || FORCE_DESCRIPTIONS || !(await fileIsFresh(PROJECTS_DATA_OUT))) {
      const featured = [];
      for (const project of FEATURED_PROJECTS) {
        const repoName = project.repo.split('/')[1];
        const slug = slugifyRepoName(repoName);
        let description = '';
        try {
          description = await fetchGitHubRepoDescription(project.repo);
        } catch {
          // Leave empty; the Hugo template will fall back to data/projects.yaml.
          description = '';
        }

        featured.push({
          name: project.name,
          slug,
          repo: `https://github.com/${project.repo}`,
          description,
        });
      }

      await fs.writeFile(PROJECTS_DATA_OUT, `${JSON.stringify({ featured }, null, 2)}\n`, 'utf8');
    }
  }

  if (DESCRIPTIONS_ONLY) {
    return;
  }

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  });

  const page = await context.newPage();

  try {
    for (const project of FEATURED_PROJECTS) {
      const [owner, repoName] = project.repo.split('/');
      const slug = slugifyRepoName(repoName);

      const outPng = path.join(OUTPUT_DIR, `${slug}.png`);
      const outSvg = path.join(OUTPUT_DIR, `${slug}.svg`);
      const outJpg = path.join(OUTPUT_DIR, `${slug}.jpg`);
      const outJpeg = path.join(OUTPUT_DIR, `${slug}.jpeg`);

      const outputsFresh = !FORCE && (await anyFresh([outPng, outSvg, outJpg, outJpeg]));

      // Scan the repo for candidate images (preferred over screenshotting).
      // Priority order (your spec):
      // 1) thumbnail.png
      // 2) logo.svg/logo.png
      // 3) README header screenshot (isolated)
      let ref = 'main';
      try {
        ref = await fetchDefaultBranch(owner, repoName);
      } catch {
        ref = 'main';
      }

      let archivePath = null;
      try {
        archivePath = await downloadRepoArchive(owner, repoName, ref);
      } catch {
        // Fallback to common branch names.
        for (const fallback of ['main', 'master']) {
          try {
            archivePath = await downloadRepoArchive(owner, repoName, fallback);
            break;
          } catch {
            // try next
          }
        }
      }

      if (archivePath && fsSync.existsSync(archivePath)) {
        try {
          const members = runTarList(archivePath);
          const best = findBestImageInArchive(members, repoName);
          if (best) {
            const buf = runTarExtractToBuffer(archivePath, best.member);
            const outPath = path.join(OUTPUT_DIR, `${slug}.${best.ext}`);
            await fs.writeFile(outPath, buf);
            await cleanOtherOutputs(slug, best.ext);
            continue;
          }
        } catch {
          // If scanning/extraction fails, fall back to screenshot.
        }
      }

      // If we already have a fresh output, don't spend time rendering screenshots.
      // This still allows promoting a repo-provided logo/thumbnail over an old screenshot.
      if (outputsFresh) {
        continue;
      }

      const base = `https://github.com/${project.repo}`;
      await gotoFirstOk(page, [
        `${base}/blob/main/README.md`,
        `${base}/blob/master/README.md`,
        `${base}`,
      ]);
      await screenshotReadme(page, outPng);
      await cleanOtherOutputs(slug, 'png');
    }
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

await main();
