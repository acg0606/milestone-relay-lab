'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const ganache=require('ganache');
const {BrowserProvider,ContractFactory,Contract,id,keccak256,AbiCoder}=require('ethers');
const {compileContracts}=require('../src/compile-contract.cjs');
const proof=require('../evidence/attestcoin-read-only-proof-2026-09-06.json');
const PRECOMPILE='0x0000000000000000000000000000000000000FD2';
const compiled=compileContracts();

test('contract admission, immutable policy, native-verifier gate and persistent replay protection',async()=>{
  // In-memory deterministic EVM identities only; no provider URL, wallet file or external call.
  const local=ganache.provider({logging:{quiet:true},chain:{chainId:102031,hardfork:'shanghai'},
    wallet:{deterministic:true,totalAccounts:2},miner:{instamine:'eager'}});
  const provider=new BrowserProvider(local);let registry;
  try {
    const owner=await provider.getSigner(0), relayer=await provider.getSigner(1);
    await local.request({method:'evm_setAccountCode',params:[PRECOMPILE,'0x'+compiled.mock.evm.deployedBytecode.object]});
    const mock=new Contract(PRECOMPILE,compiled.mock.abi,owner);
    registry=await new ContractFactory(compiled.registry.abi,'0x'+compiled.registry.evm.bytecode.object,owner).deploy();
    const deployed=await registry.deploymentTransaction().wait();
    const milestone=id('PUBLIC_BENCHMARK_MILESTONE_1'), second=id('PUBLIC_BENCHMARK_MILESTONE_2');
    const args=[milestone,proof.chainKey,proof.headerNumber,proof.txBytes,proof.merkleProof,proof.continuityProof];
    const digest=keccak256(proof.txBytes);
    await assert.rejects(registry.verifyMilestone.staticCall(...args),/MilestoneNotConfigured/);
    await assert.rejects(registry.connect(relayer).configureMilestone.staticCall(milestone,proof.headerNumber,digest),/OwnerOnly/);
    await assert.rejects(registry.configureMilestone.staticCall(milestone,0,digest),/InvalidPolicy/);
    const configured=await (await registry.configureMilestone(milestone,proof.headerNumber,digest)).wait();
    await assert.rejects(registry.configureMilestone.staticCall(milestone,proof.headerNumber,digest),/PolicyAlreadyConfigured/);
    await assert.rejects(registry.verifyMilestone.staticCall(milestone,3,...args.slice(2)),/SourceBindingMismatch/);
    await assert.rejects(registry.verifyMilestone.staticCall(milestone,1,proof.headerNumber+1,...args.slice(3)),/SourceBindingMismatch/);
    await assert.rejects(registry.verifyMilestone.staticCall(milestone,1,proof.headerNumber,'0x1234',...args.slice(4)),/SourceBindingMismatch/);
    await assert.rejects(registry.verifyMilestone.staticCall(...args),/NativeProofRejected/);
    assert.equal((await registry.milestones(milestone)).verified,false);
    await (await mock.setMode(2)).wait();
    await assert.rejects(registry.verifyMilestone.staticCall(...args),/MOCK_INVALID_PROOF/);
    assert.equal((await registry.milestones(milestone)).verified,false);
    await (await mock.setMode(1)).wait();
    const verified=await (await registry.connect(relayer).verifyMilestone(...args)).wait();
    assert.equal((await registry.milestones(milestone)).verified,true);
    const event=verified.logs.map(log=>{try{return registry.interface.parseLog(log);}catch{return null;}}).find(item=>item?.name==='EvidenceVerified');
    assert.equal(event.args.milestoneId,milestone);assert.equal(event.args.relayer,await relayer.getAddress());
    const evidenceKey=keccak256(AbiCoder.defaultAbiCoder().encode(['uint64','bytes32'],[1,digest]));
    assert.equal(await registry.consumedEvidence(evidenceKey),true);
    await assert.rejects(registry.verifyMilestone.staticCall(...args),/MilestoneAlreadyVerified/);
    await (await registry.configureMilestone(second,proof.headerNumber,digest)).wait();
    await assert.rejects(registry.verifyMilestone.staticCall(second,...args.slice(1)),/EvidenceAlreadyConsumed/);
    const freshClient=new Contract(await registry.getAddress(),compiled.registry.abi,provider);
    assert.equal((await freshClient.milestones(milestone)).verified,true);
    assert.equal(await freshClient.consumedEvidence(evidenceKey),true);
    await assert.rejects(owner.sendTransaction({to:await registry.getAddress(),value:1n}));
    assert.equal(await provider.getBalance(await registry.getAddress()),0n);
    const receipt={status:'PASS_LOCAL_EVM',compiler:compiled.compiler,evmVersion:compiled.evmVersion,
      verifier:'MOCK_AT_OFFICIAL_ADDRESS',realPrecompileExecuted:false,externalCalls:0,publicDeployment:false,
      actualNetworkWalletCreated:false,localSyntheticAccounts:2,checks:16,
      gas:{deploy:deployed.gasUsed.toString(),configure:configured.gasUsed.toString(),verifyWithMock:verified.gasUsed.toString()},
      covered:['unknown milestone','unauthorized policy','invalid policy','immutable policy','wrong source chain','wrong height','wrong bytes',
        'native false','native revert','no mutation on failure','verified storage','event and relayer','same milestone replay',
        'cross-milestone replay','fresh-client persistent storage','reject value transfer'],
      limit:'Mock validates application behavior only; real precompile receipt is a separate read-only observation.'};
    fs.writeFileSync(path.resolve(__dirname,'..','evidence','registry-local-evm-2026-09-06.json'),JSON.stringify(receipt,null,2)+'\n');
  } finally {await provider.destroy();await local.disconnect();}
});

test('deployment is rejected outside Creditcoin testnet',async()=>{
  const local=ganache.provider({logging:{quiet:true},chain:{chainId:1},wallet:{deterministic:true,totalAccounts:1}});
  const provider=new BrowserProvider(local);
  try {const signer=await provider.getSigner();
    await assert.rejects(new ContractFactory(compiled.registry.abi,'0x'+compiled.registry.evm.bytecode.object,signer).deploy());
  } finally {await provider.destroy();await local.disconnect();}
});
