// Frontend Configuration
const CONFIG = {
    // Altere para a URL do seu backend no Ubuntu quando fizer deploy
    API_URL: window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://SEU_BACKEND_UBUNTU.com' // Substitua pela URL do seu servidor Ubuntu
};
