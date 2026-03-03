/* ═══════════════════════════════════════════════
   ChatVibe Pro — Full SPA Client
   ═══════════════════════════════════════════════ */

(() => {
    const app = document.getElementById('app');
    let socket = null;
    let currentUser = null;
    let currentRoom = 'general';
    let rooms = [];
    let roomUsers = [];
    let typingTimeout = null;
    let sidebarOpen = false;

    // ═══════════════════════════
    //  ROUTER
    // ═══════════════════════════
    function navigate(hash) {
        window.location.hash = hash;
    }

    async function router() {
        const hash = window.location.hash || '#/login';

        // If not logged in, only allow auth pages
        if (!currentUser && hash !== '#/login' && hash !== '#/register') {
            navigate('#/login');
            return;
        }

        // If logged in but on auth pages, redirect to chat
        if (currentUser && (hash === '#/login' || hash === '#/register')) {
            navigate('#/chat');
            return;
        }

        switch (hash) {
            case '#/login': renderLogin(); break;
            case '#/register': renderRegister(); break;
            case '#/chat': renderChat(); break;
            case '#/profile': renderProfile(); break;
            case '#/settings': renderSettings(); break;
            default: navigate(currentUser ? '#/chat' : '#/login');
        }
    }

    window.addEventListener('hashchange', router);

    // ═══════════════════════════
    //  INIT — Check session
    // ═══════════════════════════
    async function init() {
        try {
            const res = await fetch('/api/me');
            if (res.ok) {
                const data = await res.json();
                currentUser = data.user;
                connectSocket();
            }
        } catch (e) { /* not logged in */ }
        router();
    }

    // ═══════════════════════════
    //  SOCKET.IO
    // ═══════════════════════════
    function connectSocket() {
        if (socket) return;
        socket = io();

        socket.on('connect', () => {
            socket.emit('join room', currentRoom);
        });

        socket.on('chat message', (msg) => {
            if (msg.room === currentRoom) appendMessage(msg);
        });

        socket.on('system message', (data) => {
            if (data.room === currentRoom) appendSystemMessage(data.text);
        });

        socket.on('room users', (users) => {
            roomUsers = users;
            updateOnlineUsers();
        });

        socket.on('online count', (count) => {
            const badge = document.querySelector('.online-badge');
            if (badge) badge.textContent = `${count} online`;
        });

        socket.on('typing', (data) => {
            if (data.room === currentRoom) {
                const el = document.querySelector('.typing-indicator');
                const txt = document.querySelector('.typing-text');
                if (el && txt) {
                    el.classList.add('visible');
                    txt.textContent = `${data.username} is typing…`;
                }
            }
        });

        socket.on('stop typing', (data) => {
            if (data.room === currentRoom) {
                const el = document.querySelector('.typing-indicator');
                if (el) el.classList.remove('visible');
            }
        });
    }

    function joinRoom(roomId) {
        currentRoom = roomId;
        if (socket) socket.emit('join room', roomId);

        // Update active state in sidebar
        document.querySelectorAll('.room-item').forEach(el => {
            el.classList.toggle('active', el.dataset.room === roomId);
        });

        // Reload messages
        loadMessages();

        // Update chat header
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            const info = document.querySelector('.room-info');
            if (info) {
                info.innerHTML = `
          <span class="room-icon-lg">${room.icon}</span>
          <div>
            <h3>${room.name}</h3>
            <span class="room-desc">${room.description}</span>
          </div>
        `;
            }
        }

        closeSidebar();
    }

    async function loadMessages() {
        const area = document.querySelector('.messages-area');
        if (!area) return;
        area.innerHTML = '';

        try {
            const res = await fetch(`/api/messages/${currentRoom}`);
            if (res.ok) {
                const data = await res.json();
                data.messages.forEach(msg => appendMessage(msg, false));
                area.scrollTop = area.scrollHeight;
            }
        } catch (e) { /* ignore */ }
    }

    // ═══════════════════════════
    //  LOGIN PAGE
    // ═══════════════════════════
    function renderLogin() {
        app.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <div class="brand">
            <span class="brand-icon">💬</span>
            <h1>ChatVibe</h1>
            <p>Welcome back! Sign in to continue</p>
          </div>
          <div class="auth-error" id="auth-error"></div>
          <form id="login-form">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="login-email" placeholder="you@example.com" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="login-password" placeholder="••••••••" required>
            </div>
            <button type="submit" class="btn btn-primary" id="login-btn">Sign In</button>
          </form>
          <div class="auth-footer">
            Don't have an account? <a href="#/register">Create one</a>
          </div>
        </div>
      </div>
    `;

        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('login-btn');
            const errEl = document.getElementById('auth-error');
            btn.disabled = true;
            btn.textContent = 'Signing in…';
            errEl.classList.remove('visible');

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: document.getElementById('login-email').value,
                        password: document.getElementById('login-password').value
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    currentUser = data.user;
                    connectSocket();
                    navigate('#/chat');
                } else {
                    errEl.textContent = data.error;
                    errEl.classList.add('visible');
                }
            } catch {
                errEl.textContent = 'Connection error. Please try again.';
                errEl.classList.add('visible');
            }
            btn.disabled = false;
            btn.textContent = 'Sign In';
        });
    }

    // ═══════════════════════════
    //  REGISTER PAGE
    // ═══════════════════════════
    function renderRegister() {
        app.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <div class="brand">
            <span class="brand-icon">✨</span>
            <h1>Join ChatVibe</h1>
            <p>Create your account to start chatting</p>
          </div>
          <div class="auth-error" id="auth-error"></div>
          <form id="register-form">
            <div class="form-group">
              <label>Username</label>
              <input type="text" id="reg-username" placeholder="Your display name" minlength="2" maxlength="20" required>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="reg-email" placeholder="you@example.com" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="reg-password" placeholder="Min 6 characters" minlength="6" required>
            </div>
            <button type="submit" class="btn btn-primary" id="reg-btn">Create Account</button>
          </form>
          <div class="auth-footer">
            Already have an account? <a href="#/login">Sign in</a>
          </div>
        </div>
      </div>
    `;

        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('reg-btn');
            const errEl = document.getElementById('auth-error');
            btn.disabled = true;
            btn.textContent = 'Creating account…';
            errEl.classList.remove('visible');

            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: document.getElementById('reg-username').value,
                        email: document.getElementById('reg-email').value,
                        password: document.getElementById('reg-password').value
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    currentUser = data.user;
                    connectSocket();
                    navigate('#/chat');
                } else {
                    errEl.textContent = data.error;
                    errEl.classList.add('visible');
                }
            } catch {
                errEl.textContent = 'Connection error. Please try again.';
                errEl.classList.add('visible');
            }
            btn.disabled = false;
            btn.textContent = 'Create Account';
        });
    }

    // ═══════════════════════════
    //  CHAT PAGE
    // ═══════════════════════════
    async function renderChat() {
        // Fetch rooms
        try {
            const res = await fetch('/api/rooms');
            if (res.ok) {
                const data = await res.json();
                rooms = data.rooms;
            }
        } catch { /* use defaults */ }

        const room = rooms.find(r => r.id === currentRoom) || rooms[0] || { id: 'general', name: 'General', icon: '💬', description: 'General discussion' };

        app.innerHTML = `
      <button class="hamburger" id="hamburger">☰</button>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="app-layout">
        <!-- Sidebar -->
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-header">
            <div class="brand-sm">
              <span>💬</span>
              <h2>ChatVibe</h2>
            </div>
            <span class="online-badge">0 online</span>
          </div>

          <div class="sidebar-section">
            <div class="sidebar-section-title">Rooms</div>
            <ul class="room-list" id="room-list">
              ${rooms.map(r => `
                <li class="room-item ${r.id === currentRoom ? 'active' : ''}" data-room="${r.id}">
                  <span class="room-icon">${r.icon}</span>
                  <span class="room-name">${r.name}</span>
                </li>
              `).join('')}
            </ul>
          </div>

          <div class="sidebar-section">
            <div class="sidebar-section-title">Online</div>
            <ul class="online-list" id="online-list"></ul>
          </div>

          <div class="sidebar-section">
            <ul class="sidebar-nav">
              <li data-page="profile"><span class="nav-icon">👤</span> Profile</li>
              <li data-page="settings"><span class="nav-icon">⚙️</span> Settings</li>
              <li data-page="logout"><span class="nav-icon">🚪</span> Logout</li>
            </ul>
          </div>

          <div class="sidebar-footer">
            <div class="user-card" data-page="profile">
              <div class="user-avatar">${getInitials(currentUser.username)}</div>
              <div class="user-info">
                <div class="user-name">${esc(currentUser.username)}</div>
                <div class="user-status">${esc(currentUser.status || 'online')}</div>
              </div>
            </div>
          </div>
        </aside>

        <!-- Main Chat -->
        <div class="main-content">
          <div class="chat-header">
            <div class="room-info">
              <span class="room-icon-lg">${room.icon}</span>
              <div>
                <h3>${room.name}</h3>
                <span class="room-desc">${room.description}</span>
              </div>
            </div>
          </div>

          <div class="messages-area" id="messages"></div>

          <div class="typing-indicator">
            <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            <span class="typing-text"></span>
          </div>

          <form class="input-bar" id="message-form">
            <input type="text" id="message-input" placeholder="Type a message…" autocomplete="off" maxlength="500">
            <button type="submit" class="send-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      </div>
    `;

        // Event listeners
        // Room clicks
        document.querySelectorAll('.room-item').forEach(el => {
            el.addEventListener('click', () => joinRoom(el.dataset.room));
        });

        // Sidebar nav
        document.querySelectorAll('.sidebar-nav li, .user-card[data-page]').forEach(el => {
            el.addEventListener('click', () => {
                const page = el.dataset.page;
                if (page === 'logout') logout();
                else if (page === 'profile') navigate('#/profile');
                else if (page === 'settings') navigate('#/settings');
            });
        });

        // Hamburger
        document.getElementById('hamburger').addEventListener('click', toggleSidebar);
        document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

        // Send message
        document.getElementById('message-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('message-input');
            const msg = input.value.trim();
            if (!msg || !socket) return;
            socket.emit('chat message', { message: msg });
            socket.emit('stop typing');
            input.value = '';
            input.focus();
        });

        // Typing
        document.getElementById('message-input').addEventListener('input', () => {
            if (socket) socket.emit('typing');
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                if (socket) socket.emit('stop typing');
            }, 1500);
        });

        // Load messages & join room via socket
        if (socket && socket.connected) {
            socket.emit('join room', currentRoom);
        }
        loadMessages();
    }

    // ═══════════════════════════
    //  PROFILE PAGE
    // ═══════════════════════════
    function renderProfile() {
        app.innerHTML = `
      <button class="hamburger" id="hamburger">☰</button>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="app-layout">
        ${renderSidebar()}
        <div class="main-content">
          <div class="page-content">
            <h2 class="page-title">Profile</h2>
            <div class="profile-card">
              <div class="profile-header">
                <div class="profile-avatar">${getInitials(currentUser.username)}</div>
                <div class="profile-header-info">
                  <h3>${esc(currentUser.username)}</h3>
                  <p>Joined ${new Date(currentUser.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div class="success-msg" id="profile-success">Profile updated successfully!</div>
              <div class="auth-error" id="profile-error"></div>
              <form class="profile-form" id="profile-form">
                <div class="form-group">
                  <label>Username</label>
                  <input type="text" id="prof-username" value="${esc(currentUser.username)}" minlength="2" maxlength="20">
                </div>
                <div class="form-group">
                  <label>Bio</label>
                  <textarea id="prof-bio" placeholder="Tell us about yourself…" maxlength="150">${esc(currentUser.bio || '')}</textarea>
                </div>
                <div class="form-group">
                  <label>Status</label>
                  <select class="status-select" id="prof-status">
                    <option value="online" ${currentUser.status === 'online' ? 'selected' : ''}>🟢 Online</option>
                    <option value="away" ${currentUser.status === 'away' ? 'selected' : ''}>🟡 Away</option>
                    <option value="busy" ${currentUser.status === 'busy' ? 'selected' : ''}>🔴 Busy</option>
                    <option value="invisible" ${currentUser.status === 'invisible' ? 'selected' : ''}>⚫ Invisible</option>
                  </select>
                </div>
                <div class="profile-actions">
                  <button type="submit" class="btn btn-primary" style="flex:1" id="save-btn">Save Changes</button>
                  <button type="button" class="btn btn-secondary" onclick="location.hash='#/chat'">Cancel</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

        attachSidebarEvents();

        document.getElementById('profile-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('save-btn');
            const errEl = document.getElementById('profile-error');
            const successEl = document.getElementById('profile-success');
            btn.disabled = true;
            btn.textContent = 'Saving…';
            errEl.classList.remove('visible');
            successEl.classList.remove('visible');

            try {
                const res = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: document.getElementById('prof-username').value,
                        bio: document.getElementById('prof-bio').value,
                        status: document.getElementById('prof-status').value
                    })
                });
                const data = await res.json();
                if (res.ok) {
                    currentUser = data.user;
                    successEl.classList.add('visible');
                    // Update avatar
                    document.querySelector('.profile-avatar').textContent = getInitials(currentUser.username);
                    document.querySelector('.profile-header-info h3').textContent = currentUser.username;
                } else {
                    errEl.textContent = data.error;
                    errEl.classList.add('visible');
                }
            } catch {
                errEl.textContent = 'Connection error.';
                errEl.classList.add('visible');
            }
            btn.disabled = false;
            btn.textContent = 'Save Changes';
        });
    }

    // ═══════════════════════════
    //  SETTINGS PAGE
    // ═══════════════════════════
    function renderSettings() {
        app.innerHTML = `
      <button class="hamburger" id="hamburger">☰</button>
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <div class="app-layout">
        ${renderSidebar()}
        <div class="main-content">
          <div class="page-content">
            <h2 class="page-title">Settings</h2>
            <div class="settings-card">
              <div class="settings-section-title">Notifications</div>
              <div class="settings-item">
                <div class="settings-info">
                  <div class="settings-label">Sound Notifications</div>
                  <div class="settings-desc">Play a sound when receiving messages</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="setting-sound" ${getSetting('sound') !== 'false' ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              <div class="settings-item">
                <div class="settings-info">
                  <div class="settings-label">Desktop Notifications</div>
                  <div class="settings-desc">Show browser notifications for new messages</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="setting-desktop" ${getSetting('desktop') === 'true' ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>

              <div class="settings-section-title">Appearance</div>
              <div class="settings-item">
                <div class="settings-info">
                  <div class="settings-label">Compact Messages</div>
                  <div class="settings-desc">Reduce spacing between messages</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="setting-compact" ${getSetting('compact') === 'true' ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>
              <div class="settings-item">
                <div class="settings-info">
                  <div class="settings-label">Show Timestamps</div>
                  <div class="settings-desc">Display time on each message</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="setting-timestamps" ${getSetting('timestamps') !== 'false' ? 'checked' : ''}>
                  <span class="slider"></span>
                </label>
              </div>

              <div class="settings-section-title">Account</div>
              <div class="settings-item" style="cursor:pointer" id="settings-logout">
                <div class="settings-info">
                  <div class="settings-label" style="color:var(--red)">Logout</div>
                  <div class="settings-desc">Sign out of your account</div>
                </div>
                <span style="color:var(--red)">→</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

        attachSidebarEvents();

        // Save settings on toggle
        ['sound', 'desktop', 'compact', 'timestamps'].forEach(key => {
            document.getElementById(`setting-${key}`).addEventListener('change', (e) => {
                localStorage.setItem(`chatvibe_${key}`, e.target.checked);
            });
        });

        document.getElementById('settings-logout').addEventListener('click', logout);
    }

    // ═══════════════════════════
    //  SHARED SIDEBAR (for non-chat pages)
    // ═══════════════════════════
    function renderSidebar() {
        return `
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
          <div class="brand-sm">
            <span>💬</span>
            <h2>ChatVibe</h2>
          </div>
          <span class="online-badge">0 online</span>
        </div>
        <div class="sidebar-section">
          <ul class="sidebar-nav">
            <li data-page="chat"><span class="nav-icon">💬</span> Chat</li>
            <li data-page="profile"><span class="nav-icon">👤</span> Profile</li>
            <li data-page="settings"><span class="nav-icon">⚙️</span> Settings</li>
            <li data-page="logout"><span class="nav-icon">🚪</span> Logout</li>
          </ul>
        </div>
        <div class="sidebar-footer">
          <div class="user-card" data-page="profile">
            <div class="user-avatar">${getInitials(currentUser.username)}</div>
            <div class="user-info">
              <div class="user-name">${esc(currentUser.username)}</div>
              <div class="user-status">${esc(currentUser.status || 'online')}</div>
            </div>
          </div>
        </div>
      </aside>
    `;
    }

    function attachSidebarEvents() {
        document.querySelectorAll('.sidebar-nav li, .user-card[data-page]').forEach(el => {
            el.addEventListener('click', () => {
                const page = el.dataset.page;
                if (page === 'logout') logout();
                else if (page === 'chat') navigate('#/chat');
                else if (page === 'profile') navigate('#/profile');
                else if (page === 'settings') navigate('#/settings');
                closeSidebar();
            });
        });

        const ham = document.getElementById('hamburger');
        const ovl = document.getElementById('sidebar-overlay');
        if (ham) ham.addEventListener('click', toggleSidebar);
        if (ovl) ovl.addEventListener('click', closeSidebar);
    }

    // ═══════════════════════════
    //  HELPERS
    // ═══════════════════════════
    function appendMessage(msg, animate = true) {
        const area = document.getElementById('messages');
        if (!area) return;
        const isOwn = msg.userId === currentUser.id;
        const el = document.createElement('div');
        el.className = `message ${isOwn ? 'own' : 'other'}`;
        if (!animate) el.style.animation = 'none';

        const showTime = getSetting('timestamps') !== 'false';
        const time = formatTime(msg.timestamp);

        el.innerHTML = `
      <div class="msg-header">
        <span class="msg-username">${esc(msg.username)}</span>
        ${showTime ? `<span class="msg-time">${time}</span>` : ''}
      </div>
      <span class="msg-text">${esc(msg.message)}</span>
    `;
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }

    function appendSystemMessage(text) {
        const area = document.getElementById('messages');
        if (!area) return;
        const el = document.createElement('div');
        el.className = 'system-message';
        el.innerHTML = `<span>${esc(text)}</span>`;
        area.appendChild(el);
        area.scrollTop = area.scrollHeight;
    }

    function updateOnlineUsers() {
        const list = document.getElementById('online-list');
        if (!list) return;
        list.innerHTML = roomUsers.map(u => `
      <li class="online-item">
        <div class="user-avatar-sm">${getInitials(u.username)}</div>
        <span>${esc(u.username)}</span>
      </li>
    `).join('');
    }

    async function logout() {
        try { await fetch('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
        currentUser = null;
        if (socket) { socket.disconnect(); socket = null; }
        localStorage.removeItem('chatvibe_username');
        navigate('#/login');
    }

    function toggleSidebar() {
        sidebarOpen = !sidebarOpen;
        const sb = document.getElementById('sidebar');
        const ovl = document.getElementById('sidebar-overlay');
        if (sb) sb.classList.toggle('open', sidebarOpen);
        if (ovl) ovl.classList.toggle('open', sidebarOpen);
    }

    function closeSidebar() {
        sidebarOpen = false;
        const sb = document.getElementById('sidebar');
        const ovl = document.getElementById('sidebar-overlay');
        if (sb) sb.classList.remove('open');
        if (ovl) ovl.classList.remove('open');
    }

    function getInitials(name) {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    }

    function formatTime(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function esc(str) {
        if (!str) return '';
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function getSetting(key) {
        return localStorage.getItem(`chatvibe_${key}`);
    }

    // ── Start ──
    init();
})();
