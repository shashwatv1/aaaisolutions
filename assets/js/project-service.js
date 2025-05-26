/**
 * Enhanced Project Management Service for AAAI Solutions
 * Handles project CRUD operations, real-time updates, and caching
 */
const ProjectService = {
    // Initialize the project service
    init(authService, options = {}) {
        if (!authService) {
            throw new Error('AuthService is required for ProjectService initialization');
        }
        
        this.authService = authService;
        this.options = Object.assign({
            cacheExpiry: 300000, // 5 minutes
            maxCacheSize: 1000,
            enableRealTimeUpdates: true,
            autoSync: true,
            syncInterval: 30000, // 30 seconds
            debug: window.AAAI_CONFIG?.ENABLE_DEBUG || false
        }, options);
        
        // Cache management
        this.projectCache = new Map();
        this.cacheTimestamps = new Map();
        this.searchCache = new Map();
        
        // Real-time updates
        this.updateListeners = [];
        this.syncTimer = null;
        
        // Performance tracking
        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            apiCalls: 0,
            lastSync: null,
            errors: 0
        };
        
        // Initialize
        this._setupAutoSync();
        this._setupCacheCleanup();
        
        window.AAAI_LOGGER?.info('ProjectService initialized', {
            cacheEnabled: true,
            realTimeUpdates: this.options.enableRealTimeUpdates,
            autoSync: this.options.autoSync
        });
        
        return this;
    },
    
    /**
     * Create a new project
     */
    async createProject(projectData) {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required to create project');
            }
            
            // Validate input
            this._validateProjectData(projectData);
            
            const result = await this.authService.executeFunction('create_project', {
                name: projectData.name,
                description: projectData.description || null,
                tags: projectData.tags || [],
                email: this.authService.getCurrentUser().email
            });
            
            if (result.status === 'success' && result.data.success) {
                const project = result.data.project;
                
                // Cache the new project
                this._cacheProject(project);
                
                // Clear list cache to force refresh
                this._clearListCache();
                
                // Notify listeners
                this._notifyUpdateListeners('project_created', project);
                
                this.stats.apiCalls++;
                
                window.AAAI_LOGGER?.info('Project created successfully', {
                    projectId: project.id,
                    name: project.name
                });
                
                return project;
            } else {
                throw new Error(result.data?.message || 'Failed to create project');
            }
            
        } catch (error) {
            this.stats.errors++;
            window.AAAI_LOGGER?.error('Error creating project:', error);
            throw new Error(`Failed to create project: ${error.message}`);
        }
    },
    
    /**
     * Get all projects for the current user with caching
     */
    async getProjects(options = {}) {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required to get projects');
            }
            
            const {
                limit = 20,
                offset = 0,
                search = '',
                tagFilter = [],
                forceRefresh = false
            } = options;
            
            // Generate cache key
            const cacheKey = this._generateCacheKey('list', { limit, offset, search, tagFilter });
            
            // Check cache first (unless force refresh)
            if (!forceRefresh) {
                const cached = this._getCachedData(cacheKey);
                if (cached) {
                    this.stats.cacheHits++;
                    window.AAAI_LOGGER?.debug('Projects retrieved from cache');
                    return cached;
                }
            }
            
            this.stats.cacheMisses++;
            
            const result = await this.authService.executeFunction('list_user_projects', {
                email: this.authService.getCurrentUser().email,
                limit: limit,
                offset: offset,
                search: search.trim(),
                tag_filter: tagFilter
            });
            
            if (result.status === 'success' && result.data.success) {
                const projectData = {
                    projects: result.data.projects,
                    total: result.data.total,
                    hasMore: result.data.has_more,
                    limit: limit,
                    offset: offset
                };
                
                // Cache individual projects
                result.data.projects.forEach(project => this._cacheProject(project));
                
                // Cache list result
                this._setCachedData(cacheKey, projectData);
                
                this.stats.apiCalls++;
                this.stats.lastSync = Date.now();
                
                window.AAAI_LOGGER?.info('Projects retrieved from API', {
                    count: result.data.projects.length,
                    total: result.data.total
                });
                
                return projectData;
            } else {
                throw new Error(result.data?.message || 'Failed to get projects');
            }
            
        } catch (error) {
            this.stats.errors++;
            window.AAAI_LOGGER?.error('Error getting projects:', error);
            throw new Error(`Failed to get projects: ${error.message}`);
        }
    },
    
    /**
     * Get a specific project by ID with caching
     */
    async getProject(projectId, forceRefresh = false) {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required to get project');
            }
            
            if (!projectId) {
                throw new Error('Project ID is required');
            }
            
            // Check cache first
            if (!forceRefresh) {
                const cached = this._getCachedProject(projectId);
                if (cached) {
                    this.stats.cacheHits++;
                    return cached;
                }
            }
            
            this.stats.cacheMisses++;
            
            const result = await this.authService.executeFunction('get_project_details', {
                project_id: projectId,
                email: this.authService.getCurrentUser().email
            });
            
            if (result.status === 'success' && result.data.success) {
                const project = result.data.project;
                
                // Cache the project
                this._cacheProject(project);
                
                this.stats.apiCalls++;
                
                window.AAAI_LOGGER?.info('Project details retrieved', {
                    projectId: project.id,
                    name: project.name
                });
                
                return project;
            } else {
                throw new Error(result.data?.message || 'Project not found');
            }
            
        } catch (error) {
            this.stats.errors++;
            window.AAAI_LOGGER?.error('Error getting project:', error);
            throw new Error(`Failed to get project: ${error.message}`);
        }
    },
    
    /**
     * Update a project
     */
    async updateProject(projectId, updateData) {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required to update project');
            }
            
            if (!projectId) {
                throw new Error('Project ID is required');
            }
            
            // Validate update data
            this._validateProjectData(updateData, false);
            
            const result = await this.authService.executeFunction('update_project', {
                project_id: projectId,
                name: updateData.name,
                description: updateData.description,
                tags: updateData.tags,
                email: this.authService.getCurrentUser().email
            });
            
            if (result.status === 'success' && result.data.success) {
                const project = result.data.project;
                
                // Update cache
                this._cacheProject(project);
                
                // Clear list cache to force refresh
                this._clearListCache();
                
                // Notify listeners
                this._notifyUpdateListeners('project_updated', project);
                
                this.stats.apiCalls++;
                
                window.AAAI_LOGGER?.info('Project updated successfully', {
                    projectId: project.id,
                    name: project.name
                });
                
                return project;
            } else {
                throw new Error(result.data?.message || 'Failed to update project');
            }
            
        } catch (error) {
            this.stats.errors++;
            window.AAAI_LOGGER?.error('Error updating project:', error);
            throw new Error(`Failed to update project: ${error.message}`);
        }
    },
    
    /**
     * Delete a project
     */
    async deleteProject(projectId) {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required to delete project');
            }
            
            if (!projectId) {
                throw new Error('Project ID is required');
            }
            
            const result = await this.authService.executeFunction('delete_project', {
                project_id: projectId,
                email: this.authService.getCurrentUser().email
            });
            
            if (result.status === 'success' && result.data.success) {
                // Remove from cache
                this._removeCachedProject(projectId);
                
                // Clear list cache to force refresh
                this._clearListCache();
                
                // Notify listeners
                this._notifyUpdateListeners('project_deleted', { id: projectId });
                
                this.stats.apiCalls++;
                
                window.AAAI_LOGGER?.info('Project deleted successfully', {
                    projectId: projectId
                });
                
                return true;
            } else {
                throw new Error(result.data?.message || 'Failed to delete project');
            }
            
        } catch (error) {
            this.stats.errors++;
            window.AAAI_LOGGER?.error('Error deleting project:', error);
            throw new Error(`Failed to delete project: ${error.message}`);
        }
    },
    
    /**
     * Search projects with advanced filtering
     */
    async searchProjects(query, filters = {}) {
        try {
            const searchOptions = {
                search: query,
                tagFilter: filters.tags || [],
                limit: filters.limit || 50,
                offset: filters.offset || 0
            };
            
            return await this.getProjects(searchOptions);
            
        } catch (error) {
            window.AAAI_LOGGER?.error('Error searching projects:', error);
            throw new Error(`Failed to search projects: ${error.message}`);
        }
    },
    
    /**
     * Get project statistics
     */
    async getProjectStats(projectId) {
        try {
            const project = await this.getProject(projectId);
            return project.statistics || {
                total_messages: 0,
                processed_messages: 0,
                pending_messages: 0,
                error_messages: 0,
                last_activity: project.created_at
            };
        } catch (error) {
            window.AAAI_LOGGER?.error('Error getting project stats:', error);
            throw new Error(`Failed to get project statistics: ${error.message}`);
        }
    },
    
    /**
     * Clear all cached data
     */
    clearCache() {
        const clearedItems = this.projectCache.size + this.searchCache.size;
        
        this.projectCache.clear();
        this.cacheTimestamps.clear();
        this.searchCache.clear();
        
        // Reset cache stats
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
        
        window.AAAI_LOGGER?.info(`Cleared ${clearedItems} items from project cache`);
        
        return clearedItems;
    },
    
    /**
     * Add listener for real-time updates
     */
    onUpdate(callback) {
        if (typeof callback === 'function') {
            this.updateListeners.push(callback);
        }
    },
    
    /**
     * Remove update listener
     */
    removeUpdateListener(callback) {
        const index = this.updateListeners.indexOf(callback);
        if (index > -1) {
            this.updateListeners.splice(index, 1);
        }
    },
    
    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.projectCache.size,
            searchCacheSize: this.searchCache.size,
            hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0 
                ? Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100) 
                : 0,
            uptime: Date.now() - (this.initTime || Date.now())
        };
    },
    
    // Private methods
    
    /**
     * Validate project data
     */
    _validateProjectData(data, isCreate = true) {
        if (isCreate && (!data.name || data.name.trim().length === 0)) {
            throw new Error('Project name is required');
        }
        
        if (data.name && data.name.length > 100) {
            throw new Error('Project name is too long (max 100 characters)');
        }
        
        if (data.description && data.description.length > 500) {
            throw new Error('Project description is too long (max 500 characters)');
        }
        
        if (data.tags && (!Array.isArray(data.tags) || data.tags.length > 10)) {
            throw new Error('Tags must be an array with maximum 10 items');
        }
    },
    
    /**
     * Generate cache key
     */
    _generateCacheKey(type, params = {}) {
        const keyParts = [type];
        
        Object.keys(params)
            .sort()
            .forEach(key => {
                if (params[key] !== undefined && params[key] !== null) {
                    keyParts.push(`${key}:${JSON.stringify(params[key])}`);
                }
            });
        
        return keyParts.join('|');
    },
    
    /**
     * Cache a project
     */
    _cacheProject(project) {
        if (!project || !project.id) return;
        
        this.projectCache.set(project.id, project);
        this.cacheTimestamps.set(project.id, Date.now());
        
        // Cleanup if cache is too large
        if (this.projectCache.size > this.options.maxCacheSize) {
            this._cleanupCache();
        }
    },
    
    /**
     * Get cached project
     */
    _getCachedProject(projectId) {
        if (!this.projectCache.has(projectId)) return null;
        
        const timestamp = this.cacheTimestamps.get(projectId);
        if (!timestamp || (Date.now() - timestamp) > this.options.cacheExpiry) {
            this.projectCache.delete(projectId);
            this.cacheTimestamps.delete(projectId);
            return null;
        }
        
        return this.projectCache.get(projectId);
    },
    
    /**
     * Remove cached project
     */
    _removeCachedProject(projectId) {
        this.projectCache.delete(projectId);
        this.cacheTimestamps.delete(projectId);
    },
    
    /**
     * Cache generic data
     */
    _setCachedData(key, data) {
        this.searchCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
        
        if (this.searchCache.size > this.options.maxCacheSize) {
            this._cleanupSearchCache();
        }
    },
    
    /**
     * Get cached data
     */
    _getCachedData(key) {
        const cached = this.searchCache.get(key);
        if (!cached) return null;
        
        if ((Date.now() - cached.timestamp) > this.options.cacheExpiry) {
            this.searchCache.delete(key);
            return null;
        }
        
        return cached.data;
    },
    
    /**
     * Clear list cache
     */
    _clearListCache() {
        // Remove all list-related cache entries
        for (const [key] of this.searchCache.entries()) {
            if (key.startsWith('list|')) {
                this.searchCache.delete(key);
            }
        }
    },
    
    /**
     * Cleanup old cache entries
     */
    _cleanupCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, timestamp] of this.cacheTimestamps.entries()) {
            if ((now - timestamp) > this.options.cacheExpiry) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => {
            this.projectCache.delete(key);
            this.cacheTimestamps.delete(key);
        });
        
        if (expiredKeys.length > 0) {
            window.AAAI_LOGGER?.debug(`Cleaned up ${expiredKeys.length} expired project cache entries`);
        }
    },
    
    /**
     * Cleanup search cache
     */
    _cleanupSearchCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, cached] of this.searchCache.entries()) {
            if ((now - cached.timestamp) > this.options.cacheExpiry) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => {
            this.searchCache.delete(key);
        });
        
        // If still too large, remove oldest entries
        if (this.searchCache.size > this.options.maxCacheSize) {
            const entries = Array.from(this.searchCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
                .slice(0, Math.floor(this.options.maxCacheSize * 0.1));
            
            entries.forEach(([key]) => {
                this.searchCache.delete(key);
            });
        }
    },
    
    /**
     * Setup automatic synchronization
     */
    _setupAutoSync() {
        if (!this.options.autoSync) return;
        
        this.syncTimer = setInterval(async () => {
            if (this.authService.isAuthenticated() && document.visibilityState === 'visible') {
                try {
                    // Sync recent projects in background
                    await this.getProjects({ 
                        limit: 10, 
                        offset: 0, 
                        forceRefresh: true 
                    });
                    
                    window.AAAI_LOGGER?.debug('Background project sync completed');
                } catch (error) {
                    window.AAAI_LOGGER?.debug('Background sync error:', error);
                }
            }
        }, this.options.syncInterval);
    },
    
    /**
     * Setup cache cleanup interval
     */
    _setupCacheCleanup() {
        setInterval(() => {
            this._cleanupCache();
            this._cleanupSearchCache();
        }, 300000); // Every 5 minutes
    },
    
    /**
     * Notify update listeners
     */
    _notifyUpdateListeners(eventType, data) {
        this.updateListeners.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (error) {
                window.AAAI_LOGGER?.error('Error in update listener:', error);
            }
        });
    }
};

// Auto-initialize if dependencies are available
if (typeof window !== 'undefined') {
    window.ProjectService = ProjectService;
    
    // Auto-initialize when AuthService is available
    document.addEventListener('DOMContentLoaded', () => {
        if (typeof AuthService !== 'undefined' && AuthService.isAuthenticated()) {
            try {
                ProjectService.init(AuthService);
            } catch (error) {
                window.AAAI_LOGGER?.warn('Failed to auto-initialize ProjectService:', error);
            }
        }
    });
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectService;
}