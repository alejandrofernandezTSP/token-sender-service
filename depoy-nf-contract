const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const contractJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'TokenSportNFT.json'), 'utf8'));
const ABI = contractJson.abi;
const BYTECODE = contractJson.bytecode;

const POLYGON_RPC = `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
const CONTRACT_NAME = 'Token Sport Fan ID';
const CONTRACT_SYMBOL = 'TSPORT';
const BASE_URI = process.env.NFT_BASE_URI || 'https://tokensport.co/nft-metadata/';

async function deployNFTContract() {
    console.log('=== DEPLOY NFT CONTRACT ===');
    if (!process.env.TREASURY_PRIVATE_KEY) throw new Error('TREASURY_PRIVATE_KEY no configurada');
    if (!process.env.ALCHEMY_API_KEY) throw new Error('ALCHEMY_API_KEY no configurada');

    const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
    const signer = new ethers.Wallet(process.env.TREASURY_PRIVATE_KEY, provider);
    console.log(`Wallet: ${signer.address}`);

    const balance = await provider.getBalance(signer.address);
    console.log(`Balance POL: ${ethers.formatEther(balance)}`);
    if (parseFloat(ethers.formatEther(balance)) < 0.01) throw new Error('Balance insuficiente (min 0.01 POL)');

    console.log(`Contrato: ${CONTRACT_NAME} (${CONTRACT_SYMBOL}), BaseURI: ${BASE_URI}`);
    const factory = new ethers.ContractFactory(ABI, BYTECODE, signer);
    console.log('Desplegando...');
    const contract = await factory.deploy(CONTRACT_NAME, CONTRACT_SYMBOL, BASE_URI);
    console.log(`TX: ${contract.deploymentTransaction().hash}`);
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`=== DESPLEGADO: ${addr} ===`);
    return addr;
}

async function deployHandler(req, res) {
    const apiSecret = process.env.RENDER_API_SECRET || '';
    if (apiSecret && req.headers['x-api-secret'] !== apiSecret) return res.status(403).json({ success: false, error: 'API secret invalido' });
    try {
        const address = await deployNFTContract();
        res.json({ success: true, contractAddress: address, message: `Contrato desplegado en ${address}`, explorer: `https://polygonscan.com/address/${address}` });
    } catch (err) {
        console.error('[DEPLOY] ERROR:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
}

if (require.main === module) {
    deployNFTContract().then(a => { console.log('Direccion:', a); process.exit(0); }).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { deployNFTContract, deployHandler };
