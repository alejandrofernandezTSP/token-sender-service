const express = require('express');
const { ethers } = require('ethers');
const { mintNftHandler } = require('./mint-nft');
const { deployHandler } = require('./deploy-nft-contract');

const app = express();
app.use(express.json());

// Secret compartido - CÁMBIALO por uno aleatorio
const API_SECRET = process.env.API_SECRET || '3c4431a3-dbe9-4135-93e9-fbd92cae9ae6';

// Endpoint de health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'running',
        service: 'Token Sport Sender Service',
        timestamp: new Date().toISOString()
    });
});

// Endpoint para enviar tokens (SIN CAMBIOS - funciona igual que antes)
app.post('/send-tokens', async (req, res) => {
    console.log('📨 Request recibido para enviar tokens');
    
    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== API_SECRET) {
        console.log('❌ API Secret inválido');
        return res.status(401).json({ 
            success: false, 
            error: 'Unauthorized - Invalid API Secret' 
        });
    }
    
    const { private_key, alchemy_key, token_contract, to_address, amount } = req.body;
    
    if (!private_key || !alchemy_key || !token_contract || !to_address || !amount) {
        console.log('❌ Datos incompletos');
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required parameters' 
        });
    }
    
    if (!to_address.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.log('❌ Dirección inválida:', to_address);
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid wallet address' 
        });
    }
    
    try {
        console.log(`🔄 Iniciando transferencia de ${amount} TSP a ${to_address.substring(0, 10)}...`);
        
        const provider = new ethers.JsonRpcProvider(
            `https://polygon-mainnet.g.alchemy.com/v2/${alchemy_key}`
        );
        
        const wallet = new ethers.Wallet(private_key, provider);
        console.log(`💼 Wallet conectada: ${wallet.address}`);
        
        const abi = [
            "function transfer(address to, uint256 amount) returns (bool)"
        ];
        
        const contract = new ethers.Contract(token_contract, abi, wallet);
        
        const amountWei = ethers.parseUnits(amount, 18);
        console.log(`💰 Cantidad en Wei: ${amountWei.toString()}`);
        
        console.log('📤 Enviando transacción...');
        const tx = await contract.transfer(to_address, amountWei);
        console.log(`⏳ Transacción enviada: ${tx.hash}`);
        
        console.log('⏳ Esperando confirmación...');
        const receipt = await tx.wait(1);
        console.log(`✅ Transacción confirmada en bloque ${receipt.blockNumber}`);
        
        res.json({ 
            success: true, 
            tx_hash: receipt.hash,
            block_number: receipt.blockNumber,
            gas_used: receipt.gasUsed.toString()
        });
        
    } catch (error) {
        console.error('❌ Error en transferencia:', error.message);
        
        let errorMessage = error.message;
        
        if (error.code === 'INSUFFICIENT_FUNDS') {
            errorMessage = 'Fondos insuficientes en la wallet treasury';
        } else if (error.code === 'NONCE_EXPIRED') {
            errorMessage = 'Error de nonce. Intenta de nuevo.';
        } else if (error.message.includes('gas')) {
            errorMessage = 'Error de gas. Verifica que haya MATIC en la treasury wallet.';
        }
        
        res.status(500).json({ 
            success: false, 
            error: errorMessage,
            code: error.code
        });
    }
});

// ═══════════════════════════════════════════════
// NUEVOS ENDPOINTS - NFT minting
// ═══════════════════════════════════════════════

// Deploy contrato NFT (una sola vez)
app.post('/deploy-nft', async (req, res) => {
    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== API_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    // Pasa API_SECRET como RENDER_API_SECRET para que deploy handler lo use
    process.env.RENDER_API_SECRET = API_SECRET;
    await deployHandler(req, res);
});

// Mint NFT Fan ID
app.post('/mint-nft', async (req, res) => {
    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== API_SECRET) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    process.env.RENDER_API_SECRET = API_SECRET;
    await mintNftHandler(req, res);
});

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Token Sender Service running on port ${PORT}`);
    console.log(`🔐 API Secret configured: ${API_SECRET ? 'YES' : 'NO'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log(`🎨 NFT endpoints: /mint-nft, /deploy-nft`);
});
