function generateCode(length = 8, options = { letters: true, numbers: true }) {
    let chars = '';

    if (options.letters) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    if (options.numbers) chars += '0123456789';

    if (!chars) {
        throw new Error('At least one of letters or numbers must be enabled');
    }

    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return code;
}

module.exports = generateCode;
