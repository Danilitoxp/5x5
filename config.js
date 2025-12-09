// Frontend Configuration
const CONFIG = {
    // Detecta automaticamente o ambiente
    API_URL: (() => {
        // Se estiver rodando localmente
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'http://localhost:3000';
        }

        // Se estiver na Vercel, use o ngrok (temporário) ou backend Ubuntu (quando estiver pronto)
        // IMPORTANTE: Atualize com sua URL do ngrok ou do servidor Ubuntu
        return 'https://SEU_NGROK_OU_UBUNTU_AQUI.com';
    })()
};
