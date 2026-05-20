#!/usr/bin/env node
/**
 * Microsoft Clarity Data Export API fetcher.
 *
 * Reads CLARITY_API_TOKEN from env (.env locally, Secrets in GitHub Actions),
 * pulls the last N days (1-3) for every supported dimension, and writes the
 * combined result to data/clarity/<YYYY-MM-DD>.json.
 *
 * Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
 */

const fs = require('node:fs');
const path = require('node:path');

const ENDPOINT = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
const DIMENSIONS = [
  'Browser',
  'Device',
  'OS',
  'Country',
  'Source',
  'Medium',
  'Campaign',
  'Channel',
  'URL',
];

function loadDotenv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

async function fetchDimension(token, numOfDays, dimension) {
  const url = `${ENDPOINT}?numOfDays=${numOfDays}&dimension1=${encodeURIComponent(dimension)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clarity API ${res.status} for dimension=${dimension}: ${body}`);
  }
  return res.json();
}

async function main() {
  loadDotenv();
  const token = process.env.CLARITY_API_TOKEN;
  if (!token) {
    console.error('Missing CLARITY_API_TOKEN. Set it in .env or as a GitHub Secret.');
    process.exit(1);
  }

  const numOfDays = Number(process.env.CLARITY_NUM_DAYS || 1);
  if (![1, 2, 3].includes(numOfDays)) {
    console.error('CLARITY_NUM_DAYS must be 1, 2, or 3.');
    process.exit(1);
  }

  const fetchedAt = new Date().toISOString();
  const result = { fetchedAt, numOfDays, dimensions: {} };

  for (const dim of DIMENSIONS) {
    try {
      console.log(`Fetching dimension=${dim}...`);
      result.dimensions[dim] = await fetchDimension(token, numOfDays, dim);
    } catch (err) {
      console.error(err.message);
      result.dimensions[dim] = { error: err.message };
    }
  }

  const outDir = path.resolve(process.cwd(), 'data/clarity');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = fetchedAt.slice(0, 10);
  const outPath = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
