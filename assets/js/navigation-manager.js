/**
 * High-Performance Navigation Manager for AAAI Solutions
 * Optimized for fast navigation with minimal overhead
 */
const NavigationManager = {
    // Core state - simplified
    authService: null,
    projectService: null,
    isInitialized: false,
    
    // Navigation state - minimal
    currentPage: null,
    currentProject: null,
    
    // Configuration - performance optimized
    options: {
        enableTransitions: false, // Disabled for performance
        enableDeepLinking: true,
        enableStatePeristence: false, // Disabled for performance
        debug: false
    },
    
    // Page definitions - simplified
    pages: {
        login: {
            path: 'login.html',
            requiresAuth: false
        },
        project: {
            path: 'project.html',
            requiresAuth: true
        },
        chat: {
            path: 'chat.html',
            requiresAuth: true,
            requiresProject: true
        }
    },
    
    // Event listeners - minimal
    navigationListeners: [],
    
    /**
     * Fast initialization
     */
    init(authService, projectService = null, options = {}) {
        if (this.isInitialized) {
            return this;
        }
        
        if (!authService) {
            throw new Error('AuthService required');
        }
        
        this.authService = authService;
        this.projectService = projectService || window.ProjectService;
        this.options = { ...this.options, ...options };
        
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Quick initialization
        this._initCurrentPageFast();
        
        if (this.options.enableDeepLinking) {
            this._setupFastDeepLinking();
        }
        
        this.isInitialized = true;
        
        this._log('NavigationManager initialized quickly');
        return this;
    },
    
    /**
     * Fast login navigation
     */
    async goToLogin(reason = null) {
        try {
            this._log('Fast navigation to login:', reason);
            window.location.href = 'login.html';
        } catch (error) {
            this._error('Login navigation failed:', error);
            window.location.href = 'login.html';
        }
    },
    
    /**
     * Fast project navigation
     */
    async goToProject() {
        try {
            this._requireAuth();
            this._log('Fast navigation to projects');
            window.location.href = 'project.html';
        } catch (error) {
            this._error('Project navigation failed:', error);
            return this.goToLogin('Authentication required');
        }
    },
    
    /**
     * Fast chat navigation with project context
     */
    async goToChat(projectId, projectName = null) {
        try {
            this._requireAuth();
            
            if (!projectId) {
                throw new Error('Project ID required for chat');
            }
            
            this._log('Fast navigation to chat:', { projectId, projectName });
            
            // Switch project context quickly
            if (this.projectService) {
                try {
                    const contextResult = await this.projectService.switchToProject(projectId, projectName);
                    if (contextResult.success) {
                        projectId = contextResult.chat_id;
                        projectName = contextResult.project.name;
                    }
                } catch (error) {
                    console.warn('Context switch failed, continuing with original ID:', error);
                }
            }
            
            // Build URL quickly
            const params = new URLSearchParams({ project: projectId });
            if (projectName) {
                params.set('project_name', encodeURIComponent(projectName));
            }
            
            window.location.href = `chat.html?${params}`;
            
        } catch (error) {
            this._error('Chat navigation failed:', error);
            throw error;
        }
    },
    
    /**
     * Fast project creation and navigation
     */
    async createProjectAndNavigate(projectData) {
        try {
            this._requireAuth();
            
            if (!this.projectService) {
                throw new Error('ProjectService not available');
            }
            
            this._log('Fast project creation and navigation:', projectData);
            
            const result = await this.projectService.createProject(projectData);
            
            if (result.success) {
                this._log('Project created, navigating to chat:', result.chat_id);
                
                // Navigate immediately
                setTimeout(() => {
                    this.goToChat(result.chat_id, result.project.name);
                }, 500); // Short delay for user feedback
                
                return result;
            } else {
                throw new Error('Project creation failed');
            }
            
        } catch (error) {
            this._error('Project creation and navigation failed:', error);
            throw error;
        }
    },
    
    /**
     * Fast project opening
     */
    async openProject(projectId, projectName = null) {
        try {
            this._requireAuth();
            
            if (!projectId) {
                throw new Error('Project ID required');
            }
            
            this._log('Fast project opening:', { projectId, projectName });
            
            return this.goToChat(projectId, projectName);
            
        } catch (error) {
            this._error('Project opening failed:', error);
            throw error;
        }
    },
    
    /**
     * Fast navigation validation
     */
    canNavigateTo(pageName, params = {}) {
        if (!this.pages[pageName]) {
            return { allowed: false, reason: 'Page not found' };
        }
        
        const page = this.pages[pageName];
        
        if (page.requiresAuth && !this.authService.isAuthenticated()) {
            return { allowed: false, reason: 'Authentication required' };
        }
        
        if (page.requiresProject && !params.project) {
            return { allowed: false, reason: 'Project context required' };
        }
        
        return { allowed: true };
    },
    
    /**
     * Fast navigation state
     */
    getNavigationState() {
        return {
            currentPage: this.currentPage,
            currentProject: this.currentProject,
            authenticated: this.authService.isAuthenticated(),
            projectContext: this.projectService ? this.projectService.getContext() : null
        };
    },
    
    onNavigation(callback) {
        if (typeof callback === 'function') {
            this.navigationListeners.push(callback);
        }
    },
    
    removeListener(callback) {
        const index = this.navigationListeners.indexOf(callback);
        if (index > -1) this.navigationListeners.splice(index, 1);
    },
    
    // Private methods - optimized for speed
    
    _requireAuth() {
        if (!this.authService || !this.authService.isAuthenticated()) {
            throw new Error('Authentication required');
        }
    },
    
    _initCurrentPageFast() {
        const currentPath = window.location.pathname;
        
        // Quick page detection
        for (const [pageName, page] of Object.entries(this.pages)) {
            if (currentPath.includes(page.path.replace('.html', ''))) {
                this.currentPage = pageName;
                break;
            }
        }
        
        // Extract project from URL if on chat page
        if (this.currentPage === 'chat') {
            const urlParams = new URLSearchParams(window.location.search);
            this.currentProject = urlParams.get('project');
        }
        
        // Default page if not found
        if (!this.currentPage) {
            this.currentPage = this.authService.isAuthenticated() ? 'project' : 'login';
        }
        
        this._log('Current page initialized:', this.currentPage);
    },
    
    _setupFastDeepLinking() {
        // Simple click handler for navigation links
        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-nav-to]');
            if (!target) return;
            
            event.preventDefault();
            
            const pageName = target.getAttribute('data-nav-to');
            const projectId = target.getAttribute('data-project-id');
            const projectName = target.getAttribute('data-project-name');
            
            // Fast navigation routing
            try {
                if (pageName === 'chat' && projectId) {
                    this.goToChat(projectId, projectName);
                } else if (pageName === 'project') {
                    this.goToProject();
                } else if (pageName === 'login') {
                    this.goToLogin();
                }
            } catch (error) {
                this._error('Deep link navigation failed:', error);
            }
        });
    },
    
    _notifyNavigationListeners(eventType, data) {
        // Non-blocking notifications
        setTimeout(() => {
            this.navigationListeners.forEach(callback => {
                try {
                    callback(eventType, data);
                } catch (error) {
                    // Ignore listener errors
                }
            });
        }, 0);
    },
    
    _log(...args) {
        if (this.options.debug) {
            console.log('[FastNav]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[FastNav]', ...args);
    }
};

if (typeof window !== 'undefined') {
    window.NavigationManager = NavigationManager;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
}