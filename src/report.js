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
    const verdict = row.ok ? 'pass' : row.flaky ? 'flaky' : row.timedOut ? 'TIMEOUT' : 'FAIL';
    out.push(`  ${pad(row.id, idWidth)}  ${pad(verdict, 8)}${pad(seconds(row.ms), 8)}${row.label || row.title}`);
  }
  out.push('');

  const failed = result.results.filter((r) => !r.ok);
  const repeat = result.repeat || 1;
  const each = repeat === 1 ? '' : `, ${repeat} runs each`;
  const total = result.results.length;
  const plural = total === 1 ? '' : 's';
  if (failed.length === 0) {
    out.push(
      total === 1
        ? `The one environment passes${each}. Nothing here depends on this machine.`
        : `All ${total} environments pass${each}. Nothing here depends on this machine.`
    );
    out.push('');
    return out.join('\n');
  }

  const solid = failed.filter((r) => !r.flaky);
  const flaky = failed.filter((r) => r.flaky);
  if (solid.length === 0) {
    out.push(
      wrap(
        `${flaky.length} of ${total} environment${plural} failed some of the runs and passed the rest. ` +
          `That is your suite being unreliable, not the environment — a test that fails at random ` +
          `fails under whichever change it happened to land on.`,
        90,
        ''
      )
    );
  } else {
    const alsoFlaky = flaky.length
      ? ` ${flaky.length} more ${flaky.length === 1 ? 'was' : 'were'} flaky — failed some runs, passed others — which says nothing about the change.`
      : '';
    out.push(
      wrap(
        `${solid.length} of ${total} environment${plural} failed${repeat > 1 ? ' every run' : ''}. ` +
          `Your suite passes here and would not pass there.` + alsoFlaky,
        90,
        ''
      )
    );
  }
  out.push('');
  for (const row of failed) {
    out.push(`${row.id} \u2014 ${row.title}`);
    if (row.flaky) {
      out.push(wrap(`flaky: failed ${row.failures} of ${row.runs} runs. Treat it as a flake in your suite until it fails every time.`, 76, '  '));
    } else if (repeat > 1) {
      out.push(`  failed all ${row.runs} runs — consistent, not a flake.`);
    }
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
      repeat: result.repeat || 1,
      baseline: {
        ok: result.baseline.ok,
        ms: result.baseline.ms,
        code: result.baseline.code,
        runs: result.baseline.runs || 1,
        failures: result.baseline.failures || 0,
      },
      environments: result.results.map((r) => ({
        id: r.id,
        title: r.title,
        ok: r.ok,
        flaky: Boolean(r.flaky),
        runs: r.runs || 1,
        failures: r.failures || (r.ok ? 0 : 1),
        ms: r.ms,
        code: r.code,
        timedOut: r.timedOut,
        set: r.set,
        unset: r.unset,
        repro: r.repro,
        catches: r.catches,
        tail: r.ok ? [] : r.tail,
      })),
      failed: result.results.filter((r) => !r.ok && !r.flaky).map((r) => r.id),
      flaky: result.results.filter((r) => r.flaky).map((r) => r.id),
      ok: result.results.every((r) => r.ok),
    },
    null,
    2
  );
}

module.exports = { humanReport, jsonReport, listText, wrap, pad, seconds };
