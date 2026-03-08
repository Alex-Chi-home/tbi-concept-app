(() => {
  const themeButtonStyleProperties = [
    'background',
    'background-color',
    'color',
    'border',
    'border-radius',
    'box-shadow',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'letter-spacing',
    'line-height',
    'padding-top',
    'padding-right',
    'padding-bottom',
    'padding-left',
    'text-transform'
  ];
  const initializedBlocks = new WeakSet();

  const initializeBlock = (block) => {
    if (!block || initializedBlocks.has(block)) return;
    initializedBlocks.add(block);

    const button = block.querySelector('[data-popup-calculator-open]');
    const modal = block.querySelector('[data-popup-calculator-modal]');
    const iframe = block.querySelector('[data-popup-calculator-iframe]');
    const closeButtons = block.querySelectorAll('[data-popup-calculator-close]');
    const fallbackVariantId = block.dataset.fallbackVariantId;

    if (!button || !modal || !iframe) return;

    const isVisibleElement = (element) => {
      if (!element || element === button) return false;
      if (element.closest('[data-popup-calculator-block]')) return false;
      return element.getClientRects().length > 0 && window.getComputedStyle(element).display !== 'none';
    };

    const findReferenceButton = () => {
      const closestSection = block.closest('.shopify-section');
      const searchRoots = [closestSection, document].filter(Boolean);
      const selectors = [
        'form[action*="/cart/add"] button[type="submit"]',
        'form[action*="/cart/add"] input[type="submit"]',
        'button[name="add"]',
        'button[type="submit"]',
        'input[type="submit"]'
      ];

      for (const root of searchRoots) {
        for (const selector of selectors) {
          const candidate = root.querySelector(selector);
          if (isVisibleElement(candidate)) return candidate;
        }
      }

      return null;
    };

    const syncButtonStylesWithTheme = () => {
      const referenceButton = findReferenceButton();
      if (!referenceButton) return;

      const computedStyles = window.getComputedStyle(referenceButton);
      for (const property of themeButtonStyleProperties) {
        const value = computedStyles.getPropertyValue(property);
        if (value) button.style.setProperty(property, value);
      }
    };

    const openModal = () => {
      modal.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    };

    const closeModal = () => {
      modal.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    };

    const getCurrentVariantId = () => {
      const formVariantField = document.querySelector('form[action*="/cart/add"] [name="id"]');
      if (formVariantField && formVariantField.value) return formVariantField.value;

      const urlVariantId = new URLSearchParams(window.location.search).get('variant');
      if (urlVariantId) return urlVariantId;

      return fallbackVariantId;
    };

    const addItemToCart = async (eventData = {}) => {
      const variantId = eventData.variantId || getCurrentVariantId();
      const requestedQuantity = Number(eventData.quantity ?? 1);
      const quantity = Number.isFinite(requestedQuantity) && requestedQuantity > 0 ? requestedQuantity : 1;

      if (!variantId) throw new Error('Variant id was not found on the current page');

      const response = await fetch(`${window.Shopify.routes.root}cart/add.js`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          items: [{ id: Number(variantId), quantity }]
        })
      });

      if (!response.ok) throw new Error(`Cart add failed with status ${response.status}`);
      return response;
    };

    syncButtonStylesWithTheme();
    requestAnimationFrame(syncButtonStylesWithTheme);
    window.setTimeout(syncButtonStylesWithTheme, 300);

    button.addEventListener('click', openModal);
    closeButtons.forEach((closeButton) => closeButton.addEventListener('click', closeModal));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });

    window.addEventListener('message', async (event) => {
      if (event.source !== iframe.contentWindow) return;

      if (event.data?.type === 'TO_CART_EVENT') {
        window.location.href = `${window.Shopify.routes.root}cart`;
        return;
      }

      if (event.data?.type === 'TO_CHECKOUT_EVENT') {
        window.location.href = `${window.Shopify.routes.root}checkout`;
        return;
      }

      if (event.data?.type !== 'ADD_TO_CART_EVENT') return;

      try {
        await addItemToCart(event.data);
        window.location.href = `${window.Shopify.routes.root}cart`;
      } catch (error) {
        console.error('Failed to add the product to the cart', error);
      }
    });
  };

  const initializeAllBlocks = (root = document) => {
    root.querySelectorAll('[data-popup-calculator-block]').forEach(initializeBlock);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initializeAllBlocks(), { once: true });
  } else {
    initializeAllBlocks();
  }

  document.addEventListener('shopify:section:load', (event) => initializeAllBlocks(event.target));
})();