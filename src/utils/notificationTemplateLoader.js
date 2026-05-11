const path = require('path');
const fs = require('fs');

class NotificationTemplateLoader {
    constructor() {
        this.templates = null;
    }

    load() {
        if (this.templates) {
            return this.templates;
        }

        try {
            const templatePath = path.join(__dirname, 'notificationTemplates.json');
            const fileContent = fs.readFileSync(templatePath, 'utf8');
            this.templates = JSON.parse(fileContent);
            return this.templates;
        } catch (error) {
            console.error('Failed to load notification templates:', error.message);
            return {};
        }
    }

    getTemplate(templateKey) {
        if (!templateKey) {
            console.warn('Template key is not provided');
            return null;
        }
        const templates = this.load();
        if (!templates[templateKey]) {
            console.warn(`Template "${templateKey}" not found in templates`);
            return null;
        }
        return templates[templateKey];
    }

    getAllTemplates() {
        return this.load();
    }
}

module.exports = new NotificationTemplateLoader();
