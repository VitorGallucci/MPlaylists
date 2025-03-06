// MPlaylists - Enhanced Implementation

/**
 * API Client Abstraction
 * Handles all Spotify API communication
 */
class SpotifyClient {
    constructor(token) {
        this.token = token;
        this.baseUrl = 'https://api.spotify.com/v1';
    }
    
    async getUser() {
        return this.request('/me');
    }
    
    async getUserPlaylists(limit = 50) {
        return this.request(`/me/playlists?limit=${limit}`);
    }
    
    async getPlaylistTracks(playlistId) {
        return this.request(`/playlists/${playlistId}/tracks`);
    }
    
    async getTrack(trackId) {
        return this.request(`/tracks/${trackId}`);
    }
    
    async searchTracks(query, limit = 20) {
        return this.request(`/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`);
    }
    
    async createPlaylist(userId, name, description, isPublic = false) {
        return this.request(`/users/${userId}/playlists`, {
            method: 'POST',
            body: JSON.stringify({
                name,
                description,
                public: isPublic
            })
        });
    }
    
    async addTrackToPlaylist(playlistId, trackUri) {
        return this.request(`/playlists/${playlistId}/tracks`, {
            method: 'POST',
            body: JSON.stringify({
                uris: [trackUri]
            })
        });
    }
    
    async removeTrackFromPlaylist(playlistId, trackUri) {
        return this.request(`/playlists/${playlistId}/tracks`, {
            method: 'DELETE',
            body: JSON.stringify({
                tracks: [{ uri: trackUri }]
            })
        });
    }
    
    async checkTracksLiked(trackIds) {
        return this.request(`/me/tracks/contains?ids=${trackIds.join(',')}`);
    }
    
    async toggleLike(trackId, isLiked) {
        return this.request(`/me/tracks?ids=${trackId}`, {
            method: isLiked ? 'DELETE' : 'PUT'
        });
    }
    
    // Novo método para obter um token de reprodução
    async getPlaybackToken() {
        return this.request('/me/player/devices');
    }
    
    // Método para iniciar a reprodução em um device
    async startPlayback(deviceId, uris) {
        return this.request(`/me/player/play?device_id=${deviceId}`, {
            method: 'PUT',
            body: JSON.stringify({
                uris: Array.isArray(uris) ? uris : [uris]
            })
        });
    }
    
    // Método para pausar a reprodução
    async pausePlayback() {
        return this.request('/me/player/pause', {
            method: 'PUT'
        });
    }
    
    async request(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            if (response.status === 401) {
                // Token expired, trigger refresh
                throw new Error('TOKEN_EXPIRED');
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API Error: ${response.status}`);
            }
            
            // Para requisições que não retornam conteúdo
            if (response.status === 204) {
                return { success: true };
            }
            
            return response.json();
        } catch (error) {
            if (error.message === 'TOKEN_EXPIRED') {
                // Handle token expiration
                app.handleTokenExpired();
            }
            throw error;
        }
    }
}

/**
 * Implements a simple state management pattern
 */
class AppState {
    constructor() {
        this.accessToken = null;
        this.currentUser = null;
        this.playlistTracks = [];
        this.currentPlaylistId = null;
        this.audioElement = null;
        this.playingButtonElement = null;
        this.currentTrackId = null;
        this.client = null;
        this.tracksCache = new Map(); // Cache para armazenar informações das faixas
        
        // Web Playback SDK state
        this.player = null;
        this.deviceId = null;
        this.isPlayerReady = false;
        this.isPremiumUser = false;
        this.isPlaying = false;
    }
    
    setToken(token) {
        this.accessToken = token;
        this.client = new SpotifyClient(token);
    }
    
    clearToken() {
        this.accessToken = null;
        this.client = null;
    }
    
    setUser(user) {
        this.currentUser = user;
        // Check if user is premium
        this.isPremiumUser = user.product === 'premium';
    }
    
    setCurrentPlaylist(playlistId) {
        this.currentPlaylistId = playlistId;
    }
    
    setPlaylistTracks(tracks) {
        this.playlistTracks = tracks;
    }
    
    setPlayerReady(deviceId) {
        this.isPlayerReady = true;
        this.deviceId = deviceId;
    }
    
    reset() {
        this.accessToken = null;
        this.currentUser = null;
        this.playlistTracks = [];
        this.currentPlaylistId = null;
        this.audioElement = null;
        this.playingButtonElement = null;
        this.currentTrackId = null;
        this.client = null;
        this.tracksCache = new Map();
        
        // Reset player state
        if (this.player) {
            this.player.disconnect();
            this.player = null;
        }
        this.deviceId = null;
        this.isPlayerReady = false;
        this.isPremiumUser = false;
        this.isPlaying = false;
    }
}

/**
 * UI Controller - manages DOM interactions
 */
class UIController {
    constructor(app) {
        this.app = app;
        this.state = app.state;
        
        // Cache DOM elements
        this.elements = {
            loginButton: document.getElementById('login-button'),
            logoutButton: document.getElementById('logout-button'),
            loginContainer: document.getElementById('login-container'),
            logoutContainer: document.getElementById('logout-container'),
            appContainer: document.getElementById('app-container'),
            searchInput: document.getElementById('search-input'),
            searchButton: document.getElementById('search-button'),
            searchResults: document.getElementById('search-results'),
            searchLoader: document.getElementById('search-loader'),
            playlistContainer: document.getElementById('playlist-container'),
            playlistLoader: document.getElementById('playlist-loader'),
            createPlaylistButton: document.getElementById('create-playlist-button'),
            playlistNameInput: document.getElementById('playlist-name'),
            playlistDescriptionInput: document.getElementById('playlist-description'),
            userInfoContainer: document.getElementById('user-info'),
            notification: document.getElementById('notification'),
            tabs: document.querySelectorAll('.tab'),
            tabContents: document.querySelectorAll('.tab-content'),
            playlistsListContainer: document.getElementById('playlists-list'),
            playlistTracksSection: document.getElementById('playlist-tracks-section'),
            currentPlaylistInfo: document.getElementById('current-playlist-info')
        };
        
        // Set up event listeners
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        const { elements, app } = this;
        
        elements.loginButton.addEventListener('click', () => app.initiateLogin());
        elements.logoutButton.addEventListener('click', () => app.logout());
        elements.searchButton.addEventListener('click', () => app.searchTracks());
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') app.searchTracks();
        });
        elements.createPlaylistButton.addEventListener('click', () => app.createPlaylist());
        
        // Implement debounced search
        elements.searchInput.addEventListener('input', this.debounce(() => {
            if (elements.searchInput.value.trim().length > 2) {
                app.searchTracks();
            }
        }, 300));
        
        // Set up tab navigation
        elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabId = tab.getAttribute('data-tab');
                
                // Update active tabs
                elements.tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // Update active content
                elements.tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(tabId + '-tab').classList.add('active');
                
                // If playlist tab selected, reload playlists
                if (tabId === 'playlist' && this.state.accessToken) {
                    app.loadUserPlaylists();
                    document.querySelector('.playlist-creation').style.display = 'block';
                }
            });
        });
    }
    
    showLoggedInView() {
        const { elements } = this;
        elements.loginContainer.style.display = 'none';
        elements.appContainer.style.display = 'block';
        elements.logoutContainer.style.display = 'block';
    }
    
    showLoggedOutView() {
        const { elements } = this;
        elements.loginContainer.style.display = 'block';
        elements.appContainer.style.display = 'none';
        elements.logoutContainer.style.display = 'none';
        
        // Clear all content areas
        elements.searchResults.innerHTML = '';
        elements.playlistContainer.innerHTML = '';
        elements.userInfoContainer.innerHTML = '';
        elements.playlistsListContainer.innerHTML = '';
        elements.currentPlaylistInfo.innerHTML = '';
    }
    
    updateUserInfo(user) {
        const { elements } = this;
        
        // Using optional chaining and fallback for image URL
        const imageUrl = user.images[0]?.url || 'Avatar_icon_green.svg.png';
        
        elements.userInfoContainer.innerHTML = `
            <img id="user-avatar" src="${imageUrl}" alt="Avatar" onerror="this.src='Avatar_icon_green.svg.png';">
            <span id="user-name">${user.display_name}</span>
            <span id="user-plan" class="user-plan">${user.product === 'premium' ? '(Premium)' : '(Free)'}</span>
        `;
    }
    
    updateCurrentPlaylistInfo(playlist) {
        const { elements } = this;
        
        // Using optional chaining and fallback for image URL
        const imageUrl = playlist.images[0]?.url || './assets/default-album.png';
        
        elements.currentPlaylistInfo.innerHTML = `
            <div class="current-playlist-header">
                <img src="${imageUrl}" alt="${playlist.name}" class="current-playlist-img" onerror="this.src='./assets/default-album.png';">
                <div>
                    <h2>${playlist.name}</h2>
                    <p>${playlist.description || 'Sem descrição'}</p>
                    <p class="owner">Por: ${playlist.owner.display_name}</p>
                    <p>${playlist.tracks.total} músicas</p>
                </div>
            </div>
        `;
        
        // Show the playlist tracks section
        elements.playlistTracksSection.style.display = 'block';
    }
    
    renderPlaylists(playlists) {
        const { elements, app } = this;
        elements.playlistsListContainer.innerHTML = '';
        
        if (playlists.length === 0) {
            elements.playlistsListContainer.innerHTML = '<p>Você não tem nenhuma playlist ainda.</p>';
            document.querySelector('.playlist-creation').style.display = 'block';
            return;
        }
        
        playlists.forEach(playlist => {
            const playlistElement = document.createElement('div');
            playlistElement.className = 'playlist-item';
            
            // Using optional chaining and fallback for image URL
            const imageUrl = playlist.images[0]?.url || './assets/default-album.png';
            
            playlistElement.innerHTML = `
                <div class="playlist-item-content">
                    <img src="${imageUrl}" alt="${playlist.name}" class="playlist-thumb" onerror="this.src='./assets/default-album.png';">
                    <div class="playlist-details">
                        <div class="playlist-name">${playlist.name}</div>
                        <div class="playlist-track-count">${playlist.tracks.total} músicas</div>
                    </div>
                </div>
                <button class="btn-select-playlist" data-id="${playlist.id}">Selecionar</button>
            `;
            
            elements.playlistsListContainer.appendChild(playlistElement);
            
            // Add event listener for the select button
            const selectButton = playlistElement.querySelector('.btn-select-playlist');
            selectButton.addEventListener('click', () => {
                app.selectPlaylist(playlist.id, playlist);
            });
        });
    }
    
    renderTrackResults(tracks, isSearchResult = true) {
        const { elements } = this;
        const container = isSearchResult ? elements.searchResults : elements.playlistContainer;
        
        container.innerHTML = '';
        
        if (tracks.length === 0) {
            container.innerHTML = `<p>${isSearchResult ? 'Nenhuma música encontrada.' : 'Nenhuma música na playlist ainda. Adicione músicas pela pesquisa!'}</p>`;
            return;
        }
        
        tracks.forEach(track => {
            // Armazenar a faixa no cache para uso futuro
            this.app.state.tracksCache.set(track.id, track);
            this.renderTrackCard(track, container, isSearchResult);
        });
    }
    
    renderTrackCard(track, container, isSearchResult) {
        const { app } = this;
        const card = document.createElement('div');
        card.className = 'track-card';
        
        // Using optional chaining and fallback for image URL
        const imageUrl = track.album.images[0]?.url || './assets/default-album.png';
        
        // Determinar qual texto mostrar no botão de play
        const playButtonText = app.state.currentTrackId === track.id && app.state.isPlaying ? '⏸️' : '▶️';
        
        card.innerHTML = `
            <img src="${imageUrl}" alt="${track.name}" class="track-img" onerror="this.src='./assets/default-album.png';">
            <div class="track-info">
                <div class="track-title">${track.name}</div>
                <div class="track-artist">${track.artists.map(a => a.name).join(', ')}</div>
                <div class="track-actions">
                    <button class="btn-icon play-track" data-id="${track.id}" data-uri="${track.uri}">
                        ${playButtonText}
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
        
        // Add event listeners
        const playButton = card.querySelector('.play-track');
        playButton.addEventListener('click', () => {
            app.playTrack(track.id, track.uri, playButton);
        });
        
        const likeButton = card.querySelector('.like-button');
        // Check if track is already liked
        app.checkIfLiked(track.id, likeButton);
        
        likeButton.addEventListener('click', () => {
            app.toggleLike(track.id, likeButton);
        });
        
        if (isSearchResult) {
            const addButton = card.querySelector('.add-to-playlist');
            addButton.addEventListener('click', () => {
                app.addToPlaylist(track.id);
            });
        } else {
            const removeButton = card.querySelector('.remove-from-playlist');
            removeButton.addEventListener('click', () => {
                app.removeFromPlaylist(track.id);
            });
        }
    }
    
    showLoader(loaderName, show = true) {
        if (this.elements[loaderName]) {
            this.elements[loaderName].style.display = show ? 'block' : 'none';
        }
    }
    
    showNotification(message) {
        const { notification } = this.elements;
        notification.textContent = message;
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    updatePlayButton(trackId, isPlaying) {
        // Atualizar todos os botões de play/pause
        document.querySelectorAll('.play-track').forEach(button => {
            const buttonTrackId = button.getAttribute('data-id');
            if (buttonTrackId === trackId) {
                button.textContent = isPlaying ? '⏸️' : '▶️';
            } else {
                button.textContent = '▶️';
            }
        });
    }
    
    // Utility function - debounce implementation
    debounce(func, delay) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    }
}

/**
 * Main Application Controller
 */
class App {
    constructor() {
        this.state = new AppState();
        this.ui = new UIController(this);
        
        // Inicializar o SDK do Spotify quando disponível
        window.onSpotifyWebPlaybackSDKReady = this.initializePlayer.bind(this);
        
        // Initialize the application
        this.init();
    }
    
    init() {
        // Check if we have a token in the URL (redirect after login)
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        
        if (accessToken) {
            // Remove token from URL
            history.replaceState({}, document.title, window.location.pathname);
            
            // Set token and initialize API client
            this.state.setToken(accessToken);
            
            // Show the main application
            this.handleLogin();
        }
    }
    
    // Authentication methods
    initiateLogin() {
        const state = this.generateRandomString(16);
        localStorage.setItem('spotify_auth_state', state);
        
        const authUrl = new URL(config.authEndpoint);
        authUrl.searchParams.append('client_id', config.clientId);
        authUrl.searchParams.append('response_type', 'token');
        authUrl.searchParams.append('redirect_uri', config.redirectUri);
        authUrl.searchParams.append('state', state);
        authUrl.searchParams.append('scope', config.scopes.join(' '));
        
        window.location.href = authUrl.toString();
    }
    
    handleLogin() {
        this.ui.showLoggedInView();
        
        // Fetch user profile
        this.fetchUserProfile();
    }
    
    logout() {
        this.state.reset();
        this.ui.showLoggedOutView();
    }
    
    handleTokenExpired() {
        this.ui.showNotification('Sessão expirada. Por favor, faça login novamente.');
        this.logout();
    }
    
    // Initialize Spotify Web Playback SDK
    initializePlayer() {
        if (!this.state.accessToken) return;
        
        const player = new Spotify.Player({
            name: 'M Playlists Player',
            getOAuthToken: cb => { cb(this.state.accessToken); },
            volume: 0.5
        });
        
        // Errors
        player.addListener('initialization_error', ({ message }) => {
            console.error('Failed to initialize player:', message);
            this.ui.showNotification('Erro ao inicializar player: ' + message);
        });
        
        player.addListener('authentication_error', ({ message }) => {
            console.error('Failed to authenticate player:', message);
            this.ui.showNotification('Erro de autenticação: ' + message);
            // Token provavelmente expirado, fazer logout
            this.handleTokenExpired();
        });
        
        player.addListener('account_error', ({ message }) => {
            console.error('Account error:', message);
            this.ui.showNotification('Erro de conta: Spotify Premium é necessário para reprodução completa');
            // Continuar com as previews para contas free
        });
        
        player.addListener('playback_error', ({ message }) => {
            console.error('Playback error:', message);
            this.ui.showNotification('Erro de reprodução: ' + message);
        });
        
        // Ready
        player.addListener('ready', ({ device_id }) => {
            console.log('Ready with Device ID', device_id);
            this.state.setPlayerReady(device_id);
        });
        
        // Not Ready
        player.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID is not ready for playback', device_id);
        });
        
        // State changes
        player.addListener('player_state_changed', state => {
            if (!state) return;
            
            console.log('Player state changed:', state);
            
            // Atualizar estado do player
            this.state.isPlaying = !state.paused;
            
            if (state.track_window.current_track) {
                const trackId = this.extractTrackId(state.track_window.current_track.uri);
                this.state.currentTrackId = trackId;
                
                // Atualizar UI
                this.ui.updatePlayButton(trackId, this.state.isPlaying);
            }
        });
        
        // Connect to the player
        player.connect().then(success => {
            if (success) {
                console.log('Spotify Web Playback SDK connected successfully');
            } else {
                console.warn('Spotify Web Playback SDK failed to connect');
            }
        });
        
        // Salvar player no state
        this.state.player = player;
    }
    
    // Extract track ID from uri (spotify:track:trackId)
    extractTrackId(uri) {
        return uri.split(':').pop();
    }
    
    // API operations
    async fetchUserProfile() {
        try {
            if (!this.state.client) {
                throw new Error('Cliente API não inicializado');
            }
            
            const userData = await this.state.client.getUser();
            this.state.setUser(userData);
            
            // Display user information
            this.ui.updateUserInfo(userData);
            
            // Load user playlists
            this.loadUserPlaylists();
            
        } catch (error) {
            console.error('Erro ao buscar perfil do usuário:', error);
            this.ui.showNotification('Erro ao carregar perfil do usuário');
        }
    }
    
    async loadUserPlaylists() {
        try {
            this.ui.showLoader('playlistLoader', true);
            
            const data = await this.state.client.getUserPlaylists();
            
            // Update UI
            this.ui.renderPlaylists(data.items);
            
            // Make sure playlist creation section is visible
            document.querySelector('.playlist-creation').style.display = 'block';
            
        } catch (error) {
            console.error('Erro ao carregar playlists:', error);
            this.ui.showNotification('Erro ao carregar suas playlists');
        } finally {
            this.ui.showLoader('playlistLoader', false);
        }
    }
    
    selectPlaylist(playlistId, playlist) {
        this.state.setCurrentPlaylist(playlistId);
        this.ui.updateCurrentPlaylistInfo(playlist);
        this.loadPlaylistTracks();
    }
    
    async loadPlaylistTracks() {
        const { currentPlaylistId } = this.state;
        if (!currentPlaylistId) return;
        
        try {
            this.ui.showLoader('playlistLoader', true);
            
            const data = await this.state.client.getPlaylistTracks(currentPlaylistId);
            const tracks = data.items.map(item => item.track).filter(track => track !== null);
            this.state.setPlaylistTracks(tracks);
            
            // Render tracks
            this.ui.renderTrackResults(tracks, false);
            
        } catch (error) {
            console.error('Erro ao carregar playlist:', error);
            this.ui.showNotification('Erro ao carregar playlist');
        } finally {
            this.ui.showLoader('playlistLoader', false);
        }
    }
    
    async searchTracks() {
        const query = this.ui.elements.searchInput.value.trim();
        if (!query) return;
        
        try {
            this.ui.showLoader('searchLoader', true);
            
            const data = await this.state.client.searchTracks(query);
            
            // Render search results
            this.ui.renderTrackResults(data.tracks.items, true);
            
        } catch (error) {
            console.error('Erro na busca:', error);
            this.ui.showNotification('Erro ao buscar músicas');
        } finally {
            this.ui.showLoader('searchLoader', false);
        }
    }
    
    async createPlaylist() {
        const name = this.ui.elements.playlistNameInput.value.trim() || 'M Playlists';
        const description = this.ui.elements.playlistDescriptionInput.value.trim() || 'Músicas adicionadas do M Playlists';
        
        try {
            this.ui.showLoader('playlistLoader', true);
            
            const playlist = await this.state.client.createPlaylist(
                this.state.currentUser.id,
                name,
                description
            );
            
            this.state.setCurrentPlaylist(playlist.id);
            
            // Update UI
            this.ui.updateCurrentPlaylistInfo(playlist);
            
            // Clear form fields
            this.ui.elements.playlistNameInput.value = '';
            this.ui.elements.playlistDescriptionInput.value = '';
            
            this.ui.showNotification('Playlist criada com sucesso!');
            
            // Reload playlists list
            this.loadUserPlaylists();
            
        } catch (error) {
            console.error('Erro ao criar playlist:', error);
            this.ui.showNotification('Erro ao criar playlist');
        } finally {
            this.ui.showLoader('playlistLoader', false);
        }
    }
    
    async addToPlaylist(trackId) {
        if (!this.state.currentPlaylistId) {
            this.ui.showNotification('Crie uma playlist primeiro!');
            
            // Switch to playlist tab
            this.ui.elements.tabs[1].click();
            return;
        }
        
        try {
            await this.state.client.addTrackToPlaylist(
                this.state.currentPlaylistId,
                `spotify:track:${trackId}`
            );
            
            this.ui.showNotification('Música adicionada à playlist!');
            
            // Reload playlist
            this.loadPlaylistTracks();
            
        } catch (error) {
            console.error('Erro ao adicionar à playlist:', error);
            this.ui.showNotification('Erro ao adicionar música');
        }
    }
    
    async removeFromPlaylist(trackId) {
        try {
            await this.state.client.removeTrackFromPlaylist(
                this.state.currentPlaylistId,
                `spotify:track:${trackId}`
            );
            
            this.ui.showNotification('Música removida da playlist');
            
            // Reload playlist
            this.loadPlaylistTracks();
            
        } catch (error) {
            console.error('Erro ao remover da playlist:', error);
            this.ui.showNotification('Erro ao remover música');
        }
    }
    
    async toggleLike(trackId, element) {
        try {
            // Check if track is already liked
            const [isLiked] = await this.state.client.checkTracksLiked([trackId]);
            
            // Perform the opposite action
            await this.state.client.toggleLike(trackId, isLiked);
            
            // Update UI
            element.classList.toggle('liked', !isLiked);
            element.innerHTML = !isLiked ? '❤️' : '🤍';
            
            this.ui.showNotification(isLiked ? 'Curtida removida' : 'Música curtida!');
            
        } catch (error) {
            console.error('Erro ao curtir/descurtir:', error);
            this.ui.showNotification('Erro ao curtir/descurtir música');
        }
    }
    
    async checkIfLiked(trackId, element) {
        try {
            const [isLiked] = await this.state.client.checkTracksLiked([trackId]);
            
            // Update UI
            element.classList.toggle('liked', isLiked);
            element.innerHTML = isLiked ? '❤️' : '🤍';
            
        } catch (error) {
            console.error('Erro ao verificar curtida:', error);
        }
    }
    
    async getTrackData(trackId) {
        // Verificar se já temos os dados da faixa em cache
        if (this.state.tracksCache.has(trackId)) {
            return this.state.tracksCache.get(trackId);
        }
        
        // Se não estiver em cache, buscar da API
        try {
            const trackData = await this.state.client.getTrack(trackId);
            // Armazenar em cache para uso futuro
            this.state.tracksCache.set(trackId, trackData);
            return trackData;
        } catch (error) {
            console.error('Erro ao buscar dados da faixa:', error);
            throw error;
        }
    }
    
    async playTrack(trackId, trackUri, button) {
        // Se for o mesmo ID que está tocando atualmente