'use strict';
const { inspect } = require('./src/registry-reader.js');
const config = require('./evidence/registry-public-config.json');
inspect(config).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
