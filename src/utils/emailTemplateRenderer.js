'use strict';

const fs = require('fs');
const path = require('path');

const templatePath = path.resolve(
    __dirname,
    '..',
    '..',
    'smileagrimarket-email-template.html'
);

let cachedTemplate = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeUrl(value, fallback) {
    try {
        const parsed = new URL(String(value || ''));
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
    } catch (error) {
        // Use the known-safe fallback below.
    }

    return fallback;
}

function paragraph(content) {
    return `<p class="body-copy" style="margin:0 0 18px; color:#193018; font-size:16px; line-height:26px;">${content}</p>`;
}

function heading(content) {
    return `<h2 style="margin:26px 0 12px; color:#0f3f05; font-size:20px; line-height:28px;">${content}</h2>`;
}

function list(items, ordered = false) {
    const tag = ordered ? 'ol' : 'ul';
    const listItems = items
        .map((item) => `<li style="margin:0 0 9px;">${item}</li>`)
        .join('');

    return `<${tag} class="body-copy" style="margin:0 0 20px; padding-left:22px; color:#193018; font-size:16px; line-height:25px;">${listItems}</${tag}>`;
}

function checklist(items) {
    return items
        .map((item) => paragraph(`<strong style="color:#1f7a12;">&#10004;</strong>&nbsp; ${item}`))
        .join('');
}

function getFirstName(user) {
    const suppliedName = user?.firstName || user?.fullName || '';
    const firstName = String(suppliedName).trim().split(/\s+/)[0];
    return firstName || 'there';
}

function getWebsiteSettings() {
    const websiteUrl = safeUrl(
        process.env.WEBSITE_URL || 'https://smileagrimarket.com',
        'https://smileagrimarket.com/'
    );
    const appUrl = safeUrl(
        process.env.FE_URL || 'https://app.smileagrimarket.com',
        'https://app.smileagrimarket.com/'
    );
    const websiteDomain = new URL(websiteUrl).hostname.replace(/^www\./, '');

    return {
        websiteUrl,
        appUrl,
        websiteDomain,
        supportUrl: safeUrl(
            process.env.SUPPORT_URL || `${websiteUrl.replace(/\/$/, '')}/support`,
            'https://smileagrimarket.com/support'
        ),
        unsubscribeUrl: safeUrl(
            process.env.UNSUBSCRIBE_URL || `${websiteUrl.replace(/\/$/, '')}/unsubscribe`,
            'https://smileagrimarket.com/unsubscribe'
        ),
        logoUrl: safeUrl(
            process.env.EMAIL_LOGO_URL
                || `${websiteUrl.replace(/\/$/, '')}/assets/smileagrimarket-wordmark-cropped.png`,
            'https://smileagrimarket.com/assets/smileagrimarket-wordmark-cropped.png'
        )
    };
}

function welcomeEmail({ appUrl }) {
    return {
        label: 'Welcome',
        title: 'Agriculture meets opportunity.',
        preheader: 'Welcome to AgriMarket, a trusted marketplace built to help agricultural businesses grow.',
        bodyHtml: [
            paragraph('Welcome to AgriMarket! We\'re excited to have you join a growing community connecting agriculture with opportunity.'),
            paragraph('Whether you\'re looking to source quality produce, grow your farm, invest in agricultural projects, or connect with trusted suppliers, you\'re now part of a platform built to make agricultural business more transparent, secure, and rewarding.'),
            heading('Here\'s what you can do next'),
            checklist([
                'Complete your profile to personalize your experience.',
                'Verify your account to unlock more platform features and improve trust with other users.',
                'Explore verified farms, products, suppliers, and investment opportunities.',
                'Save listings you\'re interested in and receive updates when they change.'
            ]),
            heading('Why AgriMarket?'),
            paragraph('We believe trust is the foundation of every successful transaction. That\'s why we work to provide:'),
            list([
                'Verified users and businesses',
                'Transparent listings and project information',
                'Secure payment and investment processes',
                'Real-time updates on your activities'
            ]),
            paragraph('If you ever need assistance, our support team is here to help.'),
            paragraph('Thank you for choosing AgriMarket. We look forward to helping you grow.')
        ].join(''),
        ctaLabel: 'Complete Your Profile',
        ctaUrl: `${appUrl.replace(/\/$/, '')}/profile`,
        closingText: 'See you inside,'
    };
}

function kycApprovedEmail({ appUrl }) {
    return {
        label: 'Identity verification',
        title: 'Your KYC has been approved.',
        preheader: 'Your AgriMarket identity verification is approved and your verified features are now available.',
        bodyHtml: [
            paragraph('Great news! Your identity verification has been successfully approved.'),
            paragraph('Your account is now fully verified, giving you access to additional features across AgriMarket.'),
            heading('You can now:'),
            list([
                'Invest in verified farm opportunities',
                'Create and manage eligible listings',
                'Complete transactions with greater trust',
                'Access features available only to verified users'
            ]),
            paragraph('Thank you for helping us maintain a secure and trusted marketplace for everyone.'),
            paragraph('Log in to your account and continue exploring new opportunities.')
        ].join(''),
        ctaLabel: 'Explore AgriMarket',
        ctaUrl: appUrl,
        closingText: 'See you on AgriMarket,'
    };
}

function kycRejectedEmail({ appUrl, shortCodes }) {
    const reason = escapeHtml(
        shortCodes?.rejectionReason
        || shortCodes?.rejection_reason
        || shortCodes?.reason
        || 'The submitted documents could not be verified.'
    );

    return {
        label: 'Identity verification',
        title: 'Your KYC needs attention.',
        preheader: 'We could not approve your AgriMarket identity verification. Review the reason and submit again.',
        bodyHtml: paragraph('We were unable to verify your identity, so your KYC submission has not been approved.'),
        bodyHtmlAfterPanel: [
            heading('Common reasons include:'),
            list([
                'Blurry or unreadable document images',
                'Expired identification documents',
                'Information that doesn\'t match your account details',
                'Missing or incomplete documentation'
            ]),
            paragraph('You can submit a new verification request at any time by uploading clear, valid documents and ensuring your details match exactly.'),
            paragraph('If you believe this was a mistake or need assistance, our support team is ready to help.')
        ].join(''),
        panelTitle: 'Reason for rejection',
        panelText: reason,
        ctaLabel: 'Submit KYC Again',
        ctaUrl: `${appUrl.replace(/\/$/, '')}/kyc`,
        closingText: 'Thank you for your understanding as we work to keep AgriMarket secure for all users.'
    };
}

function passwordResetEmail({ shortCodes }) {
    const resetLink = safeUrl(
        shortCodes?.resetLink || shortCodes?.reset_link,
        'https://app.smileagrimarket.com/forgot-password'
    );
    const expiryTime = escapeHtml(
        shortCodes?.expiryTime || shortCodes?.expiry_time || '1 hour'
    );

    return {
        label: 'Account security',
        title: 'Reset your password.',
        preheader: `Use this secure link to reset your AgriMarket password. It expires in ${expiryTime}.`,
        bodyHtml: [
            paragraph('We received a request to reset the password for your AgriMarket account.'),
            paragraph('To create a new password, click the button below:')
        ].join(''),
        bodyHtmlAfterCta: [
            paragraph(`This link will expire in ${expiryTime} for your security.`),
            paragraph('If you didn\'t request a password reset, you can safely ignore this email. Your account will remain secure, and no changes will be made.'),
            paragraph('If you continue to receive password reset emails you didn\'t request, we recommend contacting our support team.')
        ].join(''),
        ctaLabel: 'Reset Password',
        ctaUrl: resetLink,
        closingText: 'Thank you,'
    };
}

function passwordResetSuccessfulEmail({ appUrl }) {
    return {
        label: 'Account security',
        title: 'Your password was updated.',
        preheader: 'Your AgriMarket password has been successfully updated.',
        bodyHtml: [
            paragraph('Your AgriMarket password has been successfully updated.'),
            paragraph('You can now sign in using your new password.'),
            paragraph('If you made this change, no further action is required.'),
            paragraph('If you did not change your password, please contact our support team immediately so we can help secure your account.')
        ].join(''),
        ctaLabel: 'Sign In',
        ctaUrl: `${appUrl.replace(/\/$/, '')}/login`,
        closingText: 'Thank you for helping us keep your account safe.'
    };
}

function betaSignupEmail({ websiteUrl }) {
    return {
        label: 'Beta access',
        title: 'You\'re on the AgriMarket beta list.',
        preheader: 'Thanks for joining the AgriMarket beta. You will be among the first to receive early access.',
        bodyHtml: [
            paragraph('Thanks for signing up for the AgriMarket Beta!'),
            paragraph('You\'re now among the first people who\'ll get early access to a new way of connecting with verified farmers, suppliers, buyers, and agricultural investment opportunities.'),
            heading('As a beta member, you\'ll receive:'),
            list([
                'Early access before public launch',
                'Sneak peeks at upcoming features',
                'Invitations to test new functionality',
                'Opportunities to share feedback that shapes the platform',
                'Product updates and launch announcements'
            ]),
            paragraph('We\'re building AgriMarket with our community, and your feedback will play an important role in helping us create a better experience for everyone.'),
            heading('What happens next?'),
            paragraph('We\'re currently preparing the beta experience. Once your account is ready, we\'ll send you another email with your invitation and everything you need to get started.'),
            paragraph('In the meantime, keep an eye on your inbox for product updates and exclusive previews.'),
            paragraph('Thank you for joining us on this journey.')
        ].join(''),
        ctaLabel: 'Visit SmileAgriMarket',
        ctaUrl: websiteUrl,
        closingText: 'We\'ll see you soon!',
        showUnsubscribe: true
    };
}

const contentBuilders = {
    WELCOME_EMAIL_TEMPLATE: welcomeEmail,
    KYC_APPROVED_TEMPLATE: kycApprovedEmail,
    KYC_REJECTED_TEMPLATE: kycRejectedEmail,
    PASSWORD_RESET_TEMPLATE: passwordResetEmail,
    PASSWORD_RESET_SUCCESS_TEMPLATE: passwordResetSuccessfulEmail,
    BETA_SIGNUP_TEMPLATE: betaSignupEmail
};

function getTemplate() {
    if (!cachedTemplate) {
        cachedTemplate = fs.readFileSync(templatePath, 'utf8');
    }

    return cachedTemplate;
}

function replacePlaceholders(template, replacements) {
    return Object.entries(replacements).reduce((html, [key, value]) => {
        return html.replace(new RegExp(`{{${key}}}`, 'g'), String(value ?? ''));
    }, template);
}

function renderEmailTemplate(templateName, options = {}) {
    const settings = getWebsiteSettings();
    const builder = contentBuilders[templateName];
    const content = builder
        ? builder({
            ...settings,
            user: options.user,
            shortCodes: options.shortCodes || {}
        })
        : {
            label: 'AgriMarket update',
            title: options.subject || 'An update from AgriMarket',
            preheader: options.subject || 'You have a new update from AgriMarket.',
            bodyHtml: options.fallbackBody || '',
            closingText: 'Thank you,'
        };
    const hasPanel = Boolean(content.panelTitle || content.panelText);
    const hasCta = Boolean(content.ctaLabel && content.ctaUrl);
    const showUnsubscribe = Boolean(content.showUnsubscribe);

    return replacePlaceholders(getTemplate(), {
        email_subject: escapeHtml(options.subject || 'SmileAgriMarket'),
        preheader_text: escapeHtml(content.preheader || ''),
        logo_url: escapeHtml(settings.logoUrl),
        website_url: escapeHtml(settings.websiteUrl),
        website_domain: escapeHtml(settings.websiteDomain),
        support_url: escapeHtml(settings.supportUrl),
        unsubscribe_url: escapeHtml(settings.unsubscribeUrl),
        email_label: escapeHtml(content.label || ''),
        email_title: escapeHtml(content.title || options.subject || ''),
        first_name: escapeHtml(getFirstName(options.user)),
        body_html: content.bodyHtml || '',
        body_html_after_panel: content.bodyHtmlAfterPanel || '',
        body_html_after_cta: content.bodyHtmlAfterCta || '',
        supporting_panel_display: hasPanel ? '' : 'display:none;',
        panel_title: content.panelTitle || '',
        panel_text: content.panelText || '',
        primary_cta_display: hasCta ? '' : 'display:none;',
        primary_cta_url: escapeHtml(content.ctaUrl || settings.websiteUrl),
        primary_cta_label: escapeHtml(content.ctaLabel || ''),
        closing_text: escapeHtml(content.closingText || ''),
        unsubscribe_separator_display: showUnsubscribe ? '' : 'display:none;',
        unsubscribe_display: showUnsubscribe ? '' : 'display:none;',
        company_address: escapeHtml(process.env.COMPANY_ADDRESS || 'SmileAgriMarket')
    });
}

module.exports = {
    escapeHtml,
    getFirstName,
    renderEmailTemplate
};
