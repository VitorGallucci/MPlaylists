// Configuração da API do Spotify

const config = {
    clientId: 'a22bb93486c34ad9b5eff33bbc2c9523', 
    redirectUri: window.location.origin + window.location.pathname,
    authEndpoint: 'https://accounts.spotify.com/authorize',
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
    scopes: [
        'user-read-private',
        'user-read-email',
        'user-library-read',
        'user-library-modify',
        'playlist-read-private',
        'playlist-modify-public',
        'playlist-modify-private'
    ]
};

// Estados da aplicação
let accessToken = null;
let currentUser = null;
let playlistTracks = [];
let currentPlaylistId = null;
let audioElement = null;
let playingButtonElement = null;

// Elementos do DOM
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const loginContainer = document.getElementById('login-container');
const logoutContainer = document.getElementById('logout-container');
const appContainer = document.getElementById('app-container');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const searchResults = document.getElementById('search-results');
const searchLoader = document.getElementById('search-loader');
const playlistContainer = document.getElementById('playlist-container');
const playlistLoader = document.getElementById('playlist-loader');
const createPlaylistButton = document.getElementById('create-playlist-button');
const playlistNameInput = document.getElementById('playlist-name');
const playlistDescriptionInput = document.getElementById('playlist-description');
const playlistInfo = document.getElementById('playlist-info');
const userInfoContainer = document.getElementById('user-info');
const notification = document.getElementById('notification');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Funções auxiliares
function generateRandomString(length) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function showNotification(message) {
    notification.textContent = message;
    notification.classList.add('show');
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Inicialização
function init() {
    // Verificar se temos token na URL (redirecionamento pós-login)
    const params = new URLSearchParams(window.location.hash.substring(1));
    accessToken = params.get('access_token');
    
    if (accessToken) {
        // Remover o token da URL
        history.replaceState({}, document.title, window.location.pathname);
        
        // Mostrar a aplicação principal
        handleLogin();
    }
    
    // Configurar os event listeners
    loginButton.addEventListener('click', initiateLogin);
    logoutButton.addEventListener('click', logout);
    searchButton.addEventListener('click', searchTracks);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchTracks();
    });
    createPlaylistButton.addEventListener('click', createPlaylist);
    
    // Event listener para abas
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // Atualizar tabs ativas
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Atualizar conteúdo ativo
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(tabId + '-tab').classList.add('active');
            
            // Se a aba de playlist for selecionada, recarregar playlists
            if (tabId === 'playlist' && accessToken) {
                loadUserPlaylists();
                // Garantir que a seção de criação esteja visível
                document.querySelector('.playlist-creation').style.display = 'block';
            }
        });
    });
}

// Autenticação
function initiateLogin() {
    const state = generateRandomString(16);
    localStorage.setItem('spotify_auth_state', state);
    
    const authUrl = new URL(config.authEndpoint);
    authUrl.searchParams.append('client_id', config.clientId);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('redirect_uri', config.redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', config.scopes.join(' '));
    
    window.location.href = authUrl.toString();
}

function handleLogin() {
    loginContainer.style.display = 'none';
    appContainer.style.display = 'block';
    logoutContainer.style.display = 'block';
    
    // Buscar informações do usuário
    fetchUserProfile();
}

function logout() {
    accessToken = null;
    currentUser = null;
    playlistTracks = [];
    currentPlaylistId = null;
    
    // Limpar a UI
    searchResults.innerHTML = '';
    playlistContainer.innerHTML = '';
    userInfoContainer.innerHTML = '';
    
    // Mostrar a tela de login
    loginContainer.style.display = 'block';
    appContainer.style.display = 'none';
    logoutContainer.style.display = 'none';
}

// Operações da API do Spotify
async function fetchUserProfile() {
    console.log('Token sendo usado:', accessToken);
    // Verificar se o token existe antes de fazer a requisição
    if (!accessToken) {
        console.error('Token de acesso não encontrado');
        showNotification('Erro de autenticação. Por favor, faça login novamente.');
        logout(); // Força o logout para obter um novo token
        return;
    }
    try {
        const response = await fetch('https://api.spotify.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) throw new Error('Falha ao buscar perfil');
        
        currentUser = await response.json();
        
        // Exibir informações do usuário
        userInfoContainer.innerHTML = `
            <img id="user-avatar" src="${currentUser.images[0]?.url || '/api/placeholder/40/40'}" alt="Avatar">
            <span id="user-name">${currentUser.display_name}</span>
        `;
        
        // Verificar se o usuário já tem uma playlist
        checkExistingPlaylist();
        
    } catch (error) {
        console.error('Erro ao buscar perfil do usuário:', error);
        showNotification('Erro ao carregar perfil do usuário');
    }
}

async function loadUserPlaylists() {
    try {
        // Verificar se o token existe
        if (!accessToken) {
            console.error('Token de acesso não encontrado');
            showNotification('Erro de autenticação. Por favor, faça login novamente.');
            logout();
            return;
        }
        
        playlistLoader.style.display = 'block';
        
        const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                // Token expirado
                showNotification('Sessão expirada. Por favor, faça login novamente.');
                logout();
                return;
            }
            throw new Error('Falha ao carregar playlists');
        }
        
        const data = await response.json();
        
        // Limpar a área de exibição de playlists
        const playlistsListContainer = document.getElementById('playlists-list');
        playlistsListContainer.innerHTML = '';
        
        if (data.items.length === 0) {
            playlistsListContainer.innerHTML = '<p>Você não tem nenhuma playlist ainda.</p>';
            // Garantir que a seção de criação esteja visível
            document.querySelector('.playlist-creation').style.display = 'block';
            return;
        }
        
        // Criar elemento para cada playlist
        data.items.forEach(playlist => {
            const playlistElement = document.createElement('div');
            playlistElement.className = 'playlist-item';
            
            const playlistImage = playlist.images[0]?.url || '/api/placeholder/60/60';
            
            playlistElement.innerHTML = `
                <div class="playlist-item-content">
                    <img src="${playlistImage}" alt="${playlist.name}" class="playlist-thumb">
                    <div class="playlist-details">
                        <div class="playlist-name">${playlist.name}</div>
                        <div class="playlist-track-count">${playlist.tracks.total} músicas</div>
                    </div>
                </div>
                <button class="btn-select-playlist" data-id="${playlist.id}">Selecionar</button>
            `;
            
            playlistsListContainer.appendChild(playlistElement);
            
            // Adicionar event listener para o botão de selecionar
            const selectButton = playlistElement.querySelector('.btn-select-playlist');
            selectButton.addEventListener('click', () => {
                currentPlaylistId = playlist.id;
                updateCurrentPlaylistInfo(playlist);
                loadPlaylistTracks();
            });
        });
        
    } catch (error) {
        console.error('Erro ao carregar playlists:', error);
        showNotification('Erro ao carregar suas playlists');
    } finally {
        playlistLoader.style.display = 'none';
    }
}

function updateCurrentPlaylistInfo(playlist) {
    const playlistInfoContainer = document.getElementById('current-playlist-info');
    playlistInfoContainer.innerHTML = `
        <div class="current-playlist-header">
            <img src="${playlist.images[0]?.url || '/api/placeholder/120/120'}" alt="${playlist.name}" class="current-playlist-img">
            <div>
                <h2>${playlist.name}</h2>
                <p>${playlist.description || 'Sem descrição'}</p>
                <p class="owner">Por: ${playlist.owner.display_name}</p>
                <p>${playlist.tracks.total} músicas</p>
            </div>
        </div>
    `;
    
    // Mostrar a seção de músicas da playlist
    document.getElementById('playlist-tracks-section').style.display = 'block';
}

async function checkExistingPlaylist() {
    // Carregar todas as playlists do usuário
    loadUserPlaylists();
    
    // Exibir a seção de criação de playlist
    document.querySelector('.playlist-creation').style.display = 'block';
}

async function createPlaylist() {
    const name = playlistNameInput.value.trim() || 'Spotify Explorer';
    const description = playlistDescriptionInput.value.trim() || 'Músicas adicionadas do Spotify Explorer';
    
    try {
        playlistLoader.style.display = 'block';
        
        const response = await fetch(`https://api.spotify.com/v1/users/${currentUser.id}/playlists`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                description,
                public: false
            })
        });
        
        if (!response.ok) throw new Error('Falha ao criar playlist');
        
        const playlist = await response.json();
        currentPlaylistId = playlist.id;
        
        // Atualizar a UI
        updateCurrentPlaylistInfo(playlist);
        
        // Limpar os campos do formulário
        playlistNameInput.value = '';
        playlistDescriptionInput.value = '';
        
        showNotification('Playlist criada com sucesso!');
        
        // Recarregar a lista de playlists
        loadUserPlaylists();
        
    } catch (error) {
        console.error('Erro ao criar playlist:', error);
        showNotification('Erro ao criar playlist');
    } finally {
        playlistLoader.style.display = 'none';
    }
}

async function searchTracks() {
    const query = searchInput.value.trim();
    
    if (!query) return;
    
    try {
        searchResults.innerHTML = '';
        searchLoader.style.display = 'block';
        
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) throw new Error('Falha na busca');
        
        const data = await response.json();
        
        if (data.tracks.items.length === 0) {
            searchResults.innerHTML = '<p>Nenhuma música encontrada.</p>';
            return;
        }
        
        data.tracks.items.forEach(track => {
            renderTrackCard(track, searchResults, true);
        });
        
    } catch (error) {
        console.error('Erro na busca:', error);
        showNotification('Erro ao buscar músicas');
    } finally {
        searchLoader.style.display = 'none';
    }
}

async function addToPlaylist(trackId) {
    if (!currentPlaylistId) {
        showNotification('Crie uma playlist primeiro!');
        
        // Mudar para a aba de playlist
        tabs[1].click();
        return;
    }
    
    try {
        const response = await fetch(`https://api.spotify.com/v1/playlists/${currentPlaylistId}/tracks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                uris: [`spotify:track:${trackId}`]
            })
        });
        
        if (!response.ok) throw new Error('Falha ao adicionar à playlist');
        
        showNotification('Música adicionada à playlist!');
        
        // Recarregar a playlist
        loadPlaylistTracks();
        
    } catch (error) {
        console.error('Erro ao adicionar à playlist:', error);
        showNotification('Erro ao adicionar música');
    }
}

async function removeFromPlaylist(trackId) {
    try {
        const response = await fetch(`https://api.spotify.com/v1/playlists/${currentPlaylistId}/tracks`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tracks: [{ uri: `spotify:track:${trackId}` }]
            })
        });
        
        if (!response.ok) throw new Error('Falha ao remover da playlist');
        
        showNotification('Música removida da playlist');
        
        // Recarregar a playlist
        loadPlaylistTracks();
        
    } catch (error) {
        console.error('Erro ao remover da playlist:', error);
        showNotification('Erro ao remover música');
    }
}

async function toggleLike(trackId, element) {
    try {
        // Verificar se a música já está curtida
        const response = await fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${trackId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) throw new Error('Falha ao verificar curtida');
        
        const [isLiked] = await response.json();
        
        // Fazer a operação oposta
        const method = isLiked ? 'DELETE' : 'PUT';
        const actionResponse = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${trackId}`, {
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!actionResponse.ok) throw new Error('Falha ao curtir/descurtir');
        
        // Atualizar a UI
        element.classList.toggle('liked', !isLiked);
        element.innerHTML = !isLiked ? '❤️' : '🤍';
        
        showNotification(isLiked ? 'Curtida removida' : 'Música curtida!');
        
    } catch (error) {
        console.error('Erro ao curtir/descurtir:', error);
        showNotification('Erro ao curtir/descurtir música');
    }
}

async function checkIfLiked(trackId, element) {
    try {
        const response = await fetch(`https://api.spotify.com/v1/me/tracks/contains?ids=${trackId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) throw new Error('Falha ao verificar curtida');
        
        const [isLiked] = await response.json();
        
        // Atualizar a UI
        element.classList.toggle('liked', isLiked);
        element.innerHTML = isLiked ? '❤️' : '🤍';
        
    } catch (error) {
        console.error('Erro ao verificar curtida:', error);
    }
}

async function loadPlaylistTracks() {
    if (!currentPlaylistId) return;
    
    try {
        playlistLoader.style.display = 'block';
        playlistContainer.innerHTML = '';
        
        const response = await fetch(`https://api.spotify.com/v1/playlists/${currentPlaylistId}/tracks`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) throw new Error('Falha ao carregar playlist');
        
        const data = await response.json();
        playlistTracks = data.items.map(item => item.track);
        
        if (playlistTracks.length === 0) {
            playlistContainer.innerHTML = '<p>Nenhuma música na playlist ainda. Adicione músicas pela pesquisa!</p>';
            return;
        }
        
        // Renderizar cada música
        playlistTracks.forEach(track => {
            renderTrackCard(track, playlistContainer, false);
        });
        
    } catch (error) {
        console.error('Erro ao carregar playlist:', error);
        showNotification('Erro ao carregar playlist');
    } finally {
        playlistLoader.style.display = 'none';
    }
}

// Função para lidar com reprodução de prévias
function handlePlayPreview(button, previewUrl) {
    // Se não houver URL de prévia disponível
    if (!previewUrl || previewUrl === "null" || previewUrl === "") {
        showNotification('Prévia não disponível para esta música');
        return;
    }
    
    // Se já houver um áudio tocando
    if (audioElement) {
        // Pausar o áudio atual
        audioElement.pause();
        
        // Resetar o botão que estava tocando
        if (playingButtonElement) {
            playingButtonElement.textContent = '▶️';
        }
        
        // Se for o mesmo botão que já estava tocando, só parar
        if (playingButtonElement === button) {
            playingButtonElement = null;
            audioElement = null;
            return;
        }
    }
    
    // Criar novo elemento de áudio
    audioElement = new Audio(previewUrl);
    
    // Reproduzir o áudio
    audioElement.play()
        .then(() => {
            // Atualizar o botão atual após começar a tocar
            button.textContent = '⏸️';
            playingButtonElement = button;
        })
        .catch(error => {
            console.error('Erro ao reproduzir áudio:', error);
            button.textContent = '▶️';
            showNotification('Erro ao reproduzir prévia. Verifique se o bloqueador de pop-ups está desativado.');
            audioElement = null;
        });
    
    // Quando terminar de tocar
    audioElement.addEventListener('ended', () => {
        if (playingButtonElement) {
            playingButtonElement.textContent = '▶️';
            playingButtonElement = null;
        }
        audioElement = null;
    });
    
    // Quando for pausado
    audioElement.addEventListener('pause', () => {
        if (playingButtonElement) {
            playingButtonElement.textContent = '▶️';
        }
    });
}

// Funções de renderização
function renderTrackCard(track, container, isSearchResult) {
    const card = document.createElement('div');
    card.className = 'track-card';
    
    // Verificar se a prévia existe e não é null/undefined/vazia
    const hasPreview = track.preview_url && track.preview_url !== "null" && track.preview_url !== "";
    
    const imageUrl = track.album.images[0]?.url || '/api/placeholder/200/200';
    
    card.innerHTML = `
        <img src="${imageUrl}" alt="${track.name}" class="track-img">
        <div class="track-info">
            <div class="track-title">${track.name}</div>
            <div class="track-artist">${track.artists.map(a => a.name).join(', ')}</div>
            <div class="track-actions">
                <button class="btn-icon play-preview" data-preview="${track.preview_url || ''}">
                    ${hasPreview ? '▶️' : '🔇'}
                </button>
                <button class="btn-icon like-button" data-id="${track.id}">🤍</button>
                ${isSearchResult ? 
                    `<button class="btn-icon add-to-playlist" data-id="${track.id}">➕</button>` : 
                    `<button class="btn-icon remove-from-playlist" data-id="${track.id}">➖</button>`
                }
            </div>
        </div>
    `;
    
    container.appendChild(card);
    
    // Adicionar event listeners
    const playButton = card.querySelector('.play-preview');
    playButton.addEventListener('click', () => {
        const previewUrl = playButton.getAttribute('data-preview');
        handlePlayPreview(playButton, previewUrl);
    });
    
    const likeButton = card.querySelector('.like-button');
    // Verificar se a música já está curtida
    checkIfLiked(track.id, likeButton);
    
    likeButton.addEventListener('click', () => {
        toggleLike(track.id, likeButton);
    });
    
    if (isSearchResult) {
        const addButton = card.querySelector('.add-to-playlist');
        addButton.addEventListener('click', () => {
            addToPlaylist(track.id);
        });
    } else {
        const removeButton = card.querySelector('.remove-from-playlist');
        removeButton.addEventListener('click', () => {
            removeFromPlaylist(track.id);
        });
    }
}

// Iniciar a aplicação
init();