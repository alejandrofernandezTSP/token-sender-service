const express = require('express');
const { ethers } = require('ethers');

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

// Endpoint para enviar tokens
app.post('/send-tokens', async (req, res) => {
    console.log('📨 Request recibido para enviar tokens');
    
    // Verificar API secret
    const secret = req.headers['x-api-secret'];
    if (!secret || secret !== API_SECRET) {
        console.log('❌ API Secret inválido');
        return res.status(401).json({ 
            success: false, 
            error: 'Unauthorized - Invalid API Secret' 
        });
    }
    
    const { private_key, alchemy_key, token_contract, to_address, amount } = req.body;
    
    // Validar datos requeridos
    if (!private_key || !alchemy_key || !token_contract || !to_address || !amount) {
        console.log('❌ Datos incompletos');
        return res.status(400).json({ 
            success: false, 
            error: 'Missing required parameters' 
        });
    }
    
    // Validar dirección de destino
    if (!to_address.match(/^0x[a-fA-F0-9]{40}$/)) {
        console.log('❌ Dirección inválida:', to_address);
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid wallet address' 
        });
    }
    
    try {
        console.log(`🔄 Iniciando transferencia de ${amount} TSP a ${to_address.substring(0, 10)}...`);
        
        // Conectar a Polygon via Alchemy
        const provider = new ethers.JsonRpcProvider(
            `https://polygon-mainnet.g.alchemy.com/v2/${alchemy_key}`
        );
        
        // Crear wallet desde private key
        const wallet = new ethers.Wallet(private_key, provider);
        console.log(`💼 Wallet conectada: ${wallet.address}`);
        
        // ABI del contrato ERC20 (solo función transfer)
        const abi = [
            "function transfer(address to, uint256 amount) returns (bool)"
        ];
        
        // Crear instancia del contrato
        const contract = new ethers.Contract(token_contract, abi, wallet);
        
        // Convertir cantidad a Wei (18 decimales para TSP)
        const amountWei = ethers.parseUnits(amount, 18);
        console.log(`💰 Cantidad en Wei: ${amountWei.toString()}`);
        
        // Enviar transacción
        console.log('📤 Enviando transacción...');
        const tx = await contract.transfer(to_address, amountWei);
        console.log(`⏳ Transacción enviada: ${tx.hash}`);
        
        // Esperar confirmación (1 bloque)
        console.log('⏳ Esperando confirmación...');
        const receipt = await tx.wait(1);
        console.log(`✅ Transacción confirmada en bloque ${receipt.blockNumber}`);
        
        // Respuesta exitosa
        res.json({ 
            success: true, 
            tx_hash: receipt.hash,
            block_number: receipt.blockNumber,
            gas_used: receipt.gasUsed.toString()
        });
        
    } catch (error) {
        console.error('❌ Error en transferencia:', error.message);
        
        // Manejar errores comunes
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

// Puerto dinámico para Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Token Sender Service running on port ${PORT}`);
    console.log(`🔐 API Secret configured: ${API_SECRET ? 'YES' : 'NO'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
});
