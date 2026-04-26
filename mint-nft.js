BigInt.prototype.toJSON = function() { return this.toString(); };
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const MINT_ABI = [
    "function mint(address to) external returns (uint256)",
    "function checkNftStatus(address wallet) external view returns (bool)",
    "function totalMinted() external view returns (uint256)",
    "function totalSupply() external view returns (uint256)",
    "function owner() external view returns (address)",
    "function hasReceivedNft(address) external view returns (bool)"
];

function getRpcUrl(alchemyKey) {
    return `https://polygon-mainnet.g.alchemy.com/v2/${alchemyKey}`;
}

async function mintNFT({ toAddress, privateKey, alchemyKey, contractAddress }) {
    console.log(`[MINT] Iniciando mint para ${toAddress}`);

    if (!toAddress || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
        throw new Error('Dirección destino inválida');
    }
    if (!privateKey || !privateKey.startsWith('0x')) {
        throw new Error('Private key inválida');
    }
    if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
        throw new Error('Dirección del contrato inválida');
    }

    const provider = new ethers.JsonRpcProvider(getRpcUrl(alchemyKey));
    const signer = new ethers.Wallet(privateKey, provider);

    console.log(`[MINT] Wallet: ${signer.address}`);
    console.log(`[MINT] Contrato: ${contractAddress}`);
    console.log(`[MINT] Destino: ${toAddress}`);

    const contract = new ethers.Contract(contractAddress, MINT_ABI, provider);
    const owner = await contract.owner();

    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error(`La wallet ${signer.address} NO es owner del contrato. Owner: ${owner}`);
    }

    const alreadyHas = await contract.hasReceivedNft(toAddress);
    if (alreadyHas) {
        throw new Error('Este usuario ya recibió su NFT Fan ID');
    }

    const balance = await provider.getBalance(signer.address);
    const polBalance = ethers.formatEther(balance);

    if (parseFloat(polBalance) < 0.005) {
        throw new Error(`Balance POL insuficiente: ${polBalance} (mínimo ~0.005 para mint)`);
    }

    const mintContract = new ethers.Contract(contractAddress, MINT_ABI, signer);
    let gasEstimate;
    try {
        gasEstimate = await mintContract.mint.estimateGas(toAddress);
    } catch (err) {
        throw new Error('No se pudo estimar gas.');
    }

    const gasLimit = (gasEstimate * 120n) / 100n;
    const tx = await mintContract.mint(toAddress, { gasLimit });
    console.log(`[MINT] TX Hash: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[MINT] TX confirmada en bloque ${receipt.blockNumber}`);

    let tokenId = null;
    for (const log of receipt.logs) {
        try {
            const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
            if (parsed && parsed.name === 'NFTMinted') {
                tokenId = parsed.args.tokenId?.toString();
                break;
            }
            if (parsed && parsed.name === 'Transfer') {
                tokenId = parsed.args.tokenId?.toString();
            }
        } catch (e) {}
    }

    if (!tokenId) {
        tokenId = await mintContract.totalMinted();
    }

    return {
        txHash: receipt.hash,
        tokenId: tokenId,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString()
    };
}

async function mintNftHandler(req, res) {
    const apiSecret = process.env.RENDER_API_SECRET || '';
    if (apiSecret && req.headers['x-api-secret'] !== apiSecret) {
        return res.status(403).json({ success: false, error: 'API secret inválido' });
    }

    try {
        const { to_address, contract_address } = req.body;

        // Credenciales desde ENV VARS (nunca del request body)
        const privateKey = process.env.TREASURY_PRIVATE_KEY;
        const alchemyKey = process.env.ALCHEMY_API_KEY;

        if (!privateKey) {
            return res.status(500).json({ success: false, error: 'TREASURY_PRIVATE_KEY no configurada' });
        }
        if (!alchemyKey) {
            return res.status(500).json({ success: false, error: 'ALCHEMY_API_KEY no configurada' });
        }

        const result = await mintNFT({
            toAddress: to_address,
            privateKey: privateKey,
            alchemyKey: alchemyKey,
            contractAddress: contract_address
        });

        res.json({
            success: true,
            tx_hash: result.txHash,
            token_id: result.tokenId,
            block_number: result.blockNumber,
            gas_used: result.gasUsed,
            message: `NFT #${result.tokenId} minteado exitosamente`,
            explorer: `https://polygonscan.com/tx/${result.txHash}`
        });

    } catch (err) {
        console.error(`[MINT] ERROR: ${err.message}`);
        if (err.message.includes('ya recibió')) {
            return res.status(409).json({ success: false, error: err.message });
        }
        res.status(500).json({ success: false, error: err.message });
    }
}

module.exports = { mintNFT, mintNftHandler };
