#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
const {Interface,JsonRpcProvider,FetchRequest,id,keccak256,isAddress}=require('ethers');
const {compileContracts}=require('./src/compile-contract.cjs');
const proof=require('./evidence/attestcoin-read-only-proof-2026-09-06.json');
const RPC='https://rpc.cc3-testnet.creditcoin.network';
async function main(){
  const args=process.argv.slice(2);
  if(args.includes('--broadcast')||args.includes('--sign'))throw new Error('BROADCAST_AND_SIGNING_UNSUPPORTED');
  if(!args.includes('--write-plan')){console.log(JSON.stringify({status:'DISABLED_BY_DEFAULT',hint:'Use --write-plan to produce unsigned calldata only. Optional --estimate-read-only performs RPC reads.'}));return;}
  const compiled=compileContracts();const iface=new Interface(compiled.registry.abi);
  const registryIndex=args.indexOf('--registry');const registry=registryIndex<0?null:args[registryIndex+1];
  if(registry!==null&&!isAddress(registry))throw new Error('REGISTRY_ADDRESS_INVALID');
  const milestoneId=id('PUBLIC_BENCHMARK_MILESTONE_1');
  const plan={schemaVersion:1,status:'UNSIGNED_OWNER_ACTION_REQUIRED',chainId:102031,rpc:RPC,
    createdAt:new Date().toISOString(),compiler:compiled.compiler,evmVersion:compiled.evmVersion,
    owner:'The deployment sender becomes the immutable owner; no address is guessed.',
    boundary:{walletCreated:false,signatureCreated:false,transactionSubmitted:false,assetPrincipalTransferred:false},
    purpose:'Register inclusion of the exact public benchmark. This does not prove project work or release escrow.',
    actions:[
      {step:1,name:'Deploy MilestoneEvidenceRegistry',to:null,value:'0',data:'0x'+compiled.registry.evm.bytecode.object},
      {step:2,name:'Owner commits benchmark policy',to:registry,requiresDeployedAddress:true,value:'0',data:iface.encodeFunctionData('configureMilestone',[milestoneId,proof.headerNumber,keccak256(proof.txBytes)])},
      {step:3,name:'Verify proof and persist evidence',to:registry,requiresDeployedAddress:true,value:'0',data:iface.encodeFunctionData('verifyMilestone',[milestoneId,proof.chainKey,proof.headerNumber,proof.txBytes,proof.merkleProof,proof.continuityProof])},
    ],
    humanChecks:['Use only CC3 Testnet chain 102031 and a dedicated testnet identity.','Obtain testnet gas through the official faucet if needed. No real asset principal is required.',
      'Inspect source code, source bytes hash, benchmark provenance, calldata and gas before each signature.',
      'After deployment pass --registry ADDRESS to generate step 2 and 3 recipients; do not sign a null recipient call.',
      'Capture contract address, deployment/configuration/verification receipts and EvidenceVerified event.','Query persistent state and confirm duplicate evidence reverts.'],
    estimates:{status:'NOT_REQUESTED',feeMeaning:'Testnet gas only; not a quote or guarantee. Native proof execution cost is not established by a local mock.'}};
  if(args.includes('--estimate-read-only')){
    const request=new FetchRequest(RPC);request.timeout=15000;const provider=new JsonRpcProvider(request);
    try{
      const network=await provider.getNetwork();if(network.chainId!==102031n)throw new Error('DESTINATION_CHAIN_MISMATCH');
      const gas=await provider.estimateGas({data:plan.actions[0].data,value:0n});
      const gasPrice=BigInt(await provider.send('eth_gasPrice',[]));
      plan.estimates={status:'DEPLOY_ESTIMATED_READ_ONLY',observedAt:new Date().toISOString(),deploymentGas:gas.toString(),gasPriceWei:gasPrice.toString(),deploymentFeeWeiAtObservedGasPrice:(gas*gasPrice).toString(),
        configurationGas:'UNKNOWN_UNTIL_DEPLOYED',nativeProofVerificationGas:'UNKNOWN_UNTIL_DEPLOYED',feeMeaning:'Read-only RPC deployment estimate; testnet gas only; not a guaranteed total.'};
    }catch(error){plan.estimates={status:'UNAVAILABLE',message:error.shortMessage||error.message};}finally{provider.destroy();}
  }
  const target=path.resolve(__dirname,'evidence','registry-testnet-unsigned-plan-2026-09-06.json');
  fs.writeFileSync(target,JSON.stringify(plan,null,2)+'\n');console.log(JSON.stringify({status:plan.status,path:'evidence/registry-testnet-unsigned-plan-2026-09-06.json',estimate:plan.estimates,transactionSubmitted:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
