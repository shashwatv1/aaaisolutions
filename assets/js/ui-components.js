/**
 * High-Performance UI Component Renderer for AAAI Solutions Chat
 * Optimized for fast rendering with minimal DOM operations
 */
const UIComponentRenderer = {
    // Component cache for reuse
    componentCache: new Map(),
    
    // Performance options
    options: {
        enableCache: true,
        batchRender: true,
        lazyLoad: true
    },
    
    /**
     * Fast initialization
     */
    init(options = {}) {
        this.options = Object.assign({
            linkHandler: null,
            actionHandler: null,
            enableCache: true,
            batchRender: true
        }, options);
        
        console.log('🎨 Fast UI Component Renderer initialized');
        return this;
    },
    
    /**
     * Fast component rendering with caching
     */
    renderComponent(component, container) {
        if (!component?.type || !container) {
            console.error('Invalid component or container');
            return null;
        }
        
        const startTime = performance.now();
        
        // Check cache first
        const cacheKey = this._generateCacheKey(component);
        if (this.options.enableCache && this.componentCache.has(cacheKey)) {
            const cachedElement = this.componentCache.get(cacheKey).cloneNode(true);
            this._attachEventListeners(cachedElement, component);
            container.appendChild(cachedElement);
            
            console.log(`🎨 Fast component rendered from cache: ${component.type}`);
            return cachedElement;
        }
        
        let componentElement = null;
        
        // Fast component creation
        switch (component.type) {
            case 'button':
                componentElement = this._renderButtonFast(component);
                break;
                
            case 'card':
                componentElement = this._renderCardFast(component);
                break;
                
            case 'quick_replies':
                componentElement = this._renderQuickRepliesFast(component);
                break;
                
            case 'contact_list':
                componentElement = this._renderContactListFast(component);
                break;
                
            default:
                console.warn('Unknown component type:', component.type);
                return null;
        }
        
        if (componentElement) {
            // Cache the component for reuse
            if (this.options.enableCache) {
                this.componentCache.set(cacheKey, componentElement.cloneNode(true));
            }
            
            container.appendChild(componentElement);
            
            const renderTime = performance.now() - startTime;
            console.log(`🎨 Fast component rendered: ${component.type} in ${renderTime.toFixed(2)}ms`);
            
            return componentElement;
        }
        
        return null;
    },
    
    /**
     * Batch render multiple components for performance
     */
    renderComponents(components, container) {
        if (!Array.isArray(components) || !container) {
            return [];
        }
        
        const fragment = document.createDocumentFragment();
        const renderedElements = [];
        
        components.forEach(component => {
            const element = this.renderComponent(component, fragment);
            if (element) {
                renderedElements.push(element);
            }
        });
        
        // Single DOM append for all components
        container.appendChild(fragment);
        
        console.log(`🎨 Fast batch rendered ${renderedElements.length} components`);
        return renderedElements;
    },
    
    /**
     * Fast button component rendering
     */
    _renderButtonFast(component) {
        const button = document.createElement('button');
        button.className = 'chat-component-button';
        button.textContent = component.label || 'Button';
        
        if (component.style) {
            button.classList.add(`chat-button-${component.style}`);
        }
        
        this._attachButtonHandler(button, component);
        
        return button;
    },
    
    /**
     * Fast card component rendering
     */
    _renderCardFast(component) {
        const card = document.createElement('div');
        card.className = 'chat-component-card';
        
        // Build HTML string for faster rendering
        let cardHTML = '';
        
        // Add image if present
        if (component.image_url) {
            cardHTML += `
                <div class="chat-card-image">
                    <img src="${this._escapeHtml(component.image_url)}" 
                         alt="${this._escapeHtml(component.title || 'Card image')}" 
                         loading="lazy">
                </div>`;
        }
        
        // Add content container
        cardHTML += `<div class="chat-card-content">`;
        cardHTML += `<h3 class="chat-card-title">${this._escapeHtml(component.title || '')}</h3>`;
        
        if (component.subtitle) {
            cardHTML += `<p class="chat-card-subtitle">${this._escapeHtml(component.subtitle)}</p>`;
        }
        
        cardHTML += `</div>`;
        
        card.innerHTML = cardHTML;
        
        // Add buttons if present
        if (component.buttons?.length) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'chat-card-buttons';
            
            component.buttons.forEach(buttonData => {
                const button = this._renderButtonFast(buttonData);
                buttonContainer.appendChild(button);
            });
            
            card.querySelector('.chat-card-content').appendChild(buttonContainer);
        }
        
        return card;
    },
    
    /**
     * Fast quick replies rendering
     */
    _renderQuickRepliesFast(component) {
        const container = document.createElement('div');
        container.className = 'chat-component-quick-replies';
        
        let containerHTML = '';
        
        if (component.title) {
            containerHTML += `<div class="chat-quick-replies-title">${this._escapeHtml(component.title)}</div>`;
        }
        
        if (component.options?.length) {
            containerHTML += `<div class="chat-quick-replies-options">`;
            
            component.options.forEach((option, index) => {
                containerHTML += `
                    <button class="chat-quick-reply-button" data-option-index="${index}">
                        ${this._escapeHtml(option.label || 'Option')}
                    </button>`;
            });
            
            containerHTML += `</div>`;
        }
        
        container.innerHTML = containerHTML;
        
        // Attach event listeners
        if (component.options?.length) {
            const buttons = container.querySelectorAll('.chat-quick-reply-button');
            buttons.forEach((button, index) => {
                const option = component.options[index];
                this._attachQuickReplyHandler(button, option, container);
            });
        }
        
        return container;
    },
    
    /**
     * Fast contact list rendering
     */
    _renderContactListFast(component) {
        const container = document.createElement('div');
        container.className = 'chat-component-contact-list';
        
        if (!component.items?.length) {
            return container;
        }
        
        let listHTML = '';
        
        component.items.forEach((item, index) => {
            listHTML += `
                <div class="chat-contact-item">
                    <div class="chat-contact-icon chat-icon-${item.icon || 'default'}"></div>
                    <div class="chat-contact-content">
                        <div class="chat-contact-title">${this._escapeHtml(item.title || '')}</div>
                        <div class="chat-contact-value">${this._escapeHtml(item.value || '')}</div>
                    </div>`;
            
            if (item.action === 'copy') {
                listHTML += `
                    <button class="chat-contact-copy" data-copy-value="${this._escapeHtml(item.value)}" title="Copy to clipboard">
                        <ion-icon name="copy-outline"></ion-icon>
                    </button>`;
            }
            
            listHTML += `</div>`;
        });
        
        container.innerHTML = listHTML;
        
        // Attach copy handlers
        const copyButtons = container.querySelectorAll('.chat-contact-copy');
        copyButtons.forEach(button => {
            this._attachCopyHandler(button);
        });
        
        return container;
    },
    
    /**
     * Clear component cache
     */
    clearCache() {
        this.componentCache.clear();
        console.log('🎨 Component cache cleared');
    },
    
    // Private helper methods
    
    _generateCacheKey(component) {
        return `${component.type}_${JSON.stringify(component).length}_${component.title || ''}`;
    },
    
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    _attachEventListeners(element, component) {
        // Re-attach event listeners for cached elements
        const buttons = element.querySelectorAll('.chat-component-button');
        buttons.forEach(button => {
            this._attachButtonHandler(button, component);
        });
    },
    
    _attachButtonHandler(button, component) {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            
            if (component.action === 'link' && component.value) {
                if (this.options.linkHandler) {
                    this.options.linkHandler(component.value);
                } else {
                    window.open(component.value, '_blank');
                }
            } else if (this.options.actionHandler) {
                this.options.actionHandler(component.action, component.value);
            }
        });
    },
    
    _attachQuickReplyHandler(button, option, container) {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            
            if (option.action === 'link' && option.url) {
                if (this.options.linkHandler) {
                    this.options.linkHandler(option.url);
                } else {
                    window.open(option.url, '_blank');
                }
            } else if (option.action === 'reply') {
                if (this.options.actionHandler) {
                    this.options.actionHandler('reply', option.label);
                }
            } else if (this.options.actionHandler) {
                this.options.actionHandler(option.action, option.value);
            }
            
            // Remove quick replies after selection
            container.remove();
        });
    },
    
    _attachCopyHandler(button) {
        const value = button.getAttribute('data-copy-value');
        
        button.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(value);
                
                button.classList.add('copied');
                setTimeout(() => {
                    button.classList.remove('copied');
                }, 2000);
                
            } catch (err) {
                console.error('Failed to copy:', err);
                
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = value;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                button.classList.add('copied');
                setTimeout(() => {
                    button.classList.remove('copied');
                }, 2000);
            }
        });
    }
};