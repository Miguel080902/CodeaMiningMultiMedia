// GitHub API para gestión de archivos
class GitHubAPI {
    constructor() {
        this.baseUrl = 'https://api.github.com';
        this.repo = 'Miguel080902/CodeaMiningMultiMedia';
        this.branch = 'master';
    }

    // Obtener archivo del repositorio
    async getFile(path) {
        try {
            const response = await fetch(`${this.baseUrl}/repos/${this.repo}/contents/${path}?ref=${this.branch}`, {
                headers: auth.getHeaders()
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            // Decodificar contenido base64
            const content = atob(data.content);
            
            return {
                content: content,
                sha: data.sha,
                size: data.size,
                path: data.path
            };
        } catch (error) {
            console.error(`Error obteniendo archivo ${path}:`, error);
            throw error;
        }
    }

    // Actualizar archivo en el repositorio
    async updateFile(path, content, message, sha = null) {
        try {
            // Si no tenemos el SHA, obtenemos el archivo actual
            if (!sha) {
                try {
                    const currentFile = await this.getFile(path);
                    sha = currentFile.sha;
                } catch (error) {
                    // Si el archivo no existe, sha será null
                    sha = null;
                }
            }

            const body = {
                message: message,
                content: btoa(content), // Codificar a base64
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(`${this.baseUrl}/repos/${this.repo}/contents/${path}`, {
                method: 'PUT',
                headers: auth.getHeaders(),
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error ${response.status}: ${errorData.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error actualizando archivo ${path}:`, error);
            throw error;
        }
    }

    // Subir imagen al repositorio
    async uploadImage(file, folder, filename) {
        try {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                
                reader.onload = async () => {
                    try {
                        // Convertir a base64
                        const base64Content = reader.result.split(',')[1];
                        const path = `images/${folder}/${filename}`;
                        
                        const response = await fetch(`${this.baseUrl}/repos/${this.repo}/contents/${path}`, {
                            method: 'PUT',
                            headers: auth.getHeaders(),
                            body: JSON.stringify({
                                message: `Add image: ${filename}`,
                                content: base64Content,
                                branch: this.branch
                            })
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(`Error ${response.status}: ${errorData.message || response.statusText}`);
                        }

                        const result = await response.json();
                        resolve({
                            path: path,
                            url: `https://raw.githubusercontent.com/${this.repo}/${this.branch}/${path}`,
                            sha: result.content.sha
                        });
                    } catch (error) {
                        reject(error);
                    }
                };

                reader.onerror = () => reject(new Error('Error leyendo el archivo'));
                reader.readAsDataURL(file);
            });
        } catch (error) {
            console.error('Error subiendo imagen:', error);
            throw error;
        }
    }

    // Eliminar archivo del repositorio
    async deleteFile(path, message) {
        try {
            // Obtener SHA del archivo actual
            const currentFile = await this.getFile(path);
            
            const response = await fetch(`${this.baseUrl}/repos/${this.repo}/contents/${path}`, {
                method: 'DELETE',
                headers: auth.getHeaders(),
                body: JSON.stringify({
                    message: message,
                    sha: currentFile.sha,
                    branch: this.branch
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error ${response.status}: ${errorData.message || response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error eliminando archivo ${path}:`, error);
            throw error;
        }
    }

    // Listar archivos en un directorio
    async listFiles(path = '') {
        try {
            const response = await fetch(`${this.baseUrl}/repos/${this.repo}/contents/${path}?ref=${this.branch}`, {
                headers: auth.getHeaders()
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error listando archivos en ${path}:`, error);
            throw error;
        }
    }

    // Obtener información del repositorio
    async getRepoInfo() {
        try {
            const response = await fetch(`${this.baseUrl}/repos/${this.repo}`, {
                headers: auth.getHeaders()
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error obteniendo info del repositorio:', error);
            throw error;
        }
    }

    // Crear directorio (mediante archivo .gitkeep)
    async createDirectory(path) {
        try {
            const gitkeepPath = `${path}/.gitkeep`;
            await this.updateFile(gitkeepPath, '', `Create directory: ${path}`);
            return true;
        } catch (error) {
            console.error(`Error creando directorio ${path}:`, error);
            throw error;
        }
    }

    // Validar que un archivo existe
    async fileExists(path) {
        try {
            await this.getFile(path);
            return true;
        } catch (error) {
            return false;
        }
    }

    // Obtener último commit del archivo
    async getFileCommits(path, limit = 1) {
        try {
            const response = await fetch(`${this.baseUrl}/repos/${this.repo}/commits?path=${path}&per_page=${limit}`, {
                headers: auth.getHeaders()
            });

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error(`Error obteniendo commits de ${path}:`, error);
            throw error;
        }
    }

    // Generar nombre único para archivo
    generateUniqueFilename(originalName, category) {
        const timestamp = Date.now();
        const extension = originalName.split('.').pop();
        const baseName = originalName.split('.')[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 30);
        
        return `${category}-${baseName}-${timestamp}.${extension}`;
    }

    // Validar formato de imagen
    isValidImageFormat(file) {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        return validTypes.includes(file.type);
    }

    // Validar tamaño de archivo
    isValidFileSize(file, maxSizeMB = 5) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        return file.size <= maxSizeBytes;
    }
}

// Instancia global de la API
const githubAPI = new GitHubAPI();