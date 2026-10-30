#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { Session, parseOverrides, entryRuns, MAX_ENTRIES } from './runner.js';

const HELP = `
Usage: form-tester [url] [options]

Options:
  --headless           Run without a visible browser window
  --no-submit          Fill the form but don't submit (dry run)
  --form <id|n>        Pick a form without prompting (list number or id like 0:1)
  --email <pattern>    Email pattern, e.g. "qa+{random}@yourdomain.com"
                       Tokens: {random} {timestamp} {first} {last}
  --set key=value      Pin a field value (matches name, id, or label text). Repeatable.
  --entries <1-5>      Submit the form this many times, each with new random data
  --conditionals       Search for conditional fields and run one submission per branch
  --no-conditionals    Skip the "search for conditionals?" question
  --ui [--port 3210]   Start the local web UI instead
  -h, --help           Show this help
`;

function parseArgs(args) {
  const o = { set: [], submit: true, headless: false, port: 3210 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--headless') o.headless = true;
    else if (a === '--no-submit') o.submit = false;
    else if (a === '--form') o.form = args[++i];
    else if (a === '--email') o.email = args[++i];
    else if (a === '--set') o.set.push(args[++i]);
    else if (a === '--entries') {
      o.entries = Number(args[++i]);
      if (!Number.isInteger(o.entries) || o.entries < 1 || o.entries > MAX_ENTRIES) {
        console.error(`--entries must be a whole number from 1 to ${MAX_ENTRIES}`);
        o.help = true;
      }
    }
    else if (a === '--conditionals') o.conditionals = true;
    else if (a === '--no-conditionals') o.conditionals = false;
    else if (a === '--ui') o.ui = true;
    else if (a === '--port') o.port = Number(args[++i]);
    else if (a === '-h' || a === '--help') o.help = true;
    else if (!a.startsWith('-')) o.url = a;
    else { console.error(`Unknown option ${a}`); o.help = true; }
  }
  return o;
}

function printForms(forms) {
  forms.forEach((f, i) => {
    const title = f.heading || f.id || f.name || (f.kind === 'loose' ? 'Fields outside a <form>' : 'Untitled form');
    const where = f.inIframe ? `  [iframe: ${new URL(f.frameUrl).host}]` : '';
    const cap = f.captcha ? '  [CAPTCHA]' : '';
    console.log(`  ${i + 1}) ${title} - ${f.fieldCount} fields${where}${cap}`);
    console.log(`     ${f.preview.join(' | ')}`);
  });
}

function printResult(r) {
  for (const s of r.steps) {
    if (r.steps.length > 1) console.log(`\n-- Step ${s.step} --`);
    for (const f of s.filled) console.log(`  ${f.kind.padEnd(9)} ${f.field.padEnd(40)} ${f.value}`);
    for (const e of s.errors) console.log(`  ERROR     ${e.field}: ${e.error}`);
  }
  if (r.invalid?.length) {
    console.log('\nFields still failing browser validation:');
    for (const v of r.invalid) console.log(`  - ${v.field}: ${v.message}`);
  }
}

function printOutcome(r) {
  if (r.status === 'filled') console.log('\nFilled (not submitted, --no-submit).');
  else if (r.status === 'no-submit-button') console.log('\nCould not find a submit button.');
  else if (r.status === 'not-submitted') {
    console.log(`\nClicked "${r.button}", but the form is still showing. It probably wasn't submitted.`);
    for (const e of r.errors || []) console.log(`  - ${e}`);
  } else if (r.status !== 'captcha') {
    console.log(`\nSubmitted${r.button ? ` via "${r.button}"` : ''}.`);
    console.log(`  URL:   ${r.finalUrl}`);
    if (r.confirmation) console.log(`  Page says: ${r.confirmation}`);
  }
}

async function main() {
  const opts = parseArgs(argv.slice(2));
  if (opts.help) { console.log(HELP); return; }
  if (opts.ui) {
    const { startServer } = await import('./server.js');
    await startServer(opts.port);
    return;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ask = (q) => rl.question(q);
  const url = opts.url || (await ask('Form URL: ')).trim();
  if (!url) { rl.close(); return; }

  const session = new Session({ headless: opts.headless });
  try {
    console.log(`Opening ${url} ...`);
    await session.open(url);
    let forms = await session.scan();
    while (!forms.length) {
      const again = (await ask('No forms found. Press Enter to rescan (e.g. after dismissing a popup), or q to quit: ')).trim();
      if (again === 'q') return;
      forms = await session.scan();
    }

    let chosen;
    if (opts.form) chosen = forms.find((f) => f.id === opts.form) || forms[Number(opts.form) - 1];
    if (!chosen && forms.length === 1) chosen = forms[0];
    while (!chosen) {
      console.log('\nForms found:');
      printForms(forms);
      const ans = (await ask(`Choose a form [1-${forms.length}] or r to rescan: `)).trim();
      if (ans === 'r') { forms = await session.scan(); continue; }
      chosen = forms[Number(ans) - 1];
    }
    console.log(`\nFilling: ${chosen.heading || chosen.id || chosen.name || 'form'} ...`);

    const fillOpts = { submit: opts.submit, emailPattern: opts.email, overrides: parseOverrides(opts.set) };
    const solveCaptcha = async (kind) => {
      console.log(`\n${kind} detected.`);
      if (opts.headless) {
        console.log('Running headless, so the CAPTCHA cannot be solved. Re-run without --headless.');
        return 'stop';
      }
      const ans = (await ask('Solve it in the browser, then press Enter to submit (or type m if you submitted it yourself): ')).trim().toLowerCase();
      return ans === 'm' ? 'manual' : 'submit';
    };

    let conditionals = opts.conditionals;
    if (conditionals === undefined && opts.entries > 1) conditionals = false;
    if (conditionals === undefined) conditionals = /^y/i.test((await ask('Search for conditionals? [y/N] ')).trim());
    if (conditionals && opts.entries > 1) console.log('Note: --entries is ignored when searching for conditionals (the plan sets the count).');

    if (!conditionals && opts.entries > 1) {
      console.log(`Running ${opts.entries} entries, each with new random data ...`);
      const results = await session.runCoverage(chosen.id, entryRuns(opts.entries), {
        ...fillOpts,
        onRun: (e) => console.log(`  Entry ${e.run}: ${e.status}${e.email ? ` (${e.email})` : ''}${e.confirmation ? ` - ${e.confirmation.slice(0, 80)}` : ''}${e.errors.length ? ` - ${e.errors.join('; ')}` : ''}`),
        onCaptcha: (i, r) => solveCaptcha(r.captcha.kind),
      });
      const ok = results.filter((e) => ['submitted', 'submitted-manually', 'filled'].includes(e.status)).length;
      console.log(`\nDone: ${ok} of ${results.length} entries succeeded.`);
      if (!opts.headless) await ask('\nPress Enter to close the browser.');
      return;
    }

    if (conditionals) {
      console.log('Searching for conditionals (trying each option and watching for new fields) ...');
      const d = await session.fill(chosen.id, { ...fillOpts, submit: false, discover: true });
      if (!d.conditionals.length) {
        console.log('\nNo conditionals found.');
        if (opts.submit && /^y/i.test((await ask('Submit the form as filled? [y/N] ')).trim())) printOutcome(await session.submit());
      } else {
        console.log(`\nConditionals found:\n${d.tree.map((l) => '  ' + l).join('\n')}`);
        console.log(`\n${d.plan.branchCount} branches, covered by ${d.plan.runs.length} run(s):`);
        d.plan.runs.forEach((run, i) => console.log(`  Run ${i + 1}: ${run.choices.join('; ')}`));
        const verb = opts.submit ? 'submissions' : 'fills (no submit)';
        if (/^y/i.test((await ask(`\nStart ${d.plan.runs.length} ${verb}? [y/N] `)).trim())) {
          const results = await session.runCoverage(chosen.id, d.plan.runs, {
            ...fillOpts,
            onRun: (e) => console.log(`  Run ${e.run}: ${e.status}${e.confirmation ? ` - ${e.confirmation.slice(0, 80)}` : ''}${e.errors.length ? ` - ${e.errors.join('; ')}` : ''}`),
            onCaptcha: (i, r) => solveCaptcha(r.captcha.kind),
          });
          const ok = results.filter((e) => /submitted|filled/.test(e.status) && e.status !== 'not-submitted').length;
          console.log(`\nDone: ${ok} of ${d.plan.runs.length} run(s) succeeded.`);
        }
      }
      if (!opts.headless) await ask('\nPress Enter to close the browser.');
      return;
    }

    let r = await session.fill(chosen.id, fillOpts);
    printResult(r);

    if (r.status === 'captcha') {
      const action = await solveCaptcha(r.captcha.kind);
      if (action === 'manual') r = await session.result({ status: 'submitted-manually' });
      else if (action === 'submit') r = await session.submit();
    }
    printOutcome(r);

    if (!opts.headless) await ask('\nPress Enter to close the browser.');
  } catch (e) {
    console.error(`\nError: ${e.message}`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await session.close();
  }
}

main().catch((e) => { console.error(e); exit(1); });
