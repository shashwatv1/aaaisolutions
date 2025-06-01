/**
 * Unified Navigation Manager for AAAI Solutions
 * Handles seamless navigation with proper context management
 */
const NavigationManager = {
    // Core state
    authService: null,
    projectService: null,
    isInitialized: false,
    
    // Navigation state
    currentPage: null,
    currentProject: null,
    navigationHistory: [],
    breadcrumbs: [],
    
    // Configuration
    options: {
        enableTransitions: true,
        enableDeepLinking: true,
        enableStatePeristence: true,
        transitionDuration: 300,
        debug: false
    },
    
    // Page definitions
    pages: {
        login: {
            path: 'login.html',
            title: 'Login - AAAI Solutions',
            requiresAuth: false,
            requiresProject: false
        },
        project: {
            path: 'project.html',
            title: 'My Projects - AAAI Solutions',
            requiresAuth: true,
            requiresProject: false
        },
        chat: {
            path: 'chat.html',
            title: 'AI Chat - AAAI Solutions',
            requiresAuth: true,
            requiresProject: true
        }
    },
    
    // Event listeners
    navigationListeners: [],
    stateChangeListeners: [],
    
    /**
     * Initialize the navigation manager
     */
    init(authService, projectService = null, options = {}) {
        if (this.isInitialized) {
            console.log('🧭 NavigationManager already initialized');
            return this;
        }
        
        if (!authService) {
            throw new Error('AuthService is required for NavigationManager');
        }
        
        this.authService = authService;
        this.projectService = projectService || window.ProjectService;
        this.options = { ...this.options, ...options };
        
        // Set debug mode
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Initialize
        this._setupEventListeners();
        this._initializeCurrentPage();
        this._setupStateManagement();
        
        if (this.options.enableDeepLinking) {
            this._setupDeepLinking();
        }
        
        this.isInitialized = true;
        
        this._log('NavigationManager initialized', {
            currentPage: this.currentPage,
            deepLinking: this.options.enableDeepLinking,
            statePeristence: this.options.enableStatePeristence
        });
        
        return this;
    },
    
    /**
     * Navigate to login page with proper context
     */
    async goToLogin(reason = null, returnTo = null) {
        try {
            const state = {};
            
            if (reason) {
                state.reason = reason;
            }
            
            if (returnTo) {
                state.returnTo = returnTo;
                state.returnParams = this.getPageParams();
            } else if (this.currentPage && this.currentPage !== 'login') {
                state.returnTo = this.currentPage;
                state.returnParams = this.getPageParams();
            }
            
            return this._navigateToPage('login', {}, state, true);
            
        } catch (error) {
            this._error('Failed to navigate to login:', error);
            window.location.href = 'login.html';
        }
    },
    
    /**
     * Navigate to projects page
     */
    async goToProject() {
        try {
            this._requireAuth();
            return this._navigateToPage('project');
            
        } catch (error) {
            this._error('Failed to navigate to projects:', error);
            return this.goToLogin('Authentication required');
        }
    },
    
    /**
     * Navigate to chat with project context - MAIN INTEGRATION POINT
     */
    async goToChat(projectId, projectName = null, options = {}) {
        try {
            this._requireAuth();
            
            if (!projectId) {
                throw new Error('Project ID is required for chat navigation');
            }
            
            this._log('Navigating to chat with project context', { projectId, projectName });
            
            // Switch to project context first
            if (this.projectService) {
                const contextResult = await this.projectService.switchToProject(projectId, projectName);
                if (!contextResult.success) {
                    throw new Error('Failed to switch project context');
                }
                
                // Use the chat_id from the context switch
                projectId = contextResult.chat_id;
                projectName = contextResult.project.name;
                
                this._log('Project context switched successfully', {
                    chatId: projectId,
                    projectName: projectName
                });
            }
            
            // Build navigation parameters
            const params = { 
                project: projectId,
                ...options.params 
            };
            
            if (projectName) {
                params.project_name = encodeURIComponent(projectName);
            }
            
            const state = { 
                projectName: projectName,
                chatId: projectId,
                ...options.state 
            };
            
            // Navigate to chat page
            return this._navigateToPage('chat', params, state, options.replace);
            
        } catch (error) {
            this._error('Failed to navigate to chat:', error);
            throw error;
        }
    },
    
    /**
     * Create new project and navigate to it - INTEGRATION POINT
     */
    async createProjectAndNavigate(projectData) {
        try {
            this._requireAuth();
            
            if (!this.projectService) {
                throw new Error('ProjectService not available');
            }
            
            this._log('Creating new project and navigating', projectData);
            
            // Create project
            const result = await this.projectService.createProject(projectData);
            
            if (result.success) {
                this._log('Project created successfully, navigating to chat', {
                    projectId: result.project.id,
                    chatId: result.chat_id
                });
                
                // Navigate to the new project's chat after a brief delay
                setTimeout(() => {
                    this.goToChat(result.chat_id, result.project.name);
                }, 1000);
                
                return result;
            } else {
                throw new Error('Project creation failed');
            }
            
        } catch (error) {
            this._error('Failed to create project and navigate:', error);
            throw error;
        }
    },
    
    /**
     * Open existing project - INTEGRATION POINT
     */
    async openProject(projectId, projectName = null) {
        try {
            this._requireAuth();
            
            if (!projectId) {
                throw new Error('Project ID is required');
            }
            
            this._log('Opening existing project', { projectId, projectName });
            
            // Navigate to chat with project context
            return this.goToChat(projectId, projectName);
            
        } catch (error) {
            this._error('Failed to open project:', error);
            throw error;
        }
    },
    
    /**
     * Handle browser back/forward navigation
     */
    async goBack() {
        if (this.navigationHistory.length === 0) {
            // No history, go to appropriate default page
            if (this.authService.isAuthenticated()) {
                return this.goToProject();
            } else {
                return this.goToLogin();
            }
        }
        
        const previous = this.navigationHistory.pop();
        return this._navigateToPage(previous.page, previous.params, previous.state, true);
    },
    
    /**
     * Reload current page with fresh data
     */
    async reload(forceRefresh = true) {
        if (!this.currentPage) {
            return false;
        }
        
        const currentParams = this.getPageParams();
        const currentState = this._getStoredPageState();
        
        return this._navigateToPage(this.currentPage, currentParams, currentState, true);
    },
    
    /**
     * Get current page parameters from URL
     */
    getPageParams() {
        const urlParams = new URLSearchParams(window.location.search);
        const params = {};
        
        for (const [key, value] of urlParams.entries()) {
            params[key] = value;
        }
        
        return params;
    },
    
    /**
     * Update current page parameters
     */
    updatePageParams(params, replace = true) {
        if (!this.currentPage) return;
        
        const currentParams = this.getPageParams();
        const newParams = { ...currentParams, ...params };
        
        // Remove null/undefined params
        Object.keys(newParams).forEach(key => {
            if (newParams[key] == null) {
                delete newParams[key];
            }
        });
        
        const page = this.pages[this.currentPage];
        const url = this._buildPageUrl(page.path, newParams);
        
        const historyState = { 
            page: this.currentPage, 
            params: newParams, 
            state: this._getStoredPageState() 
        };
        
        if (replace) {
            window.history.replaceState(historyState, document.title, url);
        } else {
            window.history.pushState(historyState, document.title, url);
        }
        
        this._log('Page parameters updated', newParams);
    },
    
    /**
     * Check if navigation is allowed to a specific page
     */
    canNavigateTo(pageName, params = {}) {
        if (!this.pages[pageName]) {
            return { allowed: false, reason: 'Page not found' };
        }
        
        const page = this.pages[pageName];
        
        // Check authentication
        if (page.requiresAuth && !this.authService.isAuthenticated()) {
            return { allowed: false, reason: 'Authentication required' };
        }
        
        // Check project requirements
        if (page.requiresProject && !params.project) {
            return { allowed: false, reason: 'Project context required' };
        }
        
        return { allowed: true, reason: null };
    },
    
    /**
     * Get current navigation state
     */
    getNavigationState() {
        return {
            currentPage: this.currentPage,
            currentProject: this.currentProject,
            params: this.getPageParams(),
            breadcrumbs: this.getBreadcrumbs(),
            canGoBack: this.navigationHistory.length > 0,
            authenticated: this.authService.isAuthenticated(),
            projectContext: this.projectService ? this.projectService.getContext() : null
        };
    },
    
    /**
     * Get navigation breadcrumbs
     */
    getBreadcrumbs() {
        return [...this.breadcrumbs];
    },
    
    /**
     * Event listeners
     */
    onNavigation(callback) {
        if (typeof callback === 'function') {
            this.navigationListeners.push(callback);
        }
    },
    
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this.stateChangeListeners.push(callback);
        }
    },
    
    removeListener(type, callback) {
        if (type === 'navigation') {
            const index = this.navigationListeners.indexOf(callback);
            if (index > -1) this.navigationListeners.splice(index, 1);
        } else if (type === 'stateChange') {
            const index = this.stateChangeListeners.indexOf(callback);
            if (index > -1) this.stateChangeListeners.splice(index, 1);
        }
    },
    
    // Private methods
    
    /**
     * Core navigation method - handles all page transitions
     */
    async _navigateToPage(pageName, params = {}, state = {}, replace = false) {
        try {
            // Validate navigation
            const validation = this.canNavigateTo(pageName, params);
            if (!validation.allowed) {
                if (validation.reason === 'Authentication required') {
                    return this.goToLogin(validation.reason);
                }
                throw new Error(validation.reason);
            }
            
            const page = this.pages[pageName];
            
            // Store current page state if not replacing
            if (!replace && this.currentPage && this.currentPage !== pageName) {
                this._addToHistory(this.currentPage, this.getPageParams(), this._getStoredPageState());
            }
            
            // Build URL and update browser history
            const url = this._buildPageUrl(page.path, params);
            const historyState = { page: pageName, params, state };
            
            if (replace) {
                window.history.replaceState(historyState, page.title, url);
            } else {
                window.history.pushState(historyState, page.title, url);
            }
            
            // Update internal state
            this.currentPage = pageName;
            this.currentProject = params.project || null;
            document.title = this._buildPageTitle(page.title, params);
            
            // Update breadcrumbs
            this._updateBreadcrumbs(pageName, params);
            
            // Store page state
            this._storePageState(pageName, { params, state });
            
            // Perform actual navigation
            if (this.options.enableTransitions) {
                await this._performTransition(url);
            } else {
                window.location.href = url;
            }
            
            // Notify listeners
            this._notifyNavigationListeners('navigate', {
                to: pageName,
                params: params,
                state: state
            });
            
            this._log('Navigation completed', { page: pageName, params });
            
            return true;
            
        } catch (error) {
            this._error('Navigation failed:', error);
            throw error;
        }
    },
    
    /**
     * Setup event listeners
     */
    _setupEventListeners() {
        // Browser back/forward
        window.addEventListener('popstate', (event) => {
            this._handlePopState(event);
        });
        
        // Page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this._handlePageVisible();
            }
        });
        
        // Before unload cleanup
        window.addEventListener('beforeunload', () => {
            this._saveNavigationState();
        });
    },
    
    
    /**
     * Initialize current page from URL
     */
    _initializeCurrentPage() {
        const currentPath = window.location.pathname;
        
        // Determine current page from path
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
        
        // Validate current page
        if (!this.currentPage) {
            this.currentPage = this.authService.isAuthenticated() ? 'project' : 'login';
        }
        
        // Update breadcrumbs
        const params = this.getPageParams();
        this._updateBreadcrumbs(this.currentPage, params);
        
        this._log('Current page initialized', {
            page: this.currentPage,
            project: this.currentProject,
            params: params
        });
    },
    
    /**
     * Setup state management
     */
    _setupStateManagement() {
        if (!this.options.enableStatePeristence) return;
        
        // Restore navigation state from sessionStorage
        try {
            const savedState = sessionStorage.getItem('aaai_navigation_state');
            if (savedState) {
                const state = JSON.parse(savedState);
                
                if (state.navigationHistory && Array.isArray(state.navigationHistory)) {
                    // Restore recent history (with expiry check)
                    const now = Date.now();
                    this.navigationHistory = state.navigationHistory.filter(entry => 
                        entry.timestamp && (now - entry.timestamp) < 3600000 // 1 hour
                    );
                }
            }
        } catch (error) {
            this._error('Failed to restore navigation state:', error);
        }
        
        // Auto-save state periodically
        setInterval(() => {
            this._saveNavigationState();
        }, 30000); // Every 30 seconds
    },
    
    /**
     * Setup deep linking
     */
    _setupDeepLinking() {
        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-nav-to]');
            if (!target) return;
            
            event.preventDefault();
            
            const pageName = target.getAttribute('data-nav-to');
            const projectId = target.getAttribute('data-project-id');
            const projectName = target.getAttribute('data-project-name');
            const params = target.getAttribute('data-nav-params');
            
            let navigationParams = {};
            if (params) {
                try {
                    navigationParams = JSON.parse(params);
                } catch (error) {
                    this._error('Invalid navigation params:', params);
                }
            }
            
            if (projectId) {
                navigationParams.project = projectId;
                if (projectName) {
                    navigationParams.project_name = projectName;
                }
            }
            
            // Use appropriate navigation method
            if (pageName === 'chat' && projectId) {
                this.goToChat(projectId, projectName);
            } else if (pageName === 'project') {
                this.goToProject();
            } else if (pageName === 'login') {
                this.goToLogin();
            } else {
                this._navigateToPage(pageName, navigationParams);
            }
        });
    },
    
    /**
     * Handle browser popstate
     */
    _handlePopState(event) {
        if (event.state && event.state.page) {
            this.currentPage = event.state.page;
            this.currentProject = event.state.params?.project || null;
            
            this._notifyStateChangeListeners('popstate', event.state);
            this._log('Popstate handled', event.state);
        } else {
            // Fallback to URL-based detection
            this._initializeCurrentPage();
        }
    },
    
    /**
     * Handle page visibility change
     */
    _handlePageVisible() {
        // Validate authentication state
        if (this.currentPage !== 'login' && !this.authService.isAuthenticated()) {
            this.goToLogin('Session expired');
        }
    },
    
    /**
     * Build page URL with parameters
     */
    _buildPageUrl(basePath, params) {
        const url = new URL(basePath, window.location.origin);
        
        Object.keys(params).forEach(key => {
            if (params[key] != null) {
                url.searchParams.set(key, params[key]);
            }
        });
        
        return url.href;
    },
    
    /**
     * Build page title
     */
    _buildPageTitle(baseTitle, params) {
        if (params.project && this.projectService) {
            const context = this.projectService.getContext();
            if (context.project_name) {
                return `${context.project_name} - AAAI Solutions`;
            }
        }
        
        return baseTitle;
    },
    
    /**
     * Update breadcrumbs
     */
    _updateBreadcrumbs(pageName, params) {
        this.breadcrumbs = [];
        
        if (pageName === 'project') {
            this.breadcrumbs.push({ name: 'Projects', page: 'project' });
        } else if (pageName === 'chat') {
            this.breadcrumbs.push({ name: 'Projects', page: 'project' });
            
            if (params.project) {
                let projectName = 'Chat';
                if (this.projectService) {
                    const context = this.projectService.getContext();
                    if (context.project_name) {
                        projectName = context.project_name;
                    }
                }
                
                this.breadcrumbs.push({ 
                    name: projectName, 
                    page: 'chat', 
                    params: { project: params.project } 
                });
            }
        }
    },
    
    /**
     * Add to navigation history
     */
    _addToHistory(page, params, state) {
        this.navigationHistory.push({
            page,
            params: { ...params },
            state: { ...state },
            timestamp: Date.now()
        });
        
        // Limit history size
        if (this.navigationHistory.length > 20) {
            this.navigationHistory.shift();
        }
    },
    
    /**
     * Store page state
     */
    _storePageState(pageName, data) {
        try {
            sessionStorage.setItem(`aaai_page_state_${pageName}`, JSON.stringify({
                ...data,
                timestamp: Date.now()
            }));
        } catch (error) {
            this._error('Failed to store page state:', error);
        }
    },
    
    /**
     * Get stored page state
     */
    _getStoredPageState() {
        if (!this.currentPage) return {};
        
        try {
            const stored = sessionStorage.getItem(`aaai_page_state_${this.currentPage}`);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.timestamp && (Date.now() - data.timestamp) < 3600000) { // 1 hour
                    return data.state || {};
                }
            }
        } catch (error) {
            this._error('Failed to get stored page state:', error);
        }
        
        return {};
    },
    
    /**
     * Save navigation state to storage
     */
    _saveNavigationState() {
        if (!this.options.enableStatePeristence) return;
        
        try {
            const state = {
                navigationHistory: this.navigationHistory.slice(-10), // Last 10 entries
                timestamp: Date.now()
            };
            
            sessionStorage.setItem('aaai_navigation_state', JSON.stringify(state));
        } catch (error) {
            this._error('Failed to save navigation state:', error);
        }
    },
    
    /**
     * Perform page transition
     */
    async _performTransition(url) {
        // For now, just navigate directly
        // In the future, this could include smooth transitions
        window.location.href = url;
    },
    
    /**
     * Notify navigation listeners
     */
    _notifyNavigationListeners(eventType, data) {
        this.navigationListeners.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (error) {
                this._error('Error in navigation listener:', error);
            }
        });
    },
    
    /**
     * Notify state change listeners
     */
    _notifyStateChangeListeners(eventType, data) {
        this.stateChangeListeners.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (error) {
                this._error('Error in state change listener:', error);
            }
        });
    },

    /**
     * Check authentication for navigation operations
     */
    _requireAuth() {
        if (!this.authService || !this.authService.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        return true;
    },
    
    _log(...args) {
        if (this.options.debug) {
            console.log('[NavigationManager]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[NavigationManager]', ...args);
    }
};

// Export for global access
if (typeof window !== 'undefined') {
    window.NavigationManager = NavigationManager;
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
}