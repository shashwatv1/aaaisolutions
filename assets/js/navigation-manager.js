/**
 * Enhanced Navigation Manager for AAAI Solutions Multi-Page Application
 * Handles seamless page transitions, state persistence, and deep linking
 */
const NavigationManager = {
    // Initialize navigation manager
    init(authService, projectService, options = {}) {
        this.authService = authService;
        this.projectService = projectService;
        
        this.options = Object.assign({
            enableTransitions: true,
            enableDeepLinking: true,
            enableStatePeristence: true,
            transitionDuration: 300,
            enableAnalytics: false,
            debug: window.AAAI_CONFIG?.ENABLE_DEBUG || false
        }, options);
        
        // Navigation state
        this.currentPage = null;
        this.currentProject = null;
        this.navigationHistory = [];
        this.pageStates = new Map();
        this.breadcrumbs = [];
        
        // Page definitions
        this.pages = {
            login: {
                path: 'login.html',
                title: 'Login - AAAI Solutions',
                requiresAuth: false,
                component: 'LoginPage',
                preload: []
            },
            project: {
                path: 'project.html',
                title: 'My Project - AAAI Solutions',
                requiresAuth: true,
                component: 'ProjectPage',
                preload: ['project_details']
            },
            chat: {
                path: 'chat.html',
                title: 'AI Chat - AAAI Solutions',
                requiresAuth: true,
                component: 'ChatPage',
                preload: ['project_details', 'chat_history']
            }
        };
        
        // Event listeners
        this.navigationListeners = [];
        this.stateChangeListeners = [];
        
        // Performance tracking
        this.metrics = {
            totalNavigations: 0,
            averageLoadTime: 0,
            pageViews: {},
            errors: 0,
            lastNavigation: null
        };
        
        // Initialize
        this._setupEventListeners();
        this._initializeCurrentPage();
        this._setupStateManagement();
        
        if (this.options.enableDeepLinking) {
            this._setupDeepLinking();
        }
        
        window.AAAI_LOGGER?.info('NavigationManager initialized', {
            currentPage: this.currentPage,
            deepLinking: this.options.enableDeepLinking,
            statePeristence: this.options.enableStatePeristence
        });
        
        return this;
    },
    
    /**
     * Navigate to a specific page with enhanced features
     */
    async navigateTo(pageName, options = {}) {
        const startTime = Date.now();
        
        try {
            // Validate page
            if (!this.pages[pageName]) {
                throw new Error(`Unknown page: ${pageName}`);
            }
            
            const page = this.pages[pageName];
            const {
                params = {},
                state = {},
                replace = false,
                preload = true,
                transition = this.options.enableTransitions
            } = options;
            
            // Check authentication requirements
            if (page.requiresAuth && !this.authService.isAuthenticated()) {
                window.AAAI_LOGGER?.warn(`Page ${pageName} requires authentication, redirecting to login`);
                return this.navigateTo('login', { 
                    state: { returnTo: pageName, returnParams: params } 
                });
            }
            
            // Check if already on the same page with same params
            if (this.currentPage === pageName && this._compareParams(this.getPageParams(), params)) {
                window.AAAI_LOGGER?.debug(`Already on page ${pageName} with same params`);
                return true;
            }
            
            // Store current page state
            this._saveCurrentPageState();
            
            // Add to navigation history (unless replacing)
            if (!replace && this.currentPage) {
                this._addToHistory(this.currentPage, this.getPageParams(), this.getPageState());
            }
            
            // Preload data if requested
            if (preload && page.preload.length > 0) {
                await this._preloadPageData(pageName, params);
            }
            
            // Build URL
            const url = this._buildPageUrl(page.path, params);
            
            // Update page state
            this.currentPage = pageName;
            this.currentProject = params.project || null;
            
            // Update browser history
            if (replace) {
                window.history.replaceState({ page: pageName, params, state }, page.title, url);
            } else {
                window.history.pushState({ page: pageName, params, state }, page.title, url);
            }
            
            // Update document title
            document.title = this._buildPageTitle(page.title, params);
            
            // Store page state
            this.pageStates.set(pageName, { params, state, timestamp: Date.now() });
            
            // Update breadcrumbs
            this._updateBreadcrumbs(pageName, params);
            
            // Perform navigation
            if (transition) {
                await this._performTransition(url);
            } else {
                window.location.href = url;
            }
            
            // Track metrics
            const loadTime = Date.now() - startTime;
            this._trackNavigation(pageName, loadTime);
            
            // Notify listeners
            this._notifyNavigationListeners('navigate', {
                from: this.navigationHistory[this.navigationHistory.length - 1]?.page,
                to: pageName,
                params: params,
                state: state,
                loadTime: loadTime
            });
            
            window.AAAI_LOGGER?.info(`Navigated to ${pageName}`, {
                params,
                loadTime,
                preloaded: preload
            });
            
            return true;
            
        } catch (error) {
            this.metrics.errors++;
            window.AAAI_LOGGER?.error('Navigation error:', error);
            
            // Show user-friendly error
            this._showNavigationError(`Failed to navigate to ${pageName}: ${error.message}`);
            
            return false;
        }
    },
    
    /**
     * Navigate to login page
     */
    async goToLogin(reason = null, returnTo = null) {
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
        
        return this.navigateTo('login', { state, replace: true });
    },
    
    /**
     * Navigate to projects page
     */
    async goToProject(options = {}) {
        return this.navigateTo('project', options);
    },
    
    /**
     * Navigate to chat page for a specific project
     */
    async goToChat(projectId, projectName = null, options = {}) {
        if (!projectId) {
            throw new Error('Project ID is required for chat navigation');
        }
        
        const params = { project: projectId };
        const state = { projectName };
        
        return this.navigateTo('chat', {
            params,
            state,
            ...options
        });
    },
    
    /**
     * Go back to previous page
     */
    async goBack() {
        if (this.navigationHistory.length === 0) {
            // No history, go to default page
            if (this.authService.isAuthenticated()) {
                return this.goToProject();
            } else {
                return this.goToLogin();
            }
        }
        
        const previous = this.navigationHistory.pop();
        
        return this.navigateTo(previous.page, {
            params: previous.params,
            state: previous.state,
            replace: true
        });
    },
    
    /**
     * Reload current page with fresh data
     */
    async reload(forceRefresh = true) {
        if (!this.currentPage) return false;
        
        const currentParams = this.getPageParams();
        const currentState = this.getPageState();
        
        return this.navigateTo(this.currentPage, {
            params: currentParams,
            state: currentState,
            replace: true,
            preload: forceRefresh
        });
    },
    
    /**
     * Get current page parameters
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
     * Get current page state
     */
    getPageState() {
        if (!this.currentPage || !this.pageStates.has(this.currentPage)) {
            return {};
        }
        
        return this.pageStates.get(this.currentPage).state || {};
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
        
        if (replace) {
            window.history.replaceState(
                { page: this.currentPage, params: newParams, state: this.getPageState() },
                document.title,
                url
            );
        } else {
            window.history.pushState(
                { page: this.currentPage, params: newParams, state: this.getPageState() },
                document.title,
                url
            );
        }
        
        // Update stored state
        const pageState = this.pageStates.get(this.currentPage);
        if (pageState) {
            pageState.params = newParams;
        }
    },
    
    /**
     * Get navigation breadcrumbs
     */
    getBreadcrumbs() {
        return [...this.breadcrumbs];
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
        
        // Check specific page requirements
        if (pageName === 'chat' && !params.project) {
            return { allowed: false, reason: 'Project ID required for chat' };
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
            state: this.getPageState(),
            breadcrumbs: this.getBreadcrumbs(),
            canGoBack: this.navigationHistory.length > 0,
            history: this.navigationHistory.slice(-3), // Last 3 entries
            authenticated: this.authService.isAuthenticated(),
            metrics: this.getMetrics()
        };
    },
    
    /**
     * Add navigation listener
     */
    onNavigation(callback) {
        if (typeof callback === 'function') {
            this.navigationListeners.push(callback);
        }
    },
    
    /**
     * Add state change listener
     */
    onStateChange(callback) {
        if (typeof callback === 'function') {
            this.stateChangeListeners.push(callback);
        }
    },
    
    /**
     * Remove listener
     */
    removeListener(type, callback) {
        if (type === 'navigation') {
            const index = this.navigationListeners.indexOf(callback);
            if (index > -1) this.navigationListeners.splice(index, 1);
        } else if (type === 'stateChange') {
            const index = this.stateChangeListeners.indexOf(callback);
            if (index > -1) this.stateChangeListeners.splice(index, 1);
        }
    },
    
    /**
     * Get navigation metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.pageStates.size,
            historySize: this.navigationHistory.length
        };
    },
    
    /**
     * Clear navigation history and cache
     */
    clearHistory() {
        this.navigationHistory = [];
        this.pageStates.clear();
        this.breadcrumbs = [];
        
        window.AAAI_LOGGER?.info('Navigation history cleared');
    },
    
    // Private methods
    
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
            this._saveCurrentPageState();
        });
        
        // Handle authentication state changes
        if (this.authService) {
            this.authService.onAuthenticationChange = (isAuthenticated) => {
                this._handleAuthenticationChange(isAuthenticated);
            };
        }
    },
    
    /**
     * Initialize current page based on URL
     */
    _initializeCurrentPage() {
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        
        // Determine current page
        for (const [pageName, page] of Object.entries(this.pages)) {
            if (currentPath.includes(page.path.replace('.html', ''))) {
                this.currentPage = pageName;
                break;
            }
        }
        
        // Extract parameters
        if (this.currentPage === 'chat') {
            const urlParams = new URLSearchParams(currentSearch);
            this.currentProject = urlParams.get('project');
        }
        
        // Validate current page
        if (!this.currentPage) {
            this.currentPage = this.authService.isAuthenticated() ? 'project' : 'login';
        }
        
        // Store initial state
        const params = this.getPageParams();
        this.pageStates.set(this.currentPage, {
            params,
            state: {},
            timestamp: Date.now()
        });
        
        this._updateBreadcrumbs(this.currentPage, params);
    },
    
    /**
     * Setup state management
     */
    _setupStateManagement() {
        if (!this.options.enableStatePeristence) return;
        
        // Restore state from sessionStorage
        try {
            const savedState = sessionStorage.getItem('aaai_navigation_state');
            if (savedState) {
                const state = JSON.parse(savedState);
                
                if (state.pageStates) {
                    // Restore page states (with expiry check)
                    const now = Date.now();
                    for (const [page, pageState] of Object.entries(state.pageStates)) {
                        if (pageState.timestamp && (now - pageState.timestamp) < 3600000) { // 1 hour
                            this.pageStates.set(page, pageState);
                        }
                    }
                }
                
                if (state.metrics) {
                    Object.assign(this.metrics, state.metrics);
                }
            }
        } catch (error) {
            window.AAAI_LOGGER?.warn('Failed to restore navigation state:', error);
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
        // Add navigation data attributes to links
        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-nav-to]');
            if (!target) return;
            
            event.preventDefault();
            
            const pageName = target.getAttribute('data-nav-to');
            const projectId = target.getAttribute('data-project-id');
            const params = target.getAttribute('data-nav-params');
            
            let navigationParams = {};
            if (params) {
                try {
                    navigationParams = JSON.parse(params);
                } catch (error) {
                    window.AAAI_LOGGER?.warn('Invalid navigation params:', params);
                }
            }
            
            if (projectId) {
                navigationParams.project = projectId;
            }
            
            this.navigateTo(pageName, { params: navigationParams });
        });
    },
    
    /**
     * Handle browser popstate
     */
    _handlePopState(event) {
        if (event.state && event.state.page) {
            this.currentPage = event.state.page;
            this.currentProject = event.state.params?.project || null;
            
            // Notify listeners
            this._notifyStateChangeListeners('popstate', event.state);
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
        
        // Refresh current page data if needed
        if (this.currentPage && this.pages[this.currentPage].preload.length > 0) {
            this._preloadPageData(this.currentPage, this.getPageParams(), true);
        }
    },
    
    /**
     * Handle authentication state changes
     */
    _handleAuthenticationChange(isAuthenticated) {
        if (!isAuthenticated && this.currentPage !== 'login') {
            this.goToLogin('Authentication lost');
        } else if (isAuthenticated && this.currentPage === 'login') {
            const state = this.getPageState();
            if (state.returnTo) {
                this.navigateTo(state.returnTo, { 
                    params: state.returnParams || {},
                    replace: true 
                });
            } else {
                this.goToProject({ replace: true });
            }
        }
    },
    
    /**
     * Preload page data
     */
    async _preloadPageData(pageName, params, background = false) {
        const page = this.pages[pageName];
        if (!page.preload.length) return;
        
        try {
            const preloadPromises = [];
            
            for (const preloadType of page.preload) {
                switch (preloadType) {
                    case 'project':
                        if (this.projectService) {
                            preloadPromises.push(
                                this.projectService.getProjects({ limit: 20 })
                            );
                        }
                        break;
                        
                    case 'project_details':
                        if (this.projectService && params.project) {
                            preloadPromises.push(
                                this.projectService.getProject(params.project)
                            );
                        }
                        break;
                        
                    case 'chat_history':
                        // This would be handled by the chat service
                        break;
                }
            }
            
            await Promise.all(preloadPromises);
            
            if (!background) {
                window.AAAI_LOGGER?.debug(`Preloaded data for ${pageName}`, {
                    types: page.preload,
                    params
                });
            }
            
        } catch (error) {
            if (!background) {
                window.AAAI_LOGGER?.warn(`Preload failed for ${pageName}:`, error);
            }
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
            // Try to get project name from cache
            const project = this.projectService._getCachedProject(params.project);
            if (project) {
                return `${project.name} - AAAI Solutions`;
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
            this.breadcrumbs.push({ name: 'Project', page: 'project' });
        } else if (pageName === 'chat') {
            this.breadcrumbs.push({ name: 'Project', page: 'project' });
            
            if (params.project) {
                // Try to get project name
                let projectName = 'Project';
                if (this.projectService) {
                    const project = this.projectService._getCachedProject(params.project);
                    if (project) {
                        projectName = project.name;
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
     * Compare parameters
     */
    _compareParams(params1, params2) {
        const keys1 = Object.keys(params1);
        const keys2 = Object.keys(params2);
        
        if (keys1.length !== keys2.length) return false;
        
        return keys1.every(key => params1[key] === params2[key]);
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
        if (this.navigationHistory.length > 50) {
            this.navigationHistory.shift();
        }
    },
    
    /**
     * Save current page state
     */
    _saveCurrentPageState() {
        if (!this.currentPage) return;
        
        // This would be implemented by individual pages
        // Each page can define how to save its state
        const customSaveState = window[`save${this.currentPage}State`];
        if (typeof customSaveState === 'function') {
            try {
                const state = customSaveState();
                if (state) {
                    const pageState = this.pageStates.get(this.currentPage);
                    if (pageState) {
                        pageState.state = { ...pageState.state, ...state };
                    }
                }
            } catch (error) {
                window.AAAI_LOGGER?.warn(`Error saving ${this.currentPage} state:`, error);
            }
        }
    },
    
    /**
     * Save navigation state to storage
     */
    _saveNavigationState() {
        if (!this.options.enableStatePeristence) return;
        
        try {
            const state = {
                pageStates: Object.fromEntries(this.pageStates),
                metrics: this.metrics,
                timestamp: Date.now()
            };
            
            sessionStorage.setItem('aaai_navigation_state', JSON.stringify(state));
        } catch (error) {
            window.AAAI_LOGGER?.warn('Failed to save navigation state:', error);
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
     * Track navigation metrics
     */
    _trackNavigation(pageName, loadTime) {
        this.metrics.totalNavigations++;
        this.metrics.lastNavigation = Date.now();
        
        if (this.metrics.pageViews[pageName]) {
            this.metrics.pageViews[pageName]++;
        } else {
            this.metrics.pageViews[pageName] = 1;
        }
        
        // Update average load time
        const prevAvg = this.metrics.averageLoadTime;
        const count = this.metrics.totalNavigations;
        this.metrics.averageLoadTime = (prevAvg * (count - 1) + loadTime) / count;
    },
    
    /**
     * Show navigation error
     */
    _showNavigationError(message) {
        // Simple alert for now - could be enhanced with a toast notification
        console.error('Navigation Error:', message);
        
        // Try to recover to a safe page
        if (this.authService.isAuthenticated()) {
            this.goToProject({ replace: true });
        } else {
            this.goToLogin('Navigation error', this.currentPage);
        }
    },
    
    /**
     * Notify navigation listeners
     */
    _notifyNavigationListeners(eventType, data) {
        this.navigationListeners.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (error) {
                window.AAAI_LOGGER?.error('Error in navigation listener:', error);
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
                window.AAAI_LOGGER?.error('Error in state change listener:', error);
            }
        });
    }
};

// Auto-initialize when dependencies are available
if (typeof window !== 'undefined') {
    window.NavigationManager = NavigationManager;
    
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof AuthService !== 'undefined') {
            try {
                const projectService = typeof ProjectService !== 'undefined' ? ProjectService : null;
                NavigationManager.init(AuthService, projectService);
            } catch (error) {
                window.AAAI_LOGGER?.warn('Failed to auto-initialize NavigationManager:', error);
            }
        }
    });
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationManager;
}