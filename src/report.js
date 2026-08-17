'use strict';

const { PERTURBATIONS } = require('./perturbations');

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function pad(text, width) {
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function wrap(text, width, indent) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join('\n');
}

function listText() {
  const width = Math.max(...PERTURBATIONS.map((p) => p.id.length));
  const out = ['otherbox runs your command once per environment below, one thing different each time.', ''];
  for (const p of PERTURBATIONS) {
    out.push(`  ${pad(p.id, width)}  ${p.title}`);
    out.push(wrap(`catches: ${p.catches}`, 76, ' '.repeat(width + 6)));
    out.push('');
  }
  return out.join('\n').replace(/\n+$/, '\n');
}

// The whole report, as text. Pure: takes a finished result, returns a string.
function humanReport(result) {
  const out = [];
  out.push(`otherbox \u2014 one thing different at a time`);
  out.push(`  command: ${result.command.join(' ')}`);
  out.push('');

  const rows = [{ id: 'baseline', label: 'your environment, unchanged', ...result.baseline }, ...result.results];
  const idWidth = Math.max(...rows.map((r) => r.id.length));
  for (const row of rows) {
    const verdict = row.ok ? 'pass' : row.timedOut ? 'TIMEOUT' : 'FAIL';
    out.push(`  ${pad(row.id, idWidth)}  ${pad(verdict, 8)}${pad(seconds(row.ms), 8)}${row.label || row.title}`);
  }
  out.push('');

  const failed = result.results.filter((r) => !r.ok);
  if (failed.length === 0) {
    out.push(`All ${result.results.length} environments pass. Nothing here depends on this machine.`);
    out.push('');
    return out.join('\n');
  }

  out.push(
    `${failed.length} of ${result.results.length} environment${result.results.length === 1 ? '' : 's'} failed. ` +
      `Your suite passes here and would not pass there.`
  );
  out.push('');
  for (const row of failed) {
    out.push(`${row.id} \u2014 ${row.title}`);
    out.push(wrap(`catches: ${row.catches}`, 76, '  '));
    out.push(`  reproduce: ${row.repro}`);
    if (row.timedOut) out.push(`  the run was killed after the timeout; it did not finish here.`);
    if (row.tail && row.tail.length) {
      out.push('  last lines:');
      for (const line of row.tail) out.push(`    ${line}`);
    }
    out.push('');
  }
  return out.join('\n');
}

function jsonReport(result) {
  return JSON.stringify(
    {
      tool: 'otherbox',
      version: result.version,
      command: result.command,
      baseline: { ok: result.baseline.ok, ms: result.baseline.ms, code: result.baseline.code },
      environments: result.results.map((r) => ({
        id: r.id,
        title: r.title,
        ok: r.ok,
        ms: r.ms,
        code: r.code,
        timedOut: r.timedOut,
        set: r.set,
        unset: r.unset,
        repro: r.repro,
        catches: r.catches,
        tail: r.ok ? [] : r.tail,
      })),
      failed: result.results.filter((r) => !r.ok).map((r) => r.id),
      ok: result.results.every((r) => r.ok),
    },
    null,
    2
  );
}

module.exports = { humanReport, jsonReport, listText, wrap, pad, seconds };
