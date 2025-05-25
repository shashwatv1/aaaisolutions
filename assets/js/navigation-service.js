/**
 * Navigation Service for AAAI Solutions Multi-Page Application
 * Handles page transitions, URL management, and navigation flow
 */
const NavigationService = {
    // Current page state
    currentPage: null,
    currentProject: null,
    navigationHistory: [],
    
    /**
     * Initialize the navigation service
     */
    init() {
        this.setupEventListeners();
        this.handleInitialLoad();
        
        window.AAAI_LOGGER?.info('NavigationService initialized');
        return this;
    },
    
    /**
     * Set up navigation event listeners
     */
    setupEventListeners() {
        // Handle browser back/forward buttons
        window.addEventListener('popstate', (event) => {
            this.handlePopState(event);
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.handlePageVisible();
            }
        });
        
        // Handle beforeunload for cleanup
        window.addEventListener('beforeunload', (event) => {
            this.handleBeforeUnload(event);
        });
    },
    
    /**
     * Handle initial page load and routing
     */
    handleInitialLoad() {
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        
        // Determine current page based on URL
        if (currentPath.includes('login.html') || currentPath.endsWith('login')) {
            this.currentPage = 'login';
        } else if (currentPath.includes('projects.html') || currentPath.endsWith('projects')) {
            this.currentPage = 'projects';
        } else if (currentPath.includes('chat.html') || currentPath.endsWith('chat')) {
            this.currentPage = 'chat';
            // Extract project ID from URL params
            const urlParams = new URLSearchParams(currentSearch);
            this.currentProject = urlParams.get('project');
        } else {
            // Default routing logic
            this.handleDefaultRouting();
        }
        
        window.AAAI_LOGGER?.info('Initial page determined:', {
            page: this.currentPage,
            project: this.currentProject,
            path: currentPath
        });
    },
    
    /**
     * Handle default routing when page is not explicitly determined
     */
    handleDefaultRouting() {
        // Check authentication status
        if (typeof AuthService !== 'undefined' && AuthService.isAuthenticated()) {
            // User is authenticated, redirect to projects
            this.goToProjects();
        } else {
            // User is not authenticated, redirect to login
            this.goToLogin();
        }
    },
    
    /**
     * Navigate to login page
     */
    goToLogin(reason = null) {
        const url = 'login.html';
        
        if (reason) {
            window.AAAI_LOGGER?.info(`Redirecting to login: ${reason}`);
        }
        
        this.navigateToPage(url, 'login', null, {
            reason: reason
        });
    },
    
    /**
     * Navigate to projects page
     */
    goToProjects() {
        const url = 'projects.html';
        
        this.navigateToPage(url, 'projects', null);
    },
    
    /**
     * Navigate to chat page for a specific project
     */
    goToChat(projectId, projectName = null) {
        if (!projectId) {
            window.AAAI_LOGGER?.error('Project ID is required for chat navigation');
            return false;
        }
        
        const url = `chat.html?project=${encodeURIComponent(projectId)}`;
        
        this.navigateToPage(url, 'chat', projectId, {
            projectName: projectName
        });
    },
    
    /**
     * Navigate to a specific page
     */
    navigateToPage(url, pageName, projectId = null, data = null) {
        try {
            // Update internal state
            this.addToHistory(this.currentPage, this.currentProject);
            this.currentPage = pageName;
            this.currentProject = projectId;
            
            // Update browser URL
            if (window.location.href !== url) {
                window.location.href = url;
            }
            
            window.AAAI_LOGGER?.info('Navigation completed:', {
                page: pageName,
                project: projectId,
                url: url,
                data: data
            });
            
            return true;
        } catch (error) {
            window.AAAI_LOGGER?.error('Navigation error:', error);
            return false;
        }
    },
    
    /**
     * Go back to previous page
     */
    goBack() {
        if (this.navigationHistory.length > 0) {
            const previousState = this.navigationHistory.pop();
            
            if (previousState.page === 'login') {
                this.goToLogin();
            } else if (previousState.page === 'projects') {
                this.goToProjects();
            } else if (previousState.page === 'chat' && previousState.project) {
                this.goToChat(previousState.project);
            } else {
                // Fallback to browser back
                window.history.back();
            }
        } else {
            // No history, go to default page
            if (typeof AuthService !== 'undefined' && AuthService.isAuthenticated()) {
                this.goToProjects();
            } else {
                this.goToLogin();
            }
        }
    },
    
    /**
     * Add current state to navigation history
     */
    addToHistory(page, project) {
        if (page) {
            this.navigationHistory.push({
                page: page,
                project: project,
                timestamp: Date.now()
            });
            
            // Limit history size
            if (this.navigationHistory.length > 10) {
                this.navigationHistory.shift();
            }
        }
    },
    
    /**
     * Handle browser popstate events
     */
    handlePopState(event) {
        window.AAAI_LOGGER?.info('Handling popstate event:', event.state);
        
        // Let the browser handle the navigation
        // The page will reload and handleInitialLoad will determine the correct state
        setTimeout(() => {
            this.handleInitialLoad();
        }, 100);
    },
    
    /**
     * Handle page becoming visible
     */
    handlePageVisible() {
        // Validate current authentication state
        if (typeof AuthService !== 'undefined') {
            if (this.currentPage !== 'login' && !AuthService.isAuthenticated()) {
                this.goToLogin('Session expired');
            } else if (this.currentPage === 'login' && AuthService.isAuthenticated()) {
                this.goToProjects();
            }
        }
        
        // Refresh any real-time connections
        if (this.currentPage === 'chat' && typeof ChatService !== 'undefined') {
            if (!ChatService.isConnected && AuthService.isAuthenticated()) {
                ChatService.connect().catch(err => {
                    window.AAAI_LOGGER?.error('Failed to reconnect chat service:', err);
                });
            }
        }
    },
    
    /**
     * Handle before page unload
     */
    handleBeforeUnload(event) {
        // Clean up any pending operations
        if (typeof ChatService !== 'undefined' && ChatService.isConnected) {
            // Flush any pending messages
            try {
                ChatService._processBatch();
            } catch (error) {
                window.AAAI_LOGGER?.debug('Error flushing chat messages on unload:', error);
            }
        }
        
        // Save any pending data
        if (typeof AuthService !== 'undefined' && AuthService.isAuthenticated()) {
            try {
                // Update user activity
                AuthService.updateActivity().catch(() => {
                    // Ignore errors during unload
                });
            } catch (error) {
                window.AAAI_LOGGER?.debug('Error updating activity on unload:', error);
            }
        }
    },
    
    /**
     * Check if navigation is allowed
     */
    canNavigateTo(pageName, projectId = null) {
        // Check authentication requirements
        if (pageName !== 'login') {
            if (typeof AuthService === 'undefined' || !AuthService.isAuthenticated()) {
                return {
                    allowed: false,
                    reason: 'Authentication required'
                };
            }
        }
        
        // Check project-specific requirements
        if (pageName === 'chat') {
            if (!projectId) {
                return {
                    allowed: false,
                    reason: 'Project ID required for chat'
                };
            }
        }
        
        return {
            allowed: true,
            reason: null
        };
    },
    
    /**
     * Get current navigation state
     */
    getCurrentState() {
        return {
            page: this.currentPage,
            project: this.currentProject,
            history: this.navigationHistory.slice(-3), // Last 3 entries
            canGoBack: this.navigationHistory.length > 0,
            authenticated: typeof AuthService !== 'undefined' ? AuthService.isAuthenticated() : false
        };
    },
    
    /**
     * Handle authentication state changes
     */
    onAuthenticationChange(isAuthenticated) {
        window.AAAI_LOGGER?.info('Authentication state changed:', isAuthenticated);
        
        if (!isAuthenticated && this.currentPage !== 'login') {
            // User logged out, redirect to login
            this.goToLogin('Logged out');
        } else if (isAuthenticated && this.currentPage === 'login') {
            // User logged in, redirect to projects
            this.goToProjects();
        }
    },
    
    /**
     * Handle project selection
     */
    onProjectSelected(projectId, projectName = null) {
        if (this.currentPage === 'projects') {
            this.goToChat(projectId, projectName);
        }
    },
    
    /**
     * Handle project creation
     */
    onProjectCreated(projectId, projectName = null) {
        // Navigate to the new project's chat
        this.goToChat(projectId, projectName);
    },
    
    /**
     * Show navigation error
     */
    showNavigationError(message, action = null) {
        // Simple alert for now - could be enhanced with a proper notification system
        alert(`Navigation Error: ${message}`);
        
        if (action) {
            action();
        } else {
            // Default action: go to safe page
            if (typeof AuthService !== 'undefined' && AuthService.isAuthenticated()) {
                this.goToProjects();
            } else {
                this.goToLogin('Navigation error');
            }
        }
    },
    
    /**
     * Get page-specific URL parameters
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
     * Update URL parameters without navigation
     */
    updateUrlParams(params, replaceState = true) {
        const url = new URL(window.location);
        
        Object.keys(params).forEach(key => {
            if (params[key] !== null && params[key] !== undefined) {
                url.searchParams.set(key, params[key]);
            } else {
                url.searchParams.delete(key);
            }
        });
        
        if (replaceState) {
            window.history.replaceState(null, '', url);
        } else {
            window.history.pushState(null, '', url);
        }
    },
    
    /**
     * Setup navigation links
     */
    setupNavigationLinks() {
        // Add click handlers to navigation elements
        document.addEventListener('click', (event) => {
            const target = event.target;
            
            // Handle navigation buttons
            if (target.hasAttribute('data-nav-to')) {
                event.preventDefault();
                const destination = target.getAttribute('data-nav-to');
                const projectId = target.getAttribute('data-project-id');
                
                this.handleNavigationClick(destination, projectId);
            }
        });
    },
    
    /**
     * Handle navigation link clicks
     */
    handleNavigationClick(destination, projectId = null) {
        const canNavigate = this.canNavigateTo(destination, projectId);
        
        if (!canNavigate.allowed) {
            this.showNavigationError(canNavigate.reason);
            return;
        }
        
        switch (destination) {
            case 'login':
                this.goToLogin();
                break;
            case 'projects':
                this.goToProjects();
                break;
            case 'chat':
                if (projectId) {
                    this.goToChat(projectId);
                } else {
                    this.showNavigationError('Project ID required for chat navigation');
                }
                break;
            case 'back':
                this.goBack();
                break;
            default:
                this.showNavigationError(`Unknown navigation destination: ${destination}`);
                break;
        }
    }
};

// Auto-initialize if not in a module environment
if (typeof module === 'undefined') {
    // Make available globally
    window.NavigationService = NavigationService;
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            NavigationService.init();
        });
    } else {
        NavigationService.init();
    }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationService;
}