const templates = require('./notificationTemplates.json');

function getTemplate(templateName) {
    if (!templates[templateName]) {
        console.warn(`Template not found: ${templateName}`);
        return null;
    }
    return templates[templateName];
}

function getAllTemplates() {
    return templates;
}

function hasTemplate(templateName) {
    return !!templates[templateName];
}

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
