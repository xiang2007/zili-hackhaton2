'use strict';

require('../src/env');

const dashboardData = require('../src/dashboard-data');

try {
  const result = dashboardData.build();
  console.log(`Dashboard data built: ${result.sites.toLocaleString()} sites, ${result.gridCells.toLocaleString()} grid cells`);
} catch (error) {
  console.error(`Dashboard data build failed: ${error.message}`);
  process.exit(1);
}
