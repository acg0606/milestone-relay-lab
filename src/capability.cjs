const { JsonRpcProvider } = require('ethers');
const { chainInfo } = require('@gluwa/usc-sdk');

const DEFAULT_RPC_URL = 'https://rpc.cc3-testnet.creditcoin.network';
const EXPECTED_CHAIN_ID = 102031n;
const DEFAULT_TIMEOUT_MS = 20_000;

function validateRpcUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') {
    throw new Error('CREDITCOIN_RPC_HTTPS_REQUIRED');
  }
  if (parsed.hostname !== 'rpc.cc3-testnet.creditcoin.network') {
    throw new Error('CREDITCOIN_RPC_HOST_NOT_ALLOWED');
  }
  if (parsed.username || parsed.password) {
    throw new Error('CREDITCOIN_RPC_CREDENTIALS_NOT_ALLOWED');
  }
  return parsed.toString();
}

function decodeChainName(value) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(value)) {
    return value;
  }
  return Buffer.from(value.slice(2), 'hex').toString('utf8').replace(/\0+$/u, '');
}

function buildCapabilityResult({ observedAt, rpcUrl, network, blockNumber, sources }) {
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(`CREDITCOIN_CHAIN_ID_MISMATCH:${network.chainId}`);
  }

  return {
    schemaVersion: 1,
    observedAt,
    provenance: 'READ_ONLY_PUBLIC_RPC',
    externalReadPerformed: true,
    externalWritePerformed: false,
    walletUsed: false,
    transactionSubmitted: false,
    rpcHost: new URL(rpcUrl).host,
    destination: {
      chainId: network.chainId.toString(),
      blockNumber,
      chainInfoPrecompile: chainInfo.CHAIN_INFO_PRECOMPILE_ADDRESS,
    },
    supportedSources: sources.map((source) => ({
      chainKey: source.chainKey,
      chainId: source.chainId,
      chainName: decodeChainName(source.chainName),
      chainEncoding: source.chainEncoding,
      latestAttestation: source.latestAttestation,
    })),
  };
}

async function collectReadOnlyCapability({
  rpcUrl = process.env.CREDITCOIN_RPC_URL || DEFAULT_RPC_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const safeRpcUrl = validateRpcUrl(rpcUrl);
  const provider = new JsonRpcProvider(safeRpcUrl);

  try {
    return await Promise.race([
      (async () => {
        const network = await provider.getNetwork();
        const blockNumber = await provider.getBlockNumber();
        const capability = new chainInfo.PrecompileChainInfoProvider(provider);
        const supportedChains = await capability.getSupportedChains();
        const sources = [];

        for (const source of supportedChains) {
          sources.push({
            ...source,
            latestAttestation: await capability.getLatestAttestedHeightAndHash(source.chainKey),
          });
        }

        return buildCapabilityResult({
          observedAt: new Date().toISOString(),
          rpcUrl: safeRpcUrl,
          network,
          blockNumber,
          sources,
        });
      })(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('CREDITCOIN_READ_ONLY_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    provider.destroy();
  }
}

if (require.main === module) {
  collectReadOnlyCapability()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(JSON.stringify({
        provenance: 'READ_ONLY_PUBLIC_RPC',
        externalWritePerformed: false,
        walletUsed: false,
        transactionSubmitted: false,
        error: error.message,
      }));
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_RPC_URL,
  EXPECTED_CHAIN_ID,
  buildCapabilityResult,
  collectReadOnlyCapability,
  decodeChainName,
  validateRpcUrl,
};

