'use strict';
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');

function compileContracts() {
  const root = path.resolve(__dirname, '..');
  const names = ['contracts/MilestoneEvidenceRegistry.sol', 'contracts/test/MockAttestcoinVerifier.sol'];
  const sources = Object.fromEntries(names.map(name => [name, {content:fs.readFileSync(path.join(root,name),'utf8')}]));
  const input = { language:'Solidity', sources, settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',
    outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.gasEstimates']}}} };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(error=>error.severity==='error');
  if(errors.length) throw new Error(errors.map(error=>error.formattedMessage).join('\n'));
  return { compiler:solc.version(), evmVersion:'paris', input, warnings:output.errors||[],
    registry:output.contracts[names[0]].MilestoneEvidenceRegistry,
    mock:output.contracts[names[1]].MockAttestcoinVerifier };
}

module.exports = { compileContracts };
