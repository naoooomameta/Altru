#!/usr/bin/env node
/**
 * Send the latest Clarity snapshot as a daily HTML email via Resend.
 *
 * Reads data/clarity/<latest>.json, summarizes key metrics, and POSTs to
 * https://api.resend.com/emails. Driven by RESEND_API_KEY / MAIL_FROM / MAIL_TO env vars.
 */

const fs = require('node:fs');
const path = require('node:path');

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

function findLatestSnapshot() {
  const dir = path.resolve(process.cwd(), 'data/clarity');
  if (!fs.existsSync(dir)) throw new Error(`Directory not found: ${dir}`);
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  if (files.length === 0) throw new Error('No Clarity snapshots found in data/clarity/');
  return path.join(dir, files[files.length - 1]);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function summarizeByCategory(dimension, dimKey) {
  const firstMetric = dimension?.[0];
  if (!firstMetric) return [];
  return firstMetric.information
    .map((row) => ({
      label: row[dimKey] || 'Unknown',
      sessions: num(row.sessionsCount),
      pageViews: num(row.pagesViews),
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

function totalUxIssueAcrossUrls(dimension, metricName) {
  const metric = dimension?.find((m) => m.metricName === metricName);
  if (!metric) return 0;
  return metric.information.reduce((sum, row) => sum + num(row.subTotal), 0);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function rows(items, max = 5) {
  return items
    .slice(0, max)
    .map(
      ({ label, sessions, pageViews }) =>
        `<tr><td style="padding:6px 8px;border-top:1px solid #eee;">${escapeHtml(
          label,
        )}</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;">${sessions.toLocaleString()}</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;">${pageViews.toLocaleString()}</td></tr>`,
    )
    .join('');
}

function section(title, headers, rowsHtml) {
  if (!rowsHtml) {
    return `<section style="margin-top:24px;"><h2 style="font-size:15px;margin:0 0 8px;">${title}</h2><p style="color:#999;font-size:13px;">データなし</p></section>`;
  }
  return `<section style="margin-top:24px;">
  <h2 style="font-size:15px;margin:0 0 8px;">${title}</h2>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead><tr style="background:#f7f5f2;">${headers
      .map((h) => `<th style="text-align:left;padding:6px 8px;">${h}</th>`)
      .join('')}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</section>`;
}

function buildHtml({ date, snapshot, totals, ux, breakdowns }) {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222;background:#fff;">
  <h1 style="font-size:20px;border-bottom:2px solid #5b2a26;padding-bottom:8px;margin:0 0 4px;">Altru Clarity 日次レポート</h1>
  <p style="color:#666;margin:0;font-size:13px;">${date}（直近24時間）</p>

  <section style="margin-top:24px;">
    <h2 style="font-size:15px;margin:0 0 8px;">📊 サマリー</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 8px;border-top:1px solid #eee;">総セッション</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;font-weight:bold;">${totals.sessions.toLocaleString()}</td></tr>
      <tr><td style="padding:6px 8px;border-top:1px solid #eee;">総ページビュー</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;font-weight:bold;">${totals.pageViews.toLocaleString()}</td></tr>
    </table>
  </section>

  <section style="margin-top:24px;">
    <h2 style="font-size:15px;margin:0 0 8px;">⚠️ UX 課題（URL横断合計）</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 8px;border-top:1px solid #eee;">Rage Click（怒りクリック）</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;">${ux.rage.toLocaleString()}</td></tr>
      <tr><td style="padding:6px 8px;border-top:1px solid #eee;">Dead Click（無反応クリック）</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;">${ux.dead.toLocaleString()}</td></tr>
      <tr><td style="padding:6px 8px;border-top:1px solid #eee;">Excessive Scroll（過剰スクロール）</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;">${ux.scroll.toLocaleString()}</td></tr>
      <tr><td style="padding:6px 8px;border-top:1px solid #eee;">Quickback（即離脱）</td><td style="padding:6px 8px;text-align:right;border-top:1px solid #eee;">${ux.quickback.toLocaleString()}</td></tr>
    </table>
  </section>

  ${section('🔗 流入元 TOP 5', ['Source', 'Sessions', 'PV'], rows(breakdowns.source))}
  ${section('📄 URL TOP 5', ['URL', 'Sessions', 'PV'], rows(breakdowns.url))}
  ${section('📱 デバイス', ['Device', 'Sessions', 'PV'], rows(breakdowns.device))}
  ${section('🌐 ブラウザ', ['Browser', 'Sessions', 'PV'], rows(breakdowns.browser))}
  ${section('🌏 国', ['Country', 'Sessions', 'PV'], rows(breakdowns.country))}

  <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:12px;">
    元データ: Microsoft Clarity Data Export API<br>
    取得時刻: ${snapshot.fetchedAt}<br>
    本家ダッシュボード: <a href="https://clarity.microsoft.com" style="color:#5b2a26;">clarity.microsoft.com</a>
  </p>
</body></html>`;
}

function buildText({ date, totals, ux, breakdowns }) {
  const top = (items, label) =>
    items
      .slice(0, 5)
      .map((r) => `  - ${r.label}: ${r.sessions} sessions / ${r.pageViews} PV`)
      .join('\n') || `  (no data)`;

  return [
    `Altru Clarity 日次レポート ${date}`,
    '',
    `総セッション: ${totals.sessions}`,
    `総ページビュー: ${totals.pageViews}`,
    '',
    `UX 課題`,
    `  Rage: ${ux.rage}  Dead: ${ux.dead}  Scroll: ${ux.scroll}  Quickback: ${ux.quickback}`,
    '',
    '流入元 TOP5:',
    top(breakdowns.source),
    '',
    'URL TOP5:',
    top(breakdowns.url),
    '',
    `詳細: https://clarity.microsoft.com`,
  ].join('\n');
}

async function main() {
  loadDotenv();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Missing RESEND_API_KEY env var.');
    process.exit(1);
  }
  const from = process.env.MAIL_FROM || 'clarity@altru.jp';
  const to = process.env.MAIL_TO || 'altru.inc.jp@gmail.com';

  const filePath = findLatestSnapshot();
  const date = path.basename(filePath, '.json');
  const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const dims = snapshot.dimensions || {};

  const byDevice = summarizeByCategory(dims.Device, 'Device');
  const totals = {
    sessions: byDevice.reduce((s, r) => s + r.sessions, 0),
    pageViews: byDevice.reduce((s, r) => s + r.pageViews, 0),
  };

  const breakdowns = {
    source: summarizeByCategory(dims.Source, 'Source'),
    url: summarizeByCategory(dims.URL, 'Url'),
    device: byDevice,
    browser: summarizeByCategory(dims.Browser, 'Browser'),
    country: summarizeByCategory(dims.Country, 'Country'),
  };

  const ux = {
    rage: totalUxIssueAcrossUrls(dims.URL, 'RageClickCount'),
    dead: totalUxIssueAcrossUrls(dims.URL, 'DeadClickCount'),
    scroll: totalUxIssueAcrossUrls(dims.URL, 'ExcessiveScroll'),
    quickback: totalUxIssueAcrossUrls(dims.URL, 'QuickbackClick'),
  };

  const html = buildHtml({ date, snapshot, totals, ux, breakdowns });
  const text = buildText({ date, totals, ux, breakdowns });
  const subject = `[Altru] Clarity 日次レポート ${date}（セッション: ${totals.sessions.toLocaleString()}）`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend API ${res.status}: ${body}`);
    process.exit(1);
  }

  const data = await res.json();
  console.log(`Sent email id=${data.id} to ${to} from ${from} (snapshot ${date})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
