// Passes only when the shell hands it a variable a stranger's shell would not have.
if (!process.env.OTHERBOX_FIXTURE_SECRET) {
  console.error('OTHERBOX_FIXTURE_SECRET is missing');
  process.exit(1);
}
