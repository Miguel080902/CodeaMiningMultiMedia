// Gestión de la Galería - VERSIÓN ACTUALIZADA CON OPTIMIZACIÓN
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
                description: imageData.description || '',
                // Agregar metadatos de optimización
                optimized: imageData.optimized || false,
                originalSize: imageData.originalSize || null,
                compressionRatio: imageData.compressionRatio || null
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

    // Subir nueva imagen completa CON OPTIMIZACIÓN
    async uploadNewImage(file, metadata) {
        try {
            // Validaciones iniciales
            if (!githubAPI.isValidImageFormat(file)) {
                throw new Error('Formato de imagen no válido. Use JPG, PNG o WebP.');
            }

            if (!githubAPI.isValidFileSize(file, 10)) { // Aumentamos a 10MB porque optimizaremos
                throw new Error('El archivo es demasiado grande. Máximo 10MB.');
            }

            // Mostrar información de análisis
            notifications.show('info', 'Analizando imagen', 'Analizando la imagen antes de optimizar...');
            
            const analysis = await imageOptimizer.analyzeImage(file);
            console.log('Análisis de imagen:', analysis);

            let finalFile = file;
            let optimizationInfo = null;

            // Optimizar imagen si es necesario
            if (analysis.needsOptimization) {
                notifications.show('info', 'Optimizando imagen', 'Optimizando imagen para web...');
                
                const optimizationResult = await imageOptimizer.optimizeImage(file, {
                    format: imageOptimizer.getOptimalFormat()
                });

                // Crear archivo optimizado
                const extension = optimizationResult.format === 'webp' ? 'webp' : 'jpg';
                const optimizedFilename = file.name.replace(/\.[^/.]+$/, `.${extension}`);
                
                finalFile = imageOptimizer.blobToFile(
                    optimizationResult.optimizedBlob,
                    optimizedFilename,
                    `image/${optimizationResult.format}`
                );

                optimizationInfo = {
                    optimized: true,
                    originalSize: optimizationResult.originalSize,
                    optimizedSize: optimizationResult.optimizedSize,
                    compressionRatio: optimizationResult.compressionRatio,
                    originalDimensions: `${analysis.dimensions.width}x${analysis.dimensions.height}`,
                    optimizedDimensions: `${optimizationResult.dimensions.width}x${optimizationResult.dimensions.height}`
                };

                notifications.show('success', 'Optimización completada', 
                    `Imagen optimizada: ${optimizationInfo.compressionRatio}% de reducción (${imageOptimizer.formatFileSize(optimizationInfo.originalSize)} → ${imageOptimizer.formatFileSize(optimizationInfo.optimizedSize)})`
                );
            } else {
                notifications.show('info', 'Imagen ya optimizada', 'La imagen no requiere optimización adicional.');
                optimizationInfo = {
                    optimized: false,
                    originalSize: file.size
                };
            }

            // Generar nombre único para el archivo final
            const filename = githubAPI.generateUniqueFilename(finalFile.name, metadata.category);
            const folder = this.getCategoryFolder(metadata.category);

            // Subir archivo optimizado
            notifications.show('info', 'Subiendo imagen', 'Subiendo imagen optimizada al servidor...');
            
            const uploadResult = await githubAPI.uploadImage(finalFile, folder, filename);

            // Agregar a la galería con información de optimización
            const imageData = {
                src: `${folder}/${filename}`,
                alt: metadata.alt,
                category: metadata.category,
                title: metadata.title,
                description: metadata.description,
                ...optimizationInfo
            };

            await this.addImage(imageData);

            return {
                success: true,
                image: imageData,
                url: uploadResult.url,
                optimization: optimizationInfo
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

        // Estadísticas de optimización
        const optimizedImages = this.galleryData.images.filter(img => img.optimized).length;
        const totalSavedBytes = this.galleryData.images
            .filter(img => img.optimized && img.originalSize && img.compressionRatio)
            .reduce((total, img) => {
                const savedBytes = img.originalSize * (parseFloat(img.compressionRatio) / 100);
                return total + savedBytes;
            }, 0);

        document.getElementById('total-images').textContent = total;
        document.getElementById('evento-count').textContent = evento;
        document.getElementById('keynotes-count').textContent = keynotes;
        document.getElementById('ponentes-count').textContent = ponentes;
        
        // Agregar testimonios si existe el elemento
        const testimoniosElement = document.getElementById('testimonios-count');
        if (testimoniosElement) {
            testimoniosElement.textContent = testimonios;
        }

        // Mostrar estadísticas de optimización si existen elementos
        const optimizedElement = document.getElementById('optimized-count');
        if (optimizedElement) {
            optimizedElement.textContent = optimizedImages;
        }

        const savedSpaceElement = document.getElementById('saved-space');
        if (savedSpaceElement) {
            savedSpaceElement.textContent = imageOptimizer.formatFileSize(totalSavedBytes);
        }
    }

    // Renderizar galería con información de optimización
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

        galleryGrid.innerHTML = this.filteredImages.map(image => {
            const optimizationBadge = image.optimized ? 
                `<div class="optimization-badge" title="Imagen optimizada - ${image.compressionRatio}% de reducción">
                    <i data-lucide="zap"></i>
                </div>` : '';

            return `
                <div class="gallery-item" data-id="${image.id}">
                    <div class="gallery-item-image">
                        <img src="${this.getImageUrl(image.src)}" alt="${image.alt}" loading="lazy">
                        <div class="gallery-item-category">${this.getCategoryName(image.category)}</div>
                        ${optimizationBadge}
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
                        ${image.optimized ? `
                            <div class="optimization-info">
                                <small>Optimizada: ${image.compressionRatio}% reducción</small>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

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

    // Re-optimizar imagen existente
    async reoptimizeImage(id) {
        try {
            const image = this.galleryData.images.find(img => img.id === id);
            if (!image) throw new Error('Imagen no encontrada');

            // Esto requeriría descargar la imagen actual, optimizarla y volver a subirla
            // Es más complejo y requiere consideraciones adicionales
            notifications.show('info', 'Función en desarrollo', 'La re-optimización de imágenes existentes estará disponible próximamente.');
        } catch (error) {
            console.error('Error re-optimizando imagen:', error);
            notifications.show('error', 'Error re-optimizando', error.message);
        }
    }
}

// Instancia global del gestor de galería
const gallery = new GalleryManager();