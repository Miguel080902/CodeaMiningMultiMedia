// Optimizador de Imágenes
class ImageOptimizer {
    constructor() {
        this.settings = {
            maxWidth: 1200,
            maxHeight: 1200,
            quality: 0.85,
            format: 'webp', // 'webp', 'jpeg', 'png'
            enableResize: true,
            enableCompression: true,
            createThumbnail: true,
            thumbnailSize: 300
        };
    }

    // Optimizar imagen principal
    async optimizeImage(file, customSettings = {}) {
        const settings = { ...this.settings, ...customSettings };
        
        try {
            // Crear canvas y contexto
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Cargar imagen
            const img = await this.loadImage(file);
            
            // Calcular nuevas dimensiones
            const dimensions = this.calculateDimensions(
                img.width, 
                img.height, 
                settings.maxWidth, 
                settings.maxHeight
            );
            
            // Configurar canvas
            canvas.width = dimensions.width;
            canvas.height = dimensions.height;
            
            // Aplicar optimizaciones de calidad
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Dibujar imagen redimensionada
            ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);
            
            // Convertir a blob optimizado
            const optimizedBlob = await this.canvasToBlob(canvas, settings.format, settings.quality);
            
            // Calcular estadísticas
            const originalSize = file.size;
            const optimizedSize = optimizedBlob.size;
            const compressionRatio = ((originalSize - optimizedSize) / originalSize * 100).toFixed(1);
            
            return {
                originalFile: file,
                optimizedBlob: optimizedBlob,
                dimensions: dimensions,
                originalSize: originalSize,
                optimizedSize: optimizedSize,
                compressionRatio: compressionRatio,
                format: settings.format
            };
            
        } catch (error) {
            console.error('Error optimizando imagen:', error);
            throw new Error(`Error en optimización: ${error.message}`);
        }
    }

    // Crear thumbnail
    async createThumbnail(file, size = 300) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = await this.loadImage(file);
            
            // Calcular dimensiones cuadradas centradas
            const sourceSize = Math.min(img.width, img.height);
            const startX = (img.width - sourceSize) / 2;
            const startY = (img.height - sourceSize) / 2;
            
            canvas.width = size;
            canvas.height = size;
            
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Dibujar imagen centrada y recortada
            ctx.drawImage(
                img,
                startX, startY, sourceSize, sourceSize,
                0, 0, size, size
            );
            
            return await this.canvasToBlob(canvas, 'webp', 0.8);
            
        } catch (error) {
            console.error('Error creando thumbnail:', error);
            throw error;
        }
    }

    // Optimizar para diferentes tamaños
    async createMultipleSizes(file) {
        const sizes = [
            { name: 'thumbnail', width: 300, height: 300, quality: 0.8 },
            { name: 'medium', width: 600, height: 600, quality: 0.85 },
            { name: 'large', width: 1200, height: 1200, quality: 0.85 }
        ];

        const results = {};
        
        for (const size of sizes) {
            try {
                const optimized = await this.optimizeImage(file, {
                    maxWidth: size.width,
                    maxHeight: size.height,
                    quality: size.quality
                });
                results[size.name] = optimized;
            } catch (error) {
                console.warn(`Error creando tamaño ${size.name}:`, error);
            }
        }

        return results;
    }

    // Cargar imagen como elemento Image
    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            
            if (file instanceof File) {
                const reader = new FileReader();
                reader.onload = (e) => img.src = e.target.result;
                reader.onerror = reject;
                reader.readAsDataURL(file);
            } else if (typeof file === 'string') {
                img.src = file;
            } else {
                reject(new Error('Tipo de archivo no soportado'));
            }
        });
    }

    // Calcular nuevas dimensiones manteniendo proporción
    calculateDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
        let { width, height } = { width: originalWidth, height: originalHeight };

        // Si la imagen es más pequeña que los límites, mantener tamaño original
        if (width <= maxWidth && height <= maxHeight) {
            return { width, height };
        }

        // Calcular factor de escala
        const widthRatio = maxWidth / width;
        const heightRatio = maxHeight / height;
        const ratio = Math.min(widthRatio, heightRatio);

        return {
            width: Math.round(width * ratio),
            height: Math.round(height * ratio)
        };
    }

    // Convertir canvas a blob
    canvasToBlob(canvas, format = 'webp', quality = 0.85) {
        return new Promise((resolve, reject) => {
            // Mapear formatos
            const mimeType = {
                'webp': 'image/webp',
                'jpeg': 'image/jpeg',
                'jpg': 'image/jpeg',
                'png': 'image/png'
            }[format.toLowerCase()] || 'image/webp';

            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Error convirtiendo canvas a blob'));
                    }
                },
                mimeType,
                quality
            );
        });
    }

    // Validar soporte de formato
    isFormatSupported(format) {
        const canvas = document.createElement('canvas');
        const mimeType = `image/${format}`;
        return canvas.toDataURL(mimeType).indexOf(mimeType) === 5;
    }

    // Obtener formato óptimo para el navegador
    getOptimalFormat() {
        if (this.isFormatSupported('webp')) return 'webp';
        if (this.isFormatSupported('jpeg')) return 'jpeg';
        return 'png';
    }

    // Convertir blob a File
    blobToFile(blob, filename, mimeType) {
        return new File([blob], filename, { 
            type: mimeType || blob.type,
            lastModified: Date.now()
        });
    }

    // Formatear tamaño de archivo
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Actualizar configuraciones
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
    }

    // Obtener configuraciones actuales
    getSettings() {
        return { ...this.settings };
    }

    // Restablecer configuraciones por defecto
    resetSettings() {
        this.settings = {
            maxWidth: 1200,
            maxHeight: 1200,
            quality: 0.85,
            format: 'webp',
            enableResize: true,
            enableCompression: true,
            createThumbnail: true,
            thumbnailSize: 300
        };
    }

    // Analizar imagen sin optimizar
    async analyzeImage(file) {
        try {
            const img = await this.loadImage(file);
            
            return {
                filename: file.name,
                originalSize: file.size,
                dimensions: {
                    width: img.width,
                    height: img.height
                },
                type: file.type,
                megapixels: ((img.width * img.height) / 1000000).toFixed(2),
                aspectRatio: (img.width / img.height).toFixed(2),
                needsOptimization: this.needsOptimization(img, file)
            };
        } catch (error) {
            throw new Error(`Error analizando imagen: ${error.message}`);
        }
    }

    // Determinar si la imagen necesita optimización
    needsOptimization(img, file) {
        const { maxWidth, maxHeight } = this.settings;
        const sizeThreshold = 500 * 1024; // 500KB

        return (
            img.width > maxWidth ||
            img.height > maxHeight ||
            file.size > sizeThreshold
        );
    }
}

// Instancia global del optimizador
const imageOptimizer = new ImageOptimizer();