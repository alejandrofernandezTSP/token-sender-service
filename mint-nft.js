const { ethers } = require('ethers');

const MINT_ABI = [
    "function mint(address to) external returns (uint256)",
    "function checkNftStatus(address wallet) external view returns (bool)",
    "function totalMinted() external view returns (uint256)",
    "function owner() external view returns (address)",
    "function hasReceivedNft(address) external view returns (bool)"
];

function getRpcUrl(alchemyKey) {
    return `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`;
}

async function mintNFT({ toAddress, privateKey, alchemyKey, contractAddress }) {
    console.log(`[MINT] Para ${toAddress}`);
    if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) throw new Error('Direccion destino invalida');
    if (!privateKey || !privateKey.startsWith('0x')) throw new Error('Private key invalida');
    if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) throw new Error('Direccion contrato invalida');

    const provider = new ethers.JsonRpcProvider(getRpcUrl(alchemyKey));
    const signer = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, MINT_ABI, provider);

    console.log(`[MINT] Wallet: ${signer.address}, Contrato: ${contractAddress}`);

    const owner = await contract.owner();
    if (owner.toLowerCase() !== signer.address.toLowerCase()) throw new Error(`Wallet NO es owner. Owner: ${owner}`);

    const alreadyHas = await contract.hasReceivedNft(toAddress);
    if (alreadyHas) throw new Error('Este usuario ya recibio su NFT Fan ID');

    const polBalance = await provider.getBalance(signer.address);
    if (parseFloat(ethers.formatEther(polBalance)) < 0.005) throw new Error('Balance POL insuficiente');

    const mintContract = new ethers.Contract(contractAddress, MINT_ABI, signer);
    let gasEstimate = await mintContract.mint.estimateGas(toAddress);
    const gasLimit = (gasEstimate * 120n) / 100n;

    console.log(`[MINT] Ejecutando...`);
    const tx = await mintContract.mint(toAddress, { gasLimit });
    console.log(`[MINT] TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[MINT] Confirmado bloque ${receipt.blockNumber}`);

    let tokenId = null;
    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
            if (parsed && parsed.name === 'NFTMinted') { tokenId = parsed.args.tokenId?.toString(); break; }
            if (parsed && parsed.name === 'Transfer') { tokenId = parsed.args.tokenId?.toString(); }
        } catch (e) {}
    }
    if (!tokenId) tokenId = await mintContract.totalMinted();

    return { txHash: receipt.hash, tokenId, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString() };
}

async function mintNftHandler(req, res) {
    const apiSecret = process.env.RENDER_API_SECRET || '';
    if (apiSecret && req.headers['x-api-secret'] !== apiSecret) return res.status(403).json({ success: false, error: 'API secret invalido' });
    try {
        const { to_address, private_key, alchemy_key, contract_address } = req.body;
        const result = await mintNFT({ toAddress: to_address, privateKey: private_key, alchemyKey: alchemy_key, contractAddress: contract_address });
        res.json({ success: true, tx_hash: result.txHash, token_id: result.tokenId, message: `NFT #${result.tokenId} minteado`, explorer: `https://polygonscan.com/tx/${result.txHash}` });
    } catch (err) {
        console.error(`[MINT] ERROR: ${err.message}`);
        if (err.message.includes('ya recibio')) return res.status(409).json({ success: false, error: err.message });
        if (err.message.includes('NO es owner')) return res.status(403).json({ success: false, error: err.message });
        if (err.message.includes('insuficiente')) return res.status(503).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = { mintNFT, mintNftHandler };
