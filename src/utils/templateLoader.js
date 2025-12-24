const templates = require('./notificationTemplates.json');

/**
 * Get notification template by name
 * @param {string} templateName - Name of the template (e.g., 'SMS_OTP_TEMPLATE')
 * @returns {Object|null} Template object or null if not found
 */
function getTemplate(templateName) {
    if (!templates[templateName]) {
        console.warn(`Template not found: ${templateName}`);
        return null;
    }
    return templates[templateName];
}

/**
 * Get all templates
 * @returns {Object} All available templates
 */
function getAllTemplates() {
    return templates;
}

/**
 * Check if template exists
 * @param {string} templateName - Name of the template
 * @returns {boolean} True if template exists
 */
function hasTemplate(templateName) {
    return !!templates[templateName];
}

/**
 * Get template shortcodes
 * @param {string} templateName - Name of the template
 * @returns {Array} Array of shortcodes used in template
 */
function getTemplateShortcodes(templateName) {
    const template = getTemplate(templateName);
    return template ? template.shortcodes : [];
}

module.exports = {
    getTemplate,
    getAllTemplates,
    hasTemplate,
    getTemplateShortcodes
};
