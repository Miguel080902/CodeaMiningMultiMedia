// Optimizador Masivo de Imágenes Existentes
class BulkImageOptimizer {
    constructor() {
        this.isRunning = false;
        this.progress = {
            total: 0,
            processed: 0,
            optimized: 0,
            skipped: 0,
            errors: 0
        };
        this.results = [];
    }

    // Optimizar todas las imágenes existentes
    async optimizeAllImages(options = {}) {
        if (this.isRunning) {
            notifications.show('warning', 'Optimización en curso', 'Ya hay una optimización ejecutándose.');
            return;
        }

        try {
            this.isRunning = true;
            this.resetProgress();
            
            const settings = {
                dryRun: options.dryRun || false,
                createBackup: options.createBackup !== false,
                skipOptimized: options.skipOptimized !== false,
                ...options
            };

            notifications.show('info', 'Iniciando optimización masiva', 'Analizando imágenes existentes...');
            
            // Obtener todas las imágenes del repositorio
            const allImages = await this.discoverAllImages();
            this.progress.total = allImages.length;

            if (allImages.length === 0) {
                notifications.show('info', 'No hay imágenes', 'No se encontraron imágenes para optimizar.');
                return;
            }

            // Crear backup si es necesario
            if (settings.createBackup && !settings.dryRun) {
                await this.createRepositoryBackup();
            }

            // Mostrar modal de progreso
            this.showProgressModal();

            // Procesar imágenes en lotes
            const batchSize = 3; // Procesar de a 3 imágenes para no sobrecargar
            for (let i = 0; i < allImages.length; i += batchSize) {
                const batch = allImages.slice(i, i + batchSize);
                await this.processBatch(batch, settings);
                this.updateProgressModal();
                
                // Pausa pequeña entre lotes
                await this.delay(1000);
            }

            // Mostrar resultados finales
            this.showFinalResults();
            
        } catch (error) {
            console.error('Error en optimización masiva:', error);
            notifications.show('error', 'Error en optimización masiva', error.message);
        } finally {
            this.isRunning = false;
            this.hideProgressModal();
        }
    }

    // Descubrir todas las imágenes en el repositorio
    async discoverAllImages() {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        // Usar las carpetas que realmente existen basadas en el gallery.json
        const imageFolders = ['about', 'backgrounds', 'hero', 'highlights', 'speakers', 'testimonial'];
        const allImages = [];

        try {
            // Primero verificar qué carpetas existen realmente
            const existingFolders = await this.validateFolders(imageFolders);
            console.log(`📁 Carpetas encontradas: ${existingFolders.join(', ')}`);
            
            if (existingFolders.length === 0) {
                notifications.show('warning', 'Sin carpetas', 'No se encontraron carpetas de imágenes en el repositorio.');
                return [];
            }
            // Buscar en las carpetas existentes
            for (const folder of existingFolders) {
                try {
                    const files = await githubAPI.listFiles(`images/${folder}`);
                    
                    for (const file of files) {
                        if (file.type === 'file') {
                            const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
                            if (imageExtensions.includes(extension)) {
                                allImages.push({
                                    path: file.path,
                                    name: file.name,
                                    size: file.size,
                                    sha: file.sha,
                                    folder: folder,
                                    downloadUrl: file.download_url
                                });
                            }
                        }
                    }
                } catch (error) {
                    // Solo advertir si no es un error 404 (carpeta no existe)
                    if (!error.message.includes('404')) {
                        console.warn(`Error listando carpeta ${folder}:`, error);
                    }
                }
            }

            // También buscar en la raíz de images
            try {
                const rootFiles = await githubAPI.listFiles('images');
                for (const file of rootFiles) {
                    if (file.type === 'file') {
                        const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
                        if (imageExtensions.includes(extension)) {
                            allImages.push({
                                path: file.path,
                                name: file.name,
                                size: file.size,
                                sha: file.sha,
                                folder: 'root',
                                downloadUrl: file.download_url
                            });
                        }
                    }
                }
            } catch (error) {
                console.warn('Error listando carpeta raíz:', error);
            }

        } catch (error) {
            console.error('Error descubriendo imágenes:', error);
            throw error;
        }

        return allImages;
    }

    // Procesar un lote de imágenes
    async processBatch(batch, settings) {
        const promises = batch.map(image => this.processImage(image, settings));
        await Promise.allSettled(promises);
    }

    // Procesar una imagen individual
    async processImage(imageInfo, settings) {
        try {
            this.progress.processed++;

            // Verificar si ya está optimizada (por nombre o metadatos)
            if (settings.skipOptimized && this.isAlreadyOptimized(imageInfo)) {
                this.progress.skipped++;
                this.results.push({
                    ...imageInfo,
                    status: 'skipped',
                    reason: 'Already optimized'
                });
                return;
            }

            // Descargar imagen
            const imageBlob = await this.downloadImage(imageInfo.downloadUrl);
            
            // Crear archivo temporal
            const tempFile = new File([imageBlob], imageInfo.name, {
                type: imageBlob.type
            });

            // Analizar si necesita optimización
            const analysis = await imageOptimizer.analyzeImage(tempFile);
            
            if (!analysis.needsOptimization && settings.skipOptimized) {
                this.progress.skipped++;
                this.results.push({
                    ...imageInfo,
                    status: 'skipped',
                    reason: 'No optimization needed',
                    analysis
                });
                return;
            }

            // Optimizar imagen
            const optimizationResult = await imageOptimizer.optimizeImage(tempFile);

            // En modo dry-run, solo simulamos
            if (settings.dryRun) {
                this.progress.optimized++;
                this.results.push({
                    ...imageInfo,
                    status: 'simulated',
                    originalSize: optimizationResult.originalSize,
                    optimizedSize: optimizationResult.optimizedSize,
                    compressionRatio: optimizationResult.compressionRatio,
                    savedBytes: optimizationResult.originalSize - optimizationResult.optimizedSize
                });
                return;
            }

            // Crear archivo optimizado
            const extension = optimizationResult.format === 'webp' ? 'webp' : 'jpg';
            const newName = this.generateOptimizedFilename(imageInfo.name, extension);
            
            const optimizedFile = imageOptimizer.blobToFile(
                optimizationResult.optimizedBlob,
                newName,
                `image/${optimizationResult.format}`
            );

            // Subir imagen optimizada (reemplazando o creando nueva)
            const newPath = `images/${imageInfo.folder}/${newName}`;
            
            if (newName === imageInfo.name) {
                // Reemplazar archivo existente (mismo nombre, pero optimizado)
                await githubAPI.replaceImage(optimizedFile, imageInfo.path, imageInfo.sha, `Optimize image: ${newName}`);
            } else {
                // Crear nuevo archivo optimizado y eliminar original
                await githubAPI.uploadImage(optimizedFile, imageInfo.folder, newName);
                await githubAPI.deleteFile(imageInfo.path, `Replace with optimized version: ${newName}`);
                
                // Actualizar gallery.json con la nueva extensión
                await this.updateGalleryJsonPaths(imageInfo.name, newName, imageInfo.folder);
            }

            this.progress.optimized++;
            this.results.push({
                ...imageInfo,
                status: 'optimized',
                newName: newName,
                originalSize: optimizationResult.originalSize,
                optimizedSize: optimizationResult.optimizedSize,
                compressionRatio: optimizationResult.compressionRatio,
                savedBytes: optimizationResult.originalSize - optimizationResult.optimizedSize
            });

        } catch (error) {
            console.error(`Error procesando ${imageInfo.name}:`, error);
            this.progress.errors++;
            
            // Clasificar diferentes tipos de errores para mejor diagnóstico
            let errorType = 'unknown';
            let errorMessage = error.message;
            
            if (error.message.includes('404')) {
                errorType = 'file_not_found';
                errorMessage = 'Archivo no encontrado en el repositorio';
            } else if (error.message.includes('409') || error.message.includes('does not match')) {
                errorType = 'conflict';
                errorMessage = 'Conflicto: archivo modificado por otro usuario';
            } else if (error.message.includes('422')) {
                errorType = 'invalid_request';
                errorMessage = 'Error de validación en GitHub API';
            } else if (error.message.includes('403')) {
                errorType = 'permission_denied';
                errorMessage = 'Sin permisos para modificar el archivo';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorType = 'network_error';
                errorMessage = 'Error de conexión de red';
            }
            
            this.results.push({
                ...imageInfo,
                status: 'error',
                errorType: errorType,
                error: errorMessage,
                originalError: error.message
            });
        }
    }

    // Descargar imagen desde URL
    async downloadImage(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error descargando imagen: ${response.statusText}`);
        }
        return await response.blob();
    }

    // Verificar si una imagen ya está optimizada
    isAlreadyOptimized(imageInfo) {
        // Verificar por extensión webp o nombres que incluyan 'optimized'
        const name = imageInfo.name.toLowerCase();
        return name.endsWith('.webp') || 
               name.includes('optimized') || 
               name.includes('compressed') ||
               imageInfo.size < 100000; // Menor a 100KB probablemente ya optimizada
    }

    // Generar nombre para archivo optimizado
    generateOptimizedFilename(originalName, newExtension) {
        const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
        return `${baseName}.${newExtension}`;
    }

    // Crear backup del repositorio
    async createRepositoryBackup() {
        try {
            const backupData = {
                timestamp: new Date().toISOString(),
                galleryData: gallery.galleryData,
                images: this.results
            };

            const backupBlob = new Blob([JSON.stringify(backupData, null, 2)], {
                type: 'application/json'
            });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(backupBlob);
            link.download = `repository-backup-${Date.now()}.json`;
            link.click();

            notifications.show('success', 'Backup creado', 'Se ha descargado un backup del repositorio.');
        } catch (error) {
            console.error('Error creando backup:', error);
            throw new Error('No se pudo crear el backup');
        }
    }

    // Mostrar modal de progreso
    showProgressModal() {
        const modal = document.createElement('div');
        modal.id = 'bulk-progress-modal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3><i data-lucide="zap"></i> Optimización Masiva en Progreso</h3>
                </div>
                <div class="bulk-progress-content">
                    <div class="progress-stats">
                        <div class="stat-item">
                            <span class="stat-label">Total:</span>
                            <span id="bulk-total">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Procesadas:</span>
                            <span id="bulk-processed">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Optimizadas:</span>
                            <span id="bulk-optimized">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Omitidas:</span>
                            <span id="bulk-skipped">0</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Errores:</span>
                            <span id="bulk-errors">0</span>
                        </div>
                    </div>
                    
                    <div class="progress-bar-container">
                        <div class="progress-bar">
                            <div id="bulk-progress-fill" class="progress-fill" style="width: 0%"></div>
                        </div>
                        <div class="progress-text">
                            <span id="bulk-progress-text">0%</span>
                        </div>
                    </div>
                    
                    <div id="bulk-current-image" class="current-image">
                        Iniciando...
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button id="bulk-cancel" class="btn-secondary">
                        <i data-lucide="x"></i>
                        Cancelar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        lucide.createIcons();

        // Event listener para cancelar
        document.getElementById('bulk-cancel').addEventListener('click', () => {
            this.cancelOptimization();
        });
    }

    // Actualizar modal de progreso
    updateProgressModal() {
        const percentage = this.progress.total > 0 ? 
            Math.round((this.progress.processed / this.progress.total) * 100) : 0;

        document.getElementById('bulk-total').textContent = this.progress.total;
        document.getElementById('bulk-processed').textContent = this.progress.processed;
        document.getElementById('bulk-optimized').textContent = this.progress.optimized;
        document.getElementById('bulk-skipped').textContent = this.progress.skipped;
        document.getElementById('bulk-errors').textContent = this.progress.errors;
        
        const progressFill = document.getElementById('bulk-progress-fill');
        const progressText = document.getElementById('bulk-progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${percentage}%`;
        }

        const currentImage = document.getElementById('bulk-current-image');
        if (currentImage && this.progress.processed < this.progress.total) {
            currentImage.textContent = `Procesando imagen ${this.progress.processed + 1} de ${this.progress.total}`;
        } else if (currentImage) {
            currentImage.textContent = 'Completado';
        }
    }

    // Ocultar modal de progreso
    hideProgressModal() {
        const modal = document.getElementById('bulk-progress-modal');
        if (modal) {
            modal.remove();
        }
    }

    // Mostrar resultados finales
    showFinalResults() {
        const totalSaved = this.results
            .filter(r => r.savedBytes)
            .reduce((total, r) => total + r.savedBytes, 0);

        const avgCompression = this.results
            .filter(r => r.compressionRatio)
            .reduce((sum, r, _, arr) => sum + parseFloat(r.compressionRatio) / arr.length, 0);

        const message = `
            <strong>Optimización completada</strong><br>
            • ${this.progress.optimized} imágenes optimizadas<br>
            • ${this.progress.skipped} omitidas<br>
            • ${this.progress.errors} errores<br>
            • ${imageOptimizer.formatFileSize(totalSaved)} ahorrados<br>
            • ${avgCompression.toFixed(1)}% compresión promedio
        `;

        notifications.show('success', 'Optimización masiva completada', message, 10000);

        // Recargar datos de la galería
        setTimeout(() => {
            if (gallery && gallery.loadGalleryData) {
                gallery.loadGalleryData();
            }
        }, 2000);
    }

    // Cancelar optimización
    cancelOptimization() {
        this.isRunning = false;
        this.hideProgressModal();
        notifications.show('warning', 'Optimización cancelada', 'El proceso ha sido interrumpido.');
    }

    // Reiniciar progreso
    resetProgress() {
        this.progress = {
            total: 0,
            processed: 0,
            optimized: 0,
            skipped: 0,
            errors: 0
        };
        this.results = [];
    }

    // Validar qué carpetas existen en el repositorio
    async validateFolders(folderList) {
        const existingFolders = [];
        
        for (const folder of folderList) {
            try {
                await githubAPI.listFiles(`images/${folder}`);
                existingFolders.push(folder);
            } catch (error) {
                // Carpeta no existe, continuar con la siguiente
                if (!error.message.includes('404')) {
                    console.warn(`Error verificando carpeta ${folder}:`, error);
                }
            }
        }
        
        return existingFolders;
    }

    // Delay helper
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Obtener estadísticas de optimización
    getOptimizationStats() {
        return {
            ...this.progress,
            results: this.results
        };
    }

    // Actualizar rutas en gallery.json cuando cambia la extensión
    async updateGalleryJsonPaths(oldFileName, newFileName, folder) {
        try {
            // Solo actualizar si realmente cambió la extensión
            if (oldFileName === newFileName) return;
            
            // Recargar datos más recientes de la galería
            await gallery.loadGalleryData();
            
            // Buscar y actualizar imágenes que coincidan
            let updated = false;
            const oldPath = `${folder}/${oldFileName}`;
            const newPath = `${folder}/${newFileName}`;
            
            console.log(`🔍 Buscando ${oldPath} para actualizar a ${newPath}`);
            
            for (let image of gallery.galleryData.images) {
                if (image.src === oldPath) {
                    console.log(`✅ Encontrada imagen: ${image.title} (ID: ${image.id})`);
                    image.src = newPath;
                    // Agregar metadatos de optimización
                    image.optimized = true;
                    const result = this.results.find(r => r.name === oldFileName);
                    if (result) {
                        image.compressionRatio = result.compressionRatio;
                        image.originalSize = result.originalSize;
                        image.optimizedSize = result.optimizedSize;
                    }
                    updated = true;
                }
            }
            
            // Guardar cambios si hubo actualizaciones
            if (updated) {
                await gallery.saveGalleryData(`Update image paths after optimization: ${newFileName}`);
                console.log(`✅ Actualizado gallery.json: ${oldPath} → ${newPath}`);
                
                // Recargar la galería para mostrar cambios inmediatamente
                setTimeout(() => {
                    gallery.renderGallery();
                }, 1000);
            } else {
                console.warn(`⚠️ No se encontró ${oldPath} en gallery.json`);
            }
            
        } catch (error) {
            console.error('Error actualizando gallery.json:', error);
            // No fallar la optimización por esto, solo advertir
        }
    }

    // Exportar reporte detallado
    exportDetailedReport() {
        const report = {
            timestamp: new Date().toISOString(),
            progress: this.progress,
            results: this.results,
            summary: {
                totalSavedBytes: this.results
                    .filter(r => r.savedBytes)
                    .reduce((total, r) => total + r.savedBytes, 0),
                averageCompression: this.results
                    .filter(r => r.compressionRatio)
                    .reduce((sum, r, _, arr) => sum + parseFloat(r.compressionRatio) / arr.length, 0)
            }
        };

        const reportBlob = new Blob([JSON.stringify(report, null, 2)], {
            type: 'application/json'
        });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(reportBlob);
        link.download = `optimization-report-${Date.now()}.json`;
        link.click();

        notifications.show('success', 'Reporte exportado', 'El reporte detallado se ha descargado.');
    }
}

// CSS para el modal de progreso
const bulkOptimizationStyles = `
<style>
.bulk-progress-content {
    padding: 1.5rem 0;
}

.progress-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
}

.stat-item {
    text-align: center;
    padding: 1rem;
    background: #0f172a;
    border-radius: 8px;
    border: 1px solid #334155;
}

.stat-label {
    display: block;
    color: #94a3b8;
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
}

.stat-item span:last-child {
    color: #f1f5f9;
    font-size: 1.25rem;
    font-weight: 600;
}

.progress-bar-container {
    margin-bottom: 1.5rem;
}

.progress-bar {
    width: 100%;
    height: 20px;
    background: #1e293b;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid #334155;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #10b981);
    transition: width 0.3s ease;
}

.progress-text {
    text-align: center;
    margin-top: 0.5rem;
    color: #f1f5f9;
    font-weight: 600;
}

.current-image {
    text-align: center;
    color: #94a3b8;
    font-style: italic;
    padding: 1rem;
    background: #0f172a;
    border-radius: 6px;
    border: 1px solid #334155;
}
</style>
`;

// Agregar estilos al head
document.head.insertAdjacentHTML('beforeend', bulkOptimizationStyles);

// Instancia global del optimizador masivo
const bulkOptimizer = new BulkImageOptimizer();