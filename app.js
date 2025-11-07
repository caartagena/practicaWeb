/*
  RecetaGram (SPA demo) — Comentarios extendidos
  ------------------------------------------------
  Este archivo contiene:
  - Un SDK de datos (dataSdk) que simula un backend usando localStorage.
  - Un SDK de configuración (elementSdk) para estilos/textos guardados en localStorage.
  - Toda la lógica de UI: autenticación, timeline de recetas, perfil, búsqueda y mensajes.

  Nota: solo se agregan comentarios extensos para documentación. No se modifica la lógica.
*/

// ===== _sdk/data_sdk.js (mock localStorage) =====
(function () {
  const STORAGE_KEY = "recetagram_data";
  let data = [];
  let subscribers = [];
  // 'data' mantiene en memoria el estado persistido en localStorage.
  // 'subscribers' son handlers con método onDataChanged para reactualizar la UI.

  // Lee y parsea la colección desde localStorage.
  function load() {
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { data = []; }
  }
  // Persiste el array completo en localStorage.
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  // Notifica a los suscriptores con una copia para evitar mutaciones accidentales.
  function notify() { subscribers.forEach(h => h?.onDataChanged && h.onDataChanged([...data])); }

  // Inserta datos de ejemplo si no hay nada guardado (demo/primera carga).
  function seedIfEmpty() {
    if (data.length > 0) return;
    const now = new Date().toISOString();
    const u1 = { id: "u_demo", type: "user", username: "demo", password: "demo", fullName: "Cuenta Demo", bio: "Amante de la cocina 👨‍🍳", profilePhoto: "", timestamp: now };
    const u2 = { id: "u_ana", type: "user", username: "ana", password: "ana", fullName: "Ana Chef", bio: "Pasta lover 🍝", profilePhoto: "", timestamp: now };
    const f1 = { id: "f1", type: "friendship", requesterId: "u_demo", receiverId: "u_ana", status: "accepted", timestamp: now };
    const r1 = {
      id: "r1", type: "recipe",
      recipeTitle: "Tostada de aguacate",
      recipeDescription: "Rápida y saludable",
      recipeIngredients: "Pan integral\nAguacate\nSal\nLimón",
      recipeSteps: "Tostar el pan\nAplastar aguacate\nSazonar y servir",
      recipeImage: "🥑",
      authorId: "u_ana", authorName: "ana",
      likes: 1, likedBy: "u_demo",
      comments: JSON.stringify([{ author: "demo", text: "¡Brutal!", timestamp: now }]),
      timestamp: now
    };
    data.push(u1, u2, f1, r1);
    save();
  }

  load();
  seedIfEmpty();

  /*
    API pública: dataSdk
    --------------------
    - init(handler): registra un suscriptor (opcional) y emite el estado actual.
    - create(obj): agrega un objeto y persiste.
    - update(obj): reemplaza por id y persiste.
    - delete(id): elimina por id y persiste.
    - reset(): limpia toda la colección y persiste.
  */
  window.dataSdk = {
    async init(handler) {
      if (handler && !subscribers.includes(handler)) subscribers.push(handler);
      notify();
      return { isOk: true };
    },
    async create(obj) {
      data.push(obj);
      save(); notify();
      return { isOk: true, data: obj };
    },
    async update(obj) {
      const i = data.findIndex(x => x.id === obj.id);
      if (i === -1) return { isOk: false, error: "not_found" };
      data[i] = obj;
      save(); notify();
      return { isOk: true };
    },
    async delete(id) {
      const before = data.length;
      data = data.filter(x => x.id !== id);
      save(); notify();
      return { isOk: data.length !== before };
    },
    async reset() {
      data = []; save(); notify();
      return { isOk: true };
    }
  };
})();

// ===== _sdk/element_sdk.js (mock config en localStorage) =====
(function () {
  const CFG_KEY = "recetagram_config";
  let config = {};
  let onConfigChangeCb = null;

  function loadCfg() {
    try { config = JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); }
    catch { config = {}; }
  }
  function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(config)); }
  function applyChange() { if (onConfigChangeCb) onConfigChangeCb(config); }

  loadCfg();

  /*
    API pública: elementSdk
    -----------------------
    - init({ defaultConfig, onConfigChange }): mezcla config previa con la por defecto
      y aplica los cambios llamando al callback proporcionado.
    - setConfig(partial): fusiona parcialmente y reaplica el callback.
  */
  window.elementSdk = {
    config,
    async init({ defaultConfig = {}, onConfigChange } = {}) {
      config = { ...defaultConfig, ...config };
      saveCfg();
      onConfigChangeCb = onConfigChange || null;
      applyChange();
      return { isOk: true };
    },
    setConfig(partial) {
      config = { ...config, ...partial };
      saveCfg();
      applyChange();
    }
  };
})();

// ======= APP LOGIC (UI) =======

// Global state: estado mínimo compartido entre pantallas.
let allData = [];
let currentUser = null;
let currentPage = 'auth';
let selectedChatUser = null;

// Default config
// Default config: textos, colores y tipografías por defecto usados por elementSdk.
const defaultConfig = {
  app_title: 'RecetaGram',
  app_tagline: 'Comparte tus recetas favoritas',
  welcome_message: 'Bienvenido a RecetaGram',
  login_button_text: 'Iniciar Sesión',
  register_button_text: 'Registrarse',
  timeline_title: 'Recetas de tus Amigos',
  search_placeholder: 'Buscar usuarios...',
  background_color: '#fafafa',
  surface_color: '#ffffff',
  text_color: '#262626',
  primary_action_color: '#0095f6',
  secondary_action_color: '#dbdbdb',
  font_family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  font_size: 14
};

// Data handler
// Data handler: suscriptor de dataSdk para refrescar vistas al cambiar los datos.
const dataHandler = {
  onDataChanged(data) {
    allData = data;
    if (currentPage === 'timeline') renderTimeline();
    else if (currentPage === 'profile') renderProfile();
    else if (currentPage === 'search') renderSearchResults();
    else if (currentPage === 'messages') {
      renderConversations();
      if (selectedChatUser) renderChat(selectedChatUser);
    }
  }
};

// Initialize SDK
// Initialize SDK: arranca dataSdk y elementSdk y aplica la configuración visual.
async function initApp() {
  const initResult = await window.dataSdk.init(dataHandler);
  if (!initResult.isOk) { showToast('Error al inicializar la aplicación'); return; }

  await window.elementSdk.init({
    defaultConfig,
    // Se ejecuta cada vez que cambie la configuración guardada.
    onConfigChange: async (config) => {
      const customFont = config.font_family || defaultConfig.font_family;
      const baseFontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
      const baseSize = config.font_size || defaultConfig.font_size;

      document.body.style.fontFamily = `${customFont}, ${baseFontStack}`;
      document.body.style.fontSize = `${baseSize}px`;
      document.body.style.background = config.background_color || defaultConfig.background_color;

      const surfaces = document.querySelectorAll('.auth-container, .header, .recipe-card, .search-container, .conversations-list, .chat-container, .modal-content, .profile-header');
      surfaces.forEach(el => { el.style.background = config.surface_color || defaultConfig.surface_color; });

      const textElements = document.querySelectorAll('.logo, .auth-logo, .profile-username, .timeline-title, .search-title, .modal-title, .recipe-title, .user-name, .conversation-name, .chat-user-name, .stat, .profile-bio, .recipe-description, .comment, label');
      textElements.forEach(el => { el.style.color = config.text_color || defaultConfig.text_color; });

      const primaryButtons = document.querySelectorAll('.btn-primary, .btn-new-recipe, .btn-add-friend, .btn-send, .btn-comment');
      primaryButtons.forEach(el => { el.style.background = config.primary_action_color || defaultConfig.primary_action_color; });

      const secondaryElements = document.querySelectorAll('.btn-edit-profile, .form-input, .search-input, .chat-input');
      secondaryElements.forEach(el => { el.style.borderColor = config.secondary_action_color || defaultConfig.secondary_action_color; });

      document.getElementById('authLogo').textContent = config.app_title || defaultConfig.app_title;
      document.getElementById('logoBtn').textContent = config.app_title || defaultConfig.app_title;
      document.getElementById('authTagline').textContent = config.app_tagline || defaultConfig.app_tagline;
      document.getElementById('loginBtn').textContent = config.login_button_text || defaultConfig.login_button_text;
      document.getElementById('registerBtn').textContent = config.register_button_text || defaultConfig.register_button_text;
      document.getElementById('timelineTitle').textContent = config.timeline_title || defaultConfig.timeline_title;
      document.getElementById('searchInput').placeholder = config.search_placeholder || defaultConfig.search_placeholder;

      const headings = document.querySelectorAll('.timeline-title, .search-title, .modal-title');
      headings.forEach(el => { el.style.fontSize = `${baseSize * 1.7}px`; });
      const largeText = document.querySelectorAll('.auth-logo, .logo');
      largeText.forEach(el => { el.style.fontSize = `${baseSize * 2}px`; });
    }
  });
}

// Utils
// Muestra un toast temporal con un mensaje de estado.
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => { toast.classList.remove('show'); }, 3000);
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
function getUsers() { return allData.filter(item => item.type === 'user'); }
function getRecipes() { return allData.filter(item => item.type === 'recipe').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); }
function getFriendships() { return allData.filter(item => item.type === 'friendship'); }
function getMessages() { return allData.filter(item => item.type === 'message').sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); }
function getUserFriends(userId) {
  const friendships = getFriendships().filter(f => f.status === 'accepted' && (f.requesterId === userId || f.receiverId === userId));
  const friendIds = friendships.map(f => f.requesterId === userId ? f.receiverId : f.requesterId);
  return getUsers().filter(u => friendIds.includes(u.id));
}
function areFriends(a, b) {
  return getFriendships().some(f => f.status === 'accepted' && ((f.requesterId === a && f.receiverId === b) || (f.requesterId === b && f.receiverId === a)));
}
function getFriendshipStatus(a, b) {
  const f = getFriendships().find(f => (f.requesterId === a && f.receiverId === b) || (f.requesterId === b && f.receiverId === a));
  return f ? f.status : null;
}

// Navigation
// Navigation: muestra la página indicada y renderiza su contenido si aplica.
function showPage(pageName) {
  currentPage = pageName;
  document.getElementById('authPage').classList.add('hidden');
  document.getElementById('timelinePage').classList.add('hidden');
  document.getElementById('profilePage').classList.add('hidden');
  document.getElementById('searchPage').classList.add('hidden');
  document.getElementById('messagesPage').classList.add('hidden');

  if (pageName === 'auth') {
    document.getElementById('header').classList.add('hidden');
    document.getElementById('authPage').classList.remove('hidden');
  } else {
    document.getElementById('header').classList.remove('hidden');
    document.getElementById(`${pageName}Page`).classList.remove('hidden');
    if (pageName === 'timeline') renderTimeline();
    else if (currentPage === 'profile') renderProfile();
    else if (currentPage === 'search') renderSearchResults();
    else if (currentPage === 'messages') renderConversations();
  }
}

// Auth
// AUTH: manejo de inicio de sesión (login).
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const user = getUsers().find(u => u.username === username && u.password === password);
  if (user) { currentUser = user; showToast('¡Bienvenido de nuevo!'); showPage('timeline'); }
  else showToast('Usuario o contraseña incorrectos');
});

// AUTH: manejo de registro de nueva cuenta (signup).
document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = document.getElementById('registerFullName').value.trim();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;

  if (getUsers().some(u => u.username === username)) { showToast('El nombre de usuario ya existe'); return; }

  const submitBtn = document.getElementById('registerBtn');
  submitBtn.disabled = true; submitBtn.textContent = 'Registrando...';

  const result = await window.dataSdk.create({
    id: generateId(), type: 'user', username, password, fullName,
    bio: 'Amante de la cocina 👨‍🍳', profilePhoto: '', timestamp: new Date().toISOString()
  });

  submitBtn.disabled = false;
  submitBtn.textContent = window.elementSdk.config.register_button_text || defaultConfig.register_button_text;

  if (result.isOk) { showToast('¡Cuenta creada! Ahora puedes iniciar sesión'); document.getElementById('authSwitchBtn').click(); document.getElementById('registerForm').reset(); }
  else showToast('Error al crear la cuenta');
});

document.getElementById('authSwitchBtn').addEventListener('click', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const switchText = document.getElementById('authSwitchText');
  const switchBtn = document.getElementById('authSwitchBtn');

  if (loginForm.classList.contains('hidden')) {
    loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
    switchText.textContent = '¿No tienes cuenta?'; switchBtn.textContent = 'Regístrate';
  } else {
    loginForm.classList.add('hidden'); registerForm.classList.remove('hidden');
    switchText.textContent = '¿Ya tienes cuenta?'; switchBtn.textContent = 'Inicia sesión';
  }
});

// Timeline
// TIMELINE: lista recetas de amigos + propias, con me gusta y comentarios.
function renderTimeline() {
  const recipesList = document.getElementById('recipesList');
  const friends = getUserFriends(currentUser.id);
  const friendIds = friends.map(f => f.id); friendIds.push(currentUser.id);
  const recipes = getRecipes().filter(r => friendIds.includes(r.authorId));

  if (recipes.length === 0) {
    recipesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🍳</div>
        <div class="empty-state-text">No hay recetas aún</div>
        <div class="empty-state-subtext">¡Sé el primero en compartir una receta!</div>
      </div>`;
    return;
  }

  recipesList.innerHTML = recipes.map(recipe => {
    const author = getUsers().find(u => u.id === recipe.authorId);
    const likedByArray = recipe.likedBy ? recipe.likedBy.split(',').filter(id => id) : [];
    const isLiked = likedByArray.includes(currentUser.id);
    const comments = recipe.comments ? JSON.parse(recipe.comments) : [];

    // Photo del autor: img si es data:, si no, contenedor vacío (se ve el fondo/degradado)
    const authorPhotoHtml = (author && author.profilePhoto && String(author.profilePhoto).startsWith('data:'))
      ? `<img src="${author.profilePhoto}" alt="${author.username}" />`
      : '';

    const imageHtml = (recipe.recipeImage && String(recipe.recipeImage).startsWith('data:'))
      ? `<div class="recipe-image"><img src="${recipe.recipeImage}" alt="${(recipe.recipeTitle || 'receta')}" /></div>`
      : `<div class="recipe-image">${recipe.recipeImage || '🍕'}</div>`;

    return `
      <div class="recipe-card">
        <div class="recipe-header">
          <div class="recipe-author-photo">${authorPhotoHtml}</div>
          <div class="recipe-author-name">${author?.username || 'Usuario'}</div>
        </div>
        ${imageHtml}
        <div class="recipe-actions">
          <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${recipe.id}')">${isLiked ? '❤️' : '🤍'}</button>
          <button class="action-btn" onclick="focusComment('${recipe.id}')">💬</button>
        </div>
        <div class="recipe-likes">${recipe.likes || 0} me gusta</div>
        <div class="recipe-content">
          <div class="recipe-title">${recipe.recipeTitle}</div>
          <div class="recipe-description">${recipe.recipeDescription}</div>
          <div class="recipe-details">
            <div class="recipe-section-title">Ingredientes:</div>
            <div class="recipe-text">${recipe.recipeIngredients}</div>
          </div>
          <div class="recipe-details">
            <div class="recipe-section-title">Pasos:</div>
            <div class="recipe-text">${recipe.recipeSteps}</div>
          </div>
        </div>
        ${comments.length > 0 ? `
          <div class="recipe-comments">
            ${comments.map(c => `
              <div class="comment">
                <span class="comment-author">${c.author}</span>
                ${c.text}
              </div>`).join('')}
          </div>` : ''}
        <div class="recipe-comments">
          <form class="comment-form" onsubmit="addComment(event, '${recipe.id}')">
            <input type="text" class="comment-input" id="comment-${recipe.id}" placeholder="Añade un comentario..." required />
            <button type="submit" class="btn-comment">Publicar</button>
          </form>
        </div>
      </div>`;
  }).join('');
}

// Alterna el 'me gusta' del usuario actual sobre una receta.
async function toggleLike(recipeId) {
  const recipe = allData.find(r => r.id === recipeId);
  if (!recipe) return;
  const likedByArray = recipe.likedBy ? recipe.likedBy.split(',').filter(id => id) : [];
  const isLiked = likedByArray.includes(currentUser.id);

  if (isLiked) {
    const index = likedByArray.indexOf(currentUser.id);
    likedByArray.splice(index, 1);
    recipe.likes = Math.max(0, (recipe.likes || 0) - 1);
  } else {
    likedByArray.push(currentUser.id);
    recipe.likes = (recipe.likes || 0) + 1;
  }
  recipe.likedBy = likedByArray.join(',');
  const result = await window.dataSdk.update(recipe);
  if (!result.isOk) showToast('Error al actualizar el me gusta');
}

// Agrega un comentario a una receta y persiste el cambio.
async function addComment(event, recipeId) {
  event.preventDefault();
  const input = document.getElementById(`comment-${recipeId}`);
  const commentText = input.value.trim();
  if (!commentText) return;

  const recipe = allData.find(r => r.id === recipeId);
  if (!recipe) return;

  const comments = recipe.comments ? JSON.parse(recipe.comments) : [];
  comments.push({ author: currentUser.username, text: commentText, timestamp: new Date().toISOString() });
  recipe.comments = JSON.stringify(comments);

  const result = await window.dataSdk.update(recipe);
  if (result.isOk) input.value = '';
  else showToast('Error al añadir el comentario');
}
function focusComment(recipeId) { document.getElementById(`comment-${recipeId}`).focus(); }

// New recipe modal
// NEW RECIPE MODAL: abrir/cerrar y publicar una nueva receta.
document.getElementById('newRecipeBtn').addEventListener('click', () => {
  document.getElementById('newRecipeModal').classList.add('active');
});
document.getElementById('closeRecipeModal').addEventListener('click', () => {
  document.getElementById('newRecipeModal').classList.remove('active');
});
// NEW RECIPE: submit mejorado con lectura/redimensionado y restauración segura del botón
document.getElementById('newRecipeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('recipeTitle').value.trim();
  const description = document.getElementById('recipeDescription').value.trim();
  const ingredients = document.getElementById('recipeIngredients').value.trim();
  const steps = document.getElementById('recipeSteps').value.trim();

  const fileInput = document.getElementById('recipeImageFile');
  const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;

  const submitBtn = document.getElementById('submitRecipeBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publicando...';

  let imageDataUrl = null;
  try {
    if (file) {
      imageDataUrl = await readAndResizeImage(file, 1200, 0.8); // redimensiona para evitar errores de tamaño
    }
  } catch (err) {
    console.error('Error procesando imagen receta:', err);
    showToast('Error al procesar la imagen. Usa otra imagen o prueba menor tamaño.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publicar Receta';
    return;
  }

  try {
    const result = await window.dataSdk.create({
      id: generateId(), type: 'recipe',
      recipeTitle: title, recipeDescription: description,
      recipeIngredients: ingredients, recipeSteps: steps,
      recipeImage: imageDataUrl || '🍕', authorId: currentUser.id, authorName: currentUser.username,
      likes: 0, likedBy: '', comments: '[]', timestamp: new Date().toISOString()
    });

    if (result.isOk) {
      showToast('¡Receta publicada!');
      document.getElementById('newRecipeModal').classList.remove('active');
      document.getElementById('newRecipeForm').reset();
    } else {
      showToast('Error al publicar la receta');
    }
  } catch (err) {
    console.error('create recipe error', err);
    showToast('Error al publicar la receta');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Publicar Receta';
  }
});

// Profile
// PROFILE: render de perfil propio y lista de recetas publicadas.
function renderProfile() {
  const user = currentUser;
  const recipes = getRecipes().filter(r => r.authorId === user.id);
  const friends = getUserFriends(user.id);

  const profilePhotoEl = document.getElementById('profilePhoto');
  if (user.profilePhoto && String(user.profilePhoto).startsWith('data:')) {
    profilePhotoEl.innerHTML = `<img src="${user.profilePhoto}" alt="${user.username}" />`;
  } else {
    profilePhotoEl.innerHTML = ''; // sin emoji por defecto
  }

  document.getElementById('profileUsername').textContent = user.username;
  document.getElementById('recipesCount').textContent = recipes.length;
  document.getElementById('friendsCount').textContent = friends.length;
  document.getElementById('profileBio').textContent = user.bio || 'Amante de la cocina 👨‍🍳';

  const userRecipesList = document.getElementById('userRecipesList');
  if (recipes.length === 0) {
    userRecipesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">No has publicado recetas aún</div>
      </div>`;
    return;
  }

  userRecipesList.innerHTML = recipes.map(recipe => {
    const likedByArray = recipe.likedBy ? recipe.likedBy.split(',').filter(id => id) : [];
    const isLiked = likedByArray.includes(currentUser.id);
    const comments = recipe.comments ? JSON.parse(recipe.comments) : [];

    const imageHtml = (recipe.recipeImage && String(recipe.recipeImage).startsWith('data:'))
      ? `<div class="recipe-image"><img src="${recipe.recipeImage}" alt="${(recipe.recipeTitle || 'receta')}" /></div>`
      : `<div class="recipe-image">${recipe.recipeImage || '🍕'}</div>`;

    // Mostrar la foto del autor como <img> si es data URL, sino dejar contenedor vacío (mantiene el fondo/degradado)
    const authorPhotoHtml = (user.profilePhoto && String(user.profilePhoto).startsWith('data:'))
      ? `<img src="${user.profilePhoto}" alt="${user.username}" />`
      : '';

    return `
      <div class="recipe-card">
        <div class="recipe-header">
          <div class="recipe-author-photo">${authorPhotoHtml}</div>
          <div class="recipe-author-name">${user.username}</div>
        </div>
        ${imageHtml}
        <div class="recipe-actions">
          <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${recipe.id}')">${isLiked ? '❤️' : '🤍'}</button>
          <button class="action-btn" onclick="focusComment('${recipe.id}')">💬</button>
          <!-- Botón eliminar visible en el perfil del autor -->
          <button class="action-btn btn-delete" onclick="deleteRecipe('${recipe.id}')" title="Eliminar receta">🗑️</button>
        </div>
        <div class="recipe-likes">${recipe.likes || 0} me gusta</div>
        <div class="recipe-content">
          <div class="recipe-title">${recipe.recipeTitle}</div>
          <div class="recipe-description">${recipe.recipeDescription}</div>
          <div class="recipe-details">
            <div class="recipe-section-title">Ingredientes:</div>
            <div class="recipe-text">${recipe.recipeIngredients}</div>
          </div>
          <div class="recipe-details">
            <div class="recipe-section-title">Pasos:</div>
            <div class="recipe-text">${recipe.recipeSteps}</div>
          </div>
        </div>
        ${comments.length > 0 ? `
          <div class="recipe-comments">
            ${comments.map(c => `
              <div class="comment">
                <span class="comment-author">${c.author}</span>
                ${c.text}
              </div>`).join('')}
          </div>` : ''}
        <div class="recipe-comments">
          <form class="comment-form" onsubmit="addComment(event, '${recipe.id}')">
            <input type="text" class="comment-input" id="comment-${recipe.id}" placeholder="Añade un comentario..." required />
            <button type="submit" class="btn-comment">Publicar</button>
          </form>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('editProfileBtn').addEventListener('click', () => {
  document.getElementById('editFullName').value = currentUser.fullName;
  document.getElementById('editBio').value = currentUser.bio || '';
  // limpiar input file al abrir modal
  const photoFileInput = document.getElementById('editProfilePhotoFile');
  if (photoFileInput) photoFileInput.value = '';
  document.getElementById('editProfileModal').classList.add('active');
});
document.getElementById('closeEditProfileModal').addEventListener('click', () => {
  document.getElementById('editProfileModal').classList.remove('active');
});
// EDIT PROFILE: handler robusto que redimensiona imagen, actualiza y limpia input para permitir reemplazos
document.getElementById('editProfileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = document.getElementById('editFullName').value.trim();
  const bio = document.getElementById('editBio').value.trim();
  const photoFileInput = document.getElementById('editProfilePhotoFile');
  const file = photoFileInput && photoFileInput.files && photoFileInput.files[0] ? photoFileInput.files[0] : null;

  const submitBtn = document.getElementById('submitEditProfileBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando...';

  try {
    let photoDataUrl = null;
    if (file) {
      try {
        photoDataUrl = await readAndResizeImage(file, 800, 0.85);
      } catch (err) {
        console.error('Error procesando imagen perfil:', err);
        showToast('Error al procesar la imagen. Prueba con otro archivo más pequeño.');
        return;
      }
    }

    // Actualizar fields del usuario
    currentUser.fullName = fullName;
    currentUser.bio = bio;
    currentUser.profilePhoto = photoDataUrl || '';

    const result = await window.dataSdk.update(currentUser);
    if (result.isOk) {
      // refrescar referencia desde el almacenamiento persistido
      currentUser = getUsers().find(u => u.id === currentUser.id) || currentUser;
      // limpiar input file para permitir reemplazo
      if (photoFileInput) photoFileInput.value = '';
      showToast('Perfil actualizado');
      document.getElementById('editProfileModal').classList.remove('active');
      renderProfile();
    } else {
      showToast('Error al actualizar el perfil');
    }
  } catch (err) {
    console.error('update profile error', err);
    showToast('Error al actualizar el perfil');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar Cambios';
  }
});

// Search
// SEARCH: resultados de usuarios + botón de amistad según estado.
function renderSearchResults() {
  const searchInput = document.getElementById('searchInput');
  const searchTerm = searchInput.value.toLowerCase().trim();
  const usersList = document.getElementById('usersList');

  const users = getUsers().filter(u =>
    u.id !== currentUser.id &&
    (u.username.toLowerCase().includes(searchTerm) || u.fullName.toLowerCase().includes(searchTerm))
  );

  if (users.length === 0) {
    usersList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">No se encontraron usuarios</div>
      </div>`;
    return;
  }

  usersList.innerHTML = users.map(user => {
    const status = getFriendshipStatus(currentUser.id, user.id);
    const isFriend = areFriends(currentUser.id, user.id);
    let buttonText = '+ Agregar';
    let buttonClass = 'btn-add-friend';

    if (isFriend) { buttonText = '✓ Amigos'; buttonClass = 'btn-add-friend friends'; }
    else if (status === 'pending') { buttonText = 'Pendiente'; buttonClass = 'btn-add-friend pending'; }

    const photoHtml = user.profilePhoto && String(user.profilePhoto).startsWith('data:') ? `<img src="${user.profilePhoto}" alt="${user.fullName}" />` : '';

    return `
      <div class="user-item">
        <div class="user-photo">${photoHtml}</div>
        <div class="user-info">
          <div class="user-name">${user.fullName}</div>
          <div class="user-username">@${user.username}</div>
        </div>
        <button class="${buttonClass}" onclick="sendFriendRequest('${user.id}')" ${isFriend || status === 'pending' ? 'disabled' : ''}>
          ${buttonText}
        </button>
      </div>`;
  }).join('');
}

// Envía/crea una relación de amistad aceptada entre el usuario actual y el destino.
async function sendFriendRequest(receiverId) {
  const existingRequest = getFriendships().find(f =>
    (f.requesterId === currentUser.id && f.receiverId === receiverId) ||
    (f.requesterId === receiverId && f.receiverId === currentUser.id)
  );
  if (existingRequest) { showToast('Ya existe una solicitud con este usuario'); return; }

  const result = await window.dataSdk.create({
    id: generateId(), type: 'friendship',
    requesterId: currentUser.id, receiverId: receiverId,
    status: 'accepted', timestamp: new Date().toISOString()
  });
  if (result.isOk) showToast('¡Ahora son amigos!');
  else showToast('Error al enviar la solicitud');
}

// Messages
// MESSAGES: lista de conversaciones con amigos (vista izquierda).
function renderConversations() {
  const friends = getUserFriends(currentUser.id);
  const conversationsList = document.getElementById('conversationsList');

  if (friends.length === 0) {
    conversationsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-text">No tienes amigos aún</div>
        <div class="empty-state-subtext">Busca usuarios para agregar</div>
      </div>`;
    return;
  }

  conversationsList.innerHTML = friends.map(friend => {
    const messages = getMessages().filter(m =>
      (m.fromUserId === currentUser.id && m.toUserId === friend.id) ||
      (m.fromUserId === friend.id && m.toUserId === currentUser.id)
    );
    const lastMessage = messages[messages.length - 1];
    const preview = lastMessage ? lastMessage.messageText.substring(0, 30) + '...' : 'Envía un mensaje';

    const photoHtml = friend.profilePhoto && String(friend.profilePhoto).startsWith('data:') ? `<img src="${friend.profilePhoto}" alt="${friend.fullName}" />` : '';

    return `
      <div class="conversation-item ${selectedChatUser?.id === friend.id ? 'active' : ''}" onclick="selectChat('${friend.id}')">
        <div class="conversation-photo">${photoHtml}</div>
        <div class="conversation-info">
          <div class="conversation-name">${friend.fullName}</div>
          <div class="conversation-preview">${preview}</div>
        </div>
      </div>`;
  }).join('');
}

// Selecciona un amigo y muestra el chat correspondiente.
function selectChat(userId) {
  const user = getUsers().find(u => u.id === userId);
  if (!user) return;
  selectedChatUser = user;
  renderChat(user);
  document.getElementById('chatHeader').classList.remove('hidden');
  document.getElementById('chatInputContainer').classList.remove('hidden');

  const items = document.querySelectorAll('.conversation-item');
  items.forEach(item => item.classList.remove('active'));
}

// RENDER CHAT: muestra el historial con el usuario seleccionado y hace autoscroll.
function renderChat(user) {
  document.getElementById('chatUserPhoto').innerHTML = (user.profilePhoto && String(user.profilePhoto).startsWith('data:')) ? `<img src="${user.profilePhoto}" alt="${user.fullName}" />` : '';
  document.getElementById('chatUserName').textContent = user.fullName;

  const messages = getMessages().filter(m =>
    (m.fromUserId === currentUser.id && m.toUserId === user.id) ||
    (m.fromUserId === user.id && m.toUserId === currentUser.id)
  );

  const chatMessages = document.getElementById('chatMessages');
  if (messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-text">No hay mensajes aún</div>
        <div class="empty-state-subtext">Envía el primer mensaje</div>
      </div>`;
    return;
  }

  chatMessages.innerHTML = messages.map(msg => {
    const isSent = msg.fromUserId === currentUser.id;
    return `<div class="message ${isSent ? 'sent' : 'received'}">${msg.messageText}</div>`;
  }).join('');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById('sendMessageBtn').addEventListener('click', async () => {
  const input = document.getElementById('chatInput');
  const messageText = input.value.trim();
  if (!messageText || !selectedChatUser) return;

  const sendBtn = document.getElementById('sendMessageBtn');
  sendBtn.disabled = true; sendBtn.textContent = 'Enviando...';

  const result = await window.dataSdk.create({
    id: generateId(), type: 'message',
    fromUserId: currentUser.id, toUserId: selectedChatUser.id,
    messageText, timestamp: new Date().toISOString()
  });

  sendBtn.disabled = false; sendBtn.textContent = 'Enviar';
  if (result.isOk) { input.value = ''; renderChat(selectedChatUser); renderConversations(); }
  else showToast('Error al enviar el mensaje');
});

document.getElementById('chatInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('sendMessageBtn').click();
});

// Nav buttons
// NAV BUTTONS: navegación principal del header.
document.getElementById('logoBtn').addEventListener('click', () => showPage('timeline'));
document.getElementById('homeBtn').addEventListener('click', () => showPage('timeline'));
document.getElementById('searchBtn').addEventListener('click', () => showPage('search'));
document.getElementById('messagesBtn').addEventListener('click', () => showPage('messages'));
document.getElementById('profileBtn').addEventListener('click', () => showPage('profile'));
document.getElementById('logoutBtn').addEventListener('click', () => {
  currentUser = null; selectedChatUser = null; showPage('auth'); showToast('Sesión cerrada');
});

// Init
// Punto de entrada: inicia la app una vez cargado el script.
initApp();

// Util: lee File como data URL
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('file_read_error'));
    reader.readAsDataURL(file);
  });
}
// Util: lee y redimensiona imagen (File) a un tamaño máximo dado, retornando un data URL.
function readAndResizeImage(file, maxDimension = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const ratio = width / height;
        if (width > maxDimension || height > maxDimension) {
          if (ratio > 1) {
            width = maxDimension;
            height = Math.round(maxDimension / ratio);
          } else {
            height = maxDimension;
            width = Math.round(maxDimension * ratio);
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // intentar JPEG para compresión; si PNG, forzar jpeg
        const mime = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mime, quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_error'));
    };
    img.src = url;
  });
}

// Nueva función: borrar receta (solo autor)
async function deleteRecipe(recipeId) {
  const recipe = allData.find(r => r.id === recipeId && r.type === 'recipe');
  if (!recipe) { showToast('Receta no encontrada'); return; }
  if (recipe.authorId !== currentUser.id) { showToast('No puedes eliminar esta receta'); return; }

  const ok = confirm('¿Eliminar receta? Esta acción no se puede deshacer.');
  if (!ok) return;

  const result = await window.dataSdk.delete(recipeId);
  if (result.isOk) {
    showToast('Receta eliminada');
    // dataSdk.notify via delete -> dataHandler actualizará la vista automáticamente
  } else {
    showToast('Error al eliminar la receta');
  }
}
