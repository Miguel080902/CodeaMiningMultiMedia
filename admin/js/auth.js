// Sistema de Autenticación con GitHub
class Auth {
    constructor() {
        this.token = localStorage.getItem('github_token');
        this.user = null;
        this.repo = 'Miguel080902/CodeaMiningMultiMedia';
    }

    // Verificar si el usuario está autenticado
    isAuthenticated() {
        return !!this.token;
    }

    // Obtener token
    getToken() {
        return this.token;
    }

    // Validar token con GitHub API
    async validateToken(token) {
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) {
                throw new Error('Token inválido');
            }

            const userData = await response.json();
            
            // Verificar permisos del repositorio
            const repoResponse = await fetch(`https://api.github.com/repos/${this.repo}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!repoResponse.ok) {
                throw new Error('Sin acceso al repositorio');
            }

            const repoData = await repoResponse.json();
            
            // Verificar permisos de escritura
            if (!repoData.permissions || !repoData.permissions.push) {
                throw new Error('Sin permisos de escritura en el repositorio');
            }

            return {
                valid: true,
                user: userData,
                repo: repoData
            };
        } catch (error) {
            console.error('Error validando token:', error);
            return {
                valid: false,
                error: error.message
            };
        }
    }

    // Iniciar sesión
    async login(token) {
        const validation = await this.validateToken(token);
        
        if (validation.valid) {
            this.token = token;
            this.user = validation.user;
            localStorage.setItem('github_token', token);
            
            return {
                success: true,
                user: this.user
            };
        } else {
            return {
                success: false,
                error: validation.error
            };
        }
    }

    // Cerrar sesión
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('github_token');
    }

    // Obtener información del usuario
    async getUserInfo() {
        if (!this.token) return null;

        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                this.user = await response.json();
                return this.user;
            }
        } catch (error) {
            console.error('Error obteniendo info del usuario:', error);
        }

        return null;
    }

    // Verificar permisos específicos
    async checkPermissions() {
        if (!this.token) return false;

        try {
            const response = await fetch(`https://api.github.com/repos/${this.repo}`, {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (response.ok) {
                const repo = await response.json();
                return repo.permissions && repo.permissions.push;
            }
        } catch (error) {
            console.error('Error verificando permisos:', error);
        }

        return false;
    }

    // Obtener headers para las peticiones
    getHeaders() {
        return {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    }
}

// Instancia global de autenticación
const auth = new Auth();