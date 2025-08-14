// Sistema de Notificaciones
class NotificationSystem {
    constructor() {
        this.container = document.getElementById('notifications');
        this.notifications = [];
    }

    show(type, title, message, duration = 5000) {
        const notification = {
            id: Date.now(),
            type,
            title,
            message,
            duration
        };

        this.notifications.push(notification);
        this.render(notification);

        // Auto-remover después del tiempo especificado
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification.id);
            }, duration);
        }

        return notification.id;
    }

    render(notification) {
        const notificationEl = document.createElement('div');
        notificationEl.className = `notification ${notification.type}`;
        notificationEl.dataset.id = notification.id;

        const iconMap = {
            success: 'check-circle',
            error: 'x-circle',
            warning: 'alert-triangle',
            info: 'info'
        };

        notificationEl.innerHTML = `
            <i data-lucide="${iconMap[notification.type]}" class="notification-icon"></i>
            <div class="notification-content">
                <div class="notification-title">${notification.title}</div>
                <div class="notification-message">${notification.message}</div>
            </div>
        `;

        this.container.appendChild(notificationEl);
        lucide.createIcons();

        // Añadir evento de click para cerrar
        notificationEl.addEventListener('click', () => {
            this.remove(notification.id);
        });
    }

    remove(id) {
        const notificationEl = this.container.querySelector(`[data-id="${id}"]`);
        if (notificationEl) {
            notificationEl.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                if (notificationEl.parentNode) {
                    notificationEl.parentNode.removeChild(notificationEl);
                }
            }, 300);
        }

        this.notifications = this.notifications.filter(n => n.id !== id);
    }

    clear() {
        this.notifications.forEach(n => this.remove(n.id));
    }
}

// Gestión de Pestañas
class TabManager {
    constructor() {
        this.currentTab = 'gallery';
        this.initTabs();
    }

    initTabs() {
        const tabButtons = document.querySelectorAll('.nav-btn');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Actualizar botones
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Actualizar contenido
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Cargar datos específicos de la pestaña
        this.onTabSwitch(tabName);
    }

    onTabSwitch(tabName) {
        switch (tabName) {
            case 'gallery':
                if (!gallery.galleryData) {
                    gallery.loadGalleryData();
                }
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    loadSettings() {
        if (gallery.galleryData) {
            document.getElementById('base-url').value = gallery.galleryData.baseUrl;
            document.getElementById('background-image').value = gallery.galleryData.backgroundImage;
        }
    }
}

// Aplicación Principal
class AdminApp {
    constructor() {
        this.isLoading = false;
        this.currentEditingId = null;
        
        this.init();
    }

    async init() {
        try {
            // Mostrar pantalla de carga
            this.showLoading();

            // Verificar autenticación
            if (auth.isAuthenticated()) {
                await this.loadAuthenticatedApp();
            } else {
                this.showLoginScreen();
            }
        } catch (error) {
            console.error('Error inicializando aplicación:', error);
            notifications.show('error', 'Error de inicialización', error.message);
        } finally {
            this.hideLoading();
        }
    }

    showLoading() {
        document.getElementById('loading-screen').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading-screen').style.display = 'none';
    }

    showLoginScreen() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('admin-app').style.display = 'none';
        this.initLoginForm();
    }

    showAdminApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('admin-app').style.display = 'grid';
    }

    async loadAuthenticatedApp() {
        try {
            // Verificar que el token sigue siendo válido
            const userInfo = await auth.getUserInfo();
            if (!userInfo) {
                throw new Error('Token inválido');
            }

            // Mostrar aplicación
            this.showAdminApp();
            
            // Actualizar información del usuario
            document.getElementById('user-info').textContent = `${userInfo.login}`;
            
            // Cargar datos de la galería
            await gallery.loadGalleryData();
            
            // Inicializar componentes
            this.initEventListeners();
            
            notifications.show('success', 'Bienvenido', `Hola ${userInfo.name || userInfo.login}!`);
        } catch (error) {
            console.error('Error cargando aplicación autenticada:', error);
            auth.logout();
            this.showLoginScreen();
        }
    }

    initLoginForm() {
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const token = document.getElementById('github-token').value.trim();
            if (!token) {
                notifications.show('error', 'Token requerido', 'Por favor ingresa tu token de GitHub.');
                return;
            }

            try {
                this.showLoading();
                const result = await auth.login(token);
                
                if (result.success) {
                    await this.loadAuthenticatedApp();
                } else {
                    notifications.show('error', 'Error de autenticación', result.error);
                }
            } catch (error) {
                console.error('Error en login:', error);
                notifications.show('error', 'Error de conexión', 'No se pudo conectar con GitHub.');
            } finally {
                this.hideLoading();
            }
        });
    }

    initEventListeners() {
        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            auth.logout();
            location.reload();
        });

        // Filtros de galería
        document.getElementById('search-images').addEventListener('input', (e) => {
            gallery.setSearch(e.target.value);
        });

        document.getElementById('filter-category').addEventListener('change', (e) => {
            gallery.setFilter(e.target.value);
        });

        // Formulario de subida
        this.initUploadForm();

        // Modal de edición
        this.initEditModal();

        // Botones de configuración
        this.initSettingsButtons();
    }

    initUploadForm() {
        const uploadForm = document.getElementById('upload-form');
        const fileInput = document.getElementById('image-file');
        const uploadArea = document.getElementById('file-upload-area');
        const imagePreview = document.getElementById('image-preview');
        const previewImg = document.getElementById('preview-img');
        const categorySelect = document.getElementById('image-category');
        const folderInput = document.getElementById('image-folder');

        // Click en área de subida
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0]);
            }
        });

        // Selección de archivo
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
            }
        });

        // Cambio de categoría
        categorySelect.addEventListener('change', (e) => {
            const folder = gallery.getCategoryFolder(e.target.value);
            folderInput.value = folder;
        });

        // Función para manejar selección de archivo
        function handleFileSelect(file) {
            if (!githubAPI.isValidImageFormat(file)) {
                notifications.show('error', 'Formato inválido', 'Solo se permiten archivos JPG, PNG y WebP.');
                return;
            }

            if (!githubAPI.isValidFileSize(file, 5)) {
                notifications.show('error', 'Archivo muy grande', 'El archivo no puede ser mayor a 5MB.');
                return;
            }

            // Mostrar vista previa
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImg.src = e.target.result;
                uploadArea.style.display = 'none';
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);

            // Actualizar nombre del archivo
            const category = categorySelect.value || 'misc';
            const filename = githubAPI.generateUniqueFilename(file.name, category);
            document.getElementById('image-filename').value = filename;
        }

        // Remover imagen
        document.getElementById('remove-image').addEventListener('click', () => {
            fileInput.value = '';
            uploadArea.style.display = 'block';
            imagePreview.style.display = 'none';
            document.getElementById('image-filename').value = '';
        });

        // Reset formulario
        document.getElementById('reset-form').addEventListener('click', () => {
            uploadForm.reset();
            fileInput.value = '';
            uploadArea.style.display = 'block';
            imagePreview.style.display = 'none';
            document.getElementById('image-filename').value = '';
            folderInput.value = '';
        });

        // Submit formulario
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const file = fileInput.files[0];
            if (!file) {
                notifications.show('error', 'Archivo requerido', 'Por favor selecciona una imagen.');
                return;
            }

            const metadata = {
                title: document.getElementById('image-title').value.trim(),
                category: document.getElementById('image-category').value,
                alt: document.getElementById('image-alt').value.trim(),
                description: document.getElementById('image-description').value.trim()
            };

            if (!metadata.title || !metadata.category || !metadata.alt) {
                notifications.show('error', 'Campos requeridos', 'Por favor completa todos los campos obligatorios.');
                return;
            }

            try {
                await gallery.uploadNewImage(file, metadata);
                
                // Reset formulario
                uploadForm.reset();
                fileInput.value = '';
                uploadArea.style.display = 'block';
                imagePreview.style.display = 'none';
                document.getElementById('image-filename').value = '';
                folderInput.value = '';

                // Cambiar a pestaña de galería
                tabManager.switchTab('gallery');
            } catch (error) {
                console.error('Error subiendo imagen:', error);
            }
        });
    }

    initEditModal() {
        const modal = document.getElementById('edit-modal');
        const editForm = document.getElementById('edit-form');

        // Cerrar modal
        document.querySelectorAll('[data-close="edit-modal"]').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        });

        // Cerrar al hacer click fuera
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });

        // Submit formulario de edición
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const editingId = modal.dataset.editingId;
            if (!editingId) return;

            const updatedData = {
                title: document.getElementById('edit-title').value.trim(),
                category: document.getElementById('edit-category').value,
                alt: document.getElementById('edit-alt').value.trim(),
                description: document.getElementById('edit-description').value.trim()
            };

            if (!updatedData.title || !updatedData.category || !updatedData.alt) {
                notifications.show('error', 'Campos requeridos', 'Por favor completa todos los campos obligatorios.');
                return;
            }

            try {
                await gallery.updateImage(editingId, updatedData);
                modal.classList.remove('active');
            } catch (error) {
                console.error('Error actualizando imagen:', error);
            }
        });
    }

    initSettingsButtons() {
        // Descargar backup
        document.getElementById('download-backup').addEventListener('click', () => {
            gallery.createBackup();
        });

        // Validar JSON
        document.getElementById('validate-json').addEventListener('click', () => {
            const validation = gallery.validateGalleryData();
            
            if (validation.valid) {
                notifications.show('success', 'Validación exitosa', 'La estructura del JSON es válida.');
            } else {
                const errorMessage = validation.errors.join('\n');
                notifications.show('error', 'Errores encontrados', `Se encontraron los siguientes errores:\n${errorMessage}`);
            }
        });

        // Recargar datos
        document.getElementById('refresh-data').addEventListener('click', async () => {
            try {
                await gallery.loadGalleryData();
                notifications.show('success', 'Datos recargados', 'Los datos se han actualizado desde el repositorio.');
            } catch (error) {
                console.error('Error recargando datos:', error);
                notifications.show('error', 'Error recargando', error.message);
            }
        });
    }
}

// Instancias globales
const notifications = new NotificationSystem();
let tabManager;
let app;

// Inicializar aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar iconos de Lucide
    lucide.createIcons();
    
    // Inicializar gestor de pestañas
    tabManager = new TabManager();
    
    // Inicializar aplicación
    app = new AdminApp();
});

// Agregar estilos para animación de salida de notificación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);