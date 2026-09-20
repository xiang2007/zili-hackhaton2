'use strict';

const opencellid = require('../src/opencellid');

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg.startsWith('--file=')) options.file = arg.slice(7);
    else if (arg.startsWith('--token=')) options.token = arg.slice(8);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  try {
    const meta = await opencellid.refresh(options);
    console.log(`OpenCelliD cells cached: ${meta.count}`);
    console.log(`Fetched at: ${meta.fetched_at}`);
    console.log(`Next refresh: ${meta.next_refresh_at}`);
  } catch (err) {
    console.error(`OpenCelliD refresh failed: ${err.message}`);
    process.exit(1);
  }
}

main();
