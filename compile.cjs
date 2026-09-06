#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
const {compileContracts}=require('./src/compile-contract.cjs');
const result=compileContracts();const folder=path.resolve(__dirname,'output','contracts');
fs.mkdirSync(folder,{recursive:true});
fs.writeFileSync(path.join(folder,'MilestoneEvidenceRegistry.json'),JSON.stringify({compiler:result.compiler,evmVersion:result.evmVersion,
  abi:result.registry.abi,bytecode:'0x'+result.registry.evm.bytecode.object,deployedBytecode:'0x'+result.registry.evm.deployedBytecode.object,
  gasEstimates:result.registry.evm.gasEstimates},null,2)+'\n');
fs.writeFileSync(path.join(folder,'solc-input.json'),JSON.stringify(result.input,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',compiler:result.compiler,evmVersion:result.evmVersion,bytecodeBytes:result.registry.evm.bytecode.object.length/2,
  warnings:result.warnings.length,publicDeployment:false}));
