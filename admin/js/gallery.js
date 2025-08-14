// Gestión de la Galería
class GalleryManager {
    constructor() {
        this.galleryData = null;
        this.filteredImages = [];
        this.currentFilter = '';
        this.currentSearch = '';
    }

    // Cargar datos de la galería
    async loadGalleryData() {
        try {
            const file = await githubAPI.getFile('data/gallery.json');
            this.galleryData = JSON.parse(file.content);
            this.filteredImages = [...this.galleryData.images];
            this.updateStats();
            this.renderGallery();
            return this.galleryData;
        } catch (error) {
            console.error('Error cargando datos de galería:', error);
            throw error;
        }
    }

    // Guardar datos de la galería
    async saveGalleryData(message = 'Update gallery data') {
        try {
            const jsonContent = JSON.stringify(this.galleryData, null, 2);
            await githubAPI.updateFile('data/gallery.json', jsonContent, message);
            notifications.show('success', 'Guardado exitoso', 'Los datos de la galería se han actualizado correctamente.');
        } catch (error) {
            console.error('Error guardando datos de galería:', error);
            notifications.show('error', 'Error al guardar', error.message);
            throw error;
        }
    }

    // Agregar nueva imagen
    async addImage(imageData) {
        try {
            // Generar nuevo ID
            const maxId = Math.max(...this.galleryData.images.map(img => parseInt(img.id)));
            const newId = (maxId + 1).toString();

            const newImage = {
                id: newId,
                src: imageData.src,
                alt: imageData.alt,
                category: imageData.category,
                title: imageData.title,
                description: imageData.description || ''
            };

            this.galleryData.images.push(newImage);
            await this.saveGalleryData(`Add new image: ${imageData.title}`);
            
            this.applyFilters();
            this.updateStats();
            this.renderGallery();

            notifications.show('success', 'Imagen agregada', `La imagen "${imageData.title}" se ha agregado exitosamente.`);
            return newImage;
        } catch (error) {
            console.error('Error agregando imagen:', error);
            notifications.show('error', 'Error al agregar imagen', error.message);
            throw error;
        }
    }

    // Actualizar imagen existente
    async updateImage(id, updatedData) {
        try {
            const imageIndex = this.galleryData.images.findIndex(img => img.id === id);
            
            if (imageIndex === -1) {
                throw new Error('Imagen no encontrada');
            }

            // Actualizar datos
            this.galleryData.images[imageIndex] = {
                ...this.galleryData.images[imageIndex],
                ...updatedData
            };

            await this.saveGalleryData(`Update image: ${updatedData.title || this.galleryData.images[imageIndex].title}`);
            
            this.applyFilters();
            this.updateStats();
            this.renderGallery();

            notifications.show('success', 'Imagen actualizada', 'Los cambios se han guardado correctamente.');
            return this.galleryData.images[imageIndex];
        } catch (error) {
            console.error('Error actualizando imagen:', error);
            notifications.show('error', 'Error al actualizar imagen', error.message);
            throw error;
        }
    }

    // Eliminar imagen
    async deleteImage(id) {
        try {
            const imageIndex = this.galleryData.images.findIndex(img => img.id === id);
            
            if (imageIndex === -1) {
                throw new Error('Imagen no encontrada');
            }

            const image = this.galleryData.images[imageIndex];
            
            // Confirmar eliminación
            if (!confirm(`¿Estás seguro de que quieres eliminar "${image.title}"?`)) {
                return;
            }

            // Eliminar imagen del array
            this.galleryData.images.splice(imageIndex, 1);

            // Intentar eliminar archivo físico (opcional, puede fallar si no existe)
            try {
                const imagePath = `images/${image.src}`;
                await githubAPI.deleteFile(imagePath, `Delete image: ${image.title}`);
            } catch (deleteError) {
                console.warn('No se pudo eliminar el archivo físico:', deleteError);
            }

            await this.saveGalleryData(`Remove image: ${image.title}`);
            
            this.applyFilters();
            this.updateStats();
            this.renderGallery();

            notifications.show('success', 'Imagen eliminada', `La imagen "${image.title}" se ha eliminado correctamente.`);
        } catch (error) {
            console.error('Error eliminando imagen:', error);
            notifications.show('error', 'Error al eliminar imagen', error.message);
            throw error;
        }
    }

    // Subir nueva imagen completa
    async uploadNewImage(file, metadata) {
        try {
            // Validaciones
            if (!githubAPI.isValidImageFormat(file)) {
                throw new Error('Formato de imagen no válido. Use JPG, PNG o WebP.');
            }

            if (!githubAPI.isValidFileSize(file, 5)) {
                throw new Error('El archivo es demasiado grande. Máximo 5MB.');
            }

            // Generar nombre único
            const filename = githubAPI.generateUniqueFilename(file.name, metadata.category);
            const folder = this.getCategoryFolder(metadata.category);

            // Subir archivo
            notifications.show('info', 'Subiendo imagen', 'Por favor espera mientras se sube la imagen...');
            
            const uploadResult = await githubAPI.uploadImage(file, folder, filename);

            // Agregar a la galería
            const imageData = {
                src: `${folder}/${filename}`,
                alt: metadata.alt,
                category: metadata.category,
                title: metadata.title,
                description: metadata.description
            };

            await this.addImage(imageData);

            return {
                success: true,
                image: imageData,
                url: uploadResult.url
            };
        } catch (error) {
            console.error('Error subiendo nueva imagen:', error);
            notifications.show('error', 'Error al subir imagen', error.message);
            throw error;
        }
    }

    // Obtener carpeta según categoría
    getCategoryFolder(category) {
        const folders = {
            'evento': 'about',
            'keynotes': 'keynotes',
            'ponentes': 'speakers',
            'testimonios': 'testimonial'
        };
        return folders[category] || 'misc';
    }

    // Filtrar imágenes
    applyFilters() {
        let filtered = [...this.galleryData.images];

        // Filtro por categoría
        if (this.currentFilter) {
            filtered = filtered.filter(img => img.category === this.currentFilter);
        }

        // Filtro por búsqueda
        if (this.currentSearch) {
            const search = this.currentSearch.toLowerCase();
            filtered = filtered.filter(img => 
                img.title.toLowerCase().includes(search) ||
                img.description.toLowerCase().includes(search) ||
                img.alt.toLowerCase().includes(search)
            );
        }

        this.filteredImages = filtered;
    }

    // Establecer filtro de categoría
    setFilter(category) {
        this.currentFilter = category;
        this.applyFilters();
        this.renderGallery();
    }

    // Establecer búsqueda
    setSearch(query) {
        this.currentSearch = query;
        this.applyFilters();
        this.renderGallery();
    }

    // Actualizar estadísticas
    updateStats() {
        if (!this.galleryData) return;

        const total = this.galleryData.images.length;
        const evento = this.galleryData.images.filter(img => img.category === 'evento').length;
        const keynotes = this.galleryData.images.filter(img => img.category === 'keynotes').length;
        const ponentes = this.galleryData.images.filter(img => img.category === 'ponentes').length;
        const testimonios = this.galleryData.images.filter(img => img.category === 'testimonios').length;

        document.getElementById('total-images').textContent = total;
        document.getElementById('evento-count').textContent = evento;
        document.getElementById('keynotes-count').textContent = keynotes;
        document.getElementById('ponentes-count').textContent = ponentes;
        
        // Agregar testimonios si existe el elemento
        const testimoniosElement = document.getElementById('testimonios-count');
        if (testimoniosElement) {
            testimoniosElement.textContent = testimonios;
        }
    }

    // Renderizar galería
    renderGallery() {
        const galleryGrid = document.getElementById('gallery-grid');
        if (!galleryGrid) return;

        if (this.filteredImages.length === 0) {
            galleryGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <i data-lucide="image" style="width: 48px; height: 48px; margin: 0 auto 1rem; color: #94a3b8;"></i>
                    <h3 style="color: #e2e8f0; margin-bottom: 0.5rem;">No se encontraron imágenes</h3>
                    <p style="color: #94a3b8;">Prueba con diferentes filtros o agrega nuevas imágenes.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        galleryGrid.innerHTML = this.filteredImages.map(image => `
            <div class="gallery-item" data-id="${image.id}">
                <div class="gallery-item-image">
                    <img src="${this.getImageUrl(image.src)}" alt="${image.alt}" loading="lazy">
                    <div class="gallery-item-category">${this.getCategoryName(image.category)}</div>
                    <div class="gallery-item-actions">
                        <button class="action-btn edit" onclick="gallery.editImage('${image.id}')" title="Editar">
                            <i data-lucide="edit-2"></i>
                        </button>
                        <button class="action-btn delete" onclick="gallery.deleteImage('${image.id}')" title="Eliminar">
                            <i data-lucide="trash-2"></i>
                        </button>
                    </div>
                </div>
                <div class="gallery-item-content">
                    <h3 class="gallery-item-title">${image.title}</h3>
                    <p class="gallery-item-description">${image.description || 'Sin descripción'}</p>
                </div>
            </div>
        `).join('');

        // Re-inicializar iconos de Lucide
        lucide.createIcons();
    }

    // Obtener URL completa de imagen
    getImageUrl(src) {
        if (!this.galleryData) return '';
        return `${this.galleryData.baseUrl}/${src}`;
    }

    // Obtener nombre de categoría
    getCategoryName(category) {
        const names = {
            'evento': 'Evento',
            'keynotes': 'Keynotes',
            'ponentes': 'Ponentes',
            'testimonios': 'Testimonios'
        };
        return names[category] || category;
    }

    // Editar imagen (abrir modal)
    editImage(id) {
        const image = this.galleryData.images.find(img => img.id === id);
        if (!image) return;

        // Llenar formulario de edición
        document.getElementById('edit-title').value = image.title;
        document.getElementById('edit-category').value = image.category;
        document.getElementById('edit-alt').value = image.alt;
        document.getElementById('edit-description').value = image.description || '';

        // Mostrar modal
        const modal = document.getElementById('edit-modal');
        modal.classList.add('active');
        modal.dataset.editingId = id;
    }

    // Validar estructura JSON
    validateGalleryData() {
        if (!this.galleryData) {
            return { valid: false, errors: ['No hay datos cargados'] };
        }

        const errors = [];

        // Validar estructura básica
        if (!this.galleryData.baseUrl) {
            errors.push('Falta baseUrl');
        }

        if (!this.galleryData.images || !Array.isArray(this.galleryData.images)) {
            errors.push('Falta array de imágenes');
        }

        // Validar imágenes
        if (this.galleryData.images) {
            this.galleryData.images.forEach((img, index) => {
                if (!img.id) errors.push(`Imagen ${index + 1}: Falta ID`);
                if (!img.src) errors.push(`Imagen ${index + 1}: Falta src`);
                if (!img.title) errors.push(`Imagen ${index + 1}: Falta título`);
                if (!img.category) errors.push(`Imagen ${index + 1}: Falta categoría`);
                if (!img.alt) errors.push(`Imagen ${index + 1}: Falta texto alternativo`);
            });

            // Verificar IDs únicos
            const ids = this.galleryData.images.map(img => img.id);
            const uniqueIds = [...new Set(ids)];
            if (ids.length !== uniqueIds.length) {
                errors.push('Hay IDs duplicados');
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // Crear backup del JSON
    createBackup() {
        if (!this.galleryData) return;

        const dataStr = JSON.stringify(this.galleryData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `gallery-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        notifications.show('success', 'Backup creado', 'El archivo de respaldo se ha descargado correctamente.');
    }
}

// Instancia global del gestor de galería
const gallery = new GalleryManager();