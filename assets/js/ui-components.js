/**
 * UI Component Renderer for AAAI Solutions Chat
 * Renders rich UI components in the chat interface
*/
const UIComponentRenderer = {
  /**
   * Initialize the component renderer
   * @param {Object} options - Renderer options
   */
  init(options = {}) {
      this.options = Object.assign({
          linkHandler: null,
          actionHandler: null
      }, options);
      
      return this;
  },
  
  /**
   * Render a component in the chat
   * @param {Object} component - Component data
   * @param {Element} container - Container element
   */
  renderComponent(component, container) {
      if (!component || !component.type || !container) {
          console.error('Invalid component or container');
          return null;
      }
      
      let componentElement = null;
      
      switch (component.type) {
          case 'button':
              componentElement = this._renderButton(component);
              break;
              
          case 'card':
              componentElement = this._renderCard(component);
              break;
              
          case 'quick_replies':
              componentElement = this._renderQuickReplies(component);
              break;
              
          case 'contact_list':
              componentElement = this._renderContactList(component);
              break;
              
          default:
              console.warn('Unknown component type:', component.type);
              return null;
      }
      
      if (componentElement) {
          container.appendChild(componentElement);
          return componentElement;
      }
      
      return null;
  },
  
  /**
   * Render a button component
   * @private
   */
  _renderButton(component) {
      const button = document.createElement('button');
      button.className = 'chat-component-button';
      button.textContent = component.label || 'Button';
      
      // Add style class
      if (component.style) {
          button.classList.add(`chat-button-${component.style}`);
      }
      
      // Add action handler
      button.addEventListener('click', (event) => {
          event.preventDefault();
          
          if (component.action === 'link' && component.value) {
              // Handle link action
              if (this.options.linkHandler) {
                  this.options.linkHandler(component.value);
              } else {
                  window.location.href = component.value;
              }
          } else if (this.options.actionHandler) {
              // Handle other actions
              this.options.actionHandler(component.action, component.value);
          }
      });
      
      return button;
  },
  
  /**
   * Render a card component
   * @private
   */
  _renderCard(component) {
      const card = document.createElement('div');
      card.className = 'chat-component-card';
      
      // Add image if present
      if (component.image_url) {
          const imageContainer = document.createElement('div');
          imageContainer.className = 'chat-card-image';
          
          const image = document.createElement('img');
          image.src = component.image_url;
          image.alt = component.title || 'Card image';
          
          imageContainer.appendChild(image);
          card.appendChild(imageContainer);
      }
      
      // Add content container
      const content = document.createElement('div');
      content.className = 'chat-card-content';
      
      // Add title
      const title = document.createElement('h3');
      title.className = 'chat-card-title';
      title.textContent = component.title || '';
      content.appendChild(title);
      
      // Add subtitle if present
      if (component.subtitle) {
          const subtitle = document.createElement('p');
          subtitle.className = 'chat-card-subtitle';
          subtitle.textContent = component.subtitle;
          content.appendChild(subtitle);
      }
      
      // Add buttons if present
      if (component.buttons && Array.isArray(component.buttons)) {
          const buttonContainer = document.createElement('div');
          buttonContainer.className = 'chat-card-buttons';
          
          component.buttons.forEach(buttonData => {
              const button = this._renderButton(buttonData);
              buttonContainer.appendChild(button);
          });
          
          content.appendChild(buttonContainer);
      }
      
      card.appendChild(content);
      return card;
  },
  
  /**
   * Render quick replies
   * @private
   */
  _renderQuickReplies(component) {
      const container = document.createElement('div');
      container.className = 'chat-component-quick-replies';
      
      // Add title if present
      if (component.title) {
          const title = document.createElement('div');
          title.className = 'chat-quick-replies-title';
          title.textContent = component.title;
          container.appendChild(title);
      }
      
      // Add options
      if (component.options && Array.isArray(component.options)) {
          const optionsContainer = document.createElement('div');
          optionsContainer.className = 'chat-quick-replies-options';
          
          component.options.forEach(option => {
              const button = document.createElement('button');
              button.className = 'chat-quick-reply-button';
              button.textContent = option.label || 'Option';
              
              // Add action handler
              button.addEventListener('click', (event) => {
                  event.preventDefault();
                  
                  if (option.action === 'link' && option.url) {
                      // Handle link action
                      if (this.options.linkHandler) {
                          this.options.linkHandler(option.url);
                      } else {
                          window.location.href = option.url;
                      }
                  } else if (option.action === 'reply') {
                      // Handle reply action - simulate a user message
                      if (this.options.actionHandler) {
                          this.options.actionHandler('reply', option.label);
                      }
                  } else if (this.options.actionHandler) {
                      // Handle other actions
                      this.options.actionHandler(option.action, option.value);
                  }
                  
                  // Remove quick replies after selection
                  container.remove();
              });
              
              optionsContainer.appendChild(button);
          });
          
          container.appendChild(optionsContainer);
      }
      
      return container;
  },
  
  /**
   * Render contact list
   * @private
   */
  _renderContactList(component) {
      const container = document.createElement('div');
      container.className = 'chat-component-contact-list';
      
      // Add items
      if (component.items && Array.isArray(component.items)) {
          component.items.forEach(item => {
              const contactItem = document.createElement('div');
              contactItem.className = 'chat-contact-item';
              
              // Add icon
              const icon = document.createElement('div');
              icon.className = `chat-contact-icon chat-icon-${item.icon || 'default'}`;
              contactItem.appendChild(icon);
              
              // Add content
              const content = document.createElement('div');
              content.className = 'chat-contact-content';
              
              // Add title
              const title = document.createElement('div');
              title.className = 'chat-contact-title';
              title.textContent = item.title || '';
              content.appendChild(title);
              
              // Add value
              const value = document.createElement('div');
              value.className = 'chat-contact-value';
              value.textContent = item.value || '';
              content.appendChild(value);
              
              contactItem.appendChild(content);
              
              // Add action button
              if (item.action === 'copy') {
                  const copyButton = document.createElement('button');
                  copyButton.className = 'chat-contact-copy';
                  copyButton.innerHTML = '<ion-icon name="copy-outline"></ion-icon>';
                  copyButton.title = 'Copy to clipboard';
                  
                  copyButton.addEventListener('click', () => {
                      navigator.clipboard.writeText(item.value)
                          .then(() => {
                              // Show copied tooltip
                              copyButton.classList.add('copied');
                              setTimeout(() => {
                                  copyButton.classList.remove('copied');
                              }, 2000);
                          })
                          .catch(err => console.error('Failed to copy:', err));
                  });
                  
                  contactItem.appendChild(copyButton);
              }
              
              container.appendChild(contactItem);
          });
      }
      
      return container;
  }
};