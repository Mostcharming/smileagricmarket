// utils/codeGenerator.js
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

// Example usage:
console.log(generateCode(10)); // e.g. "a9ZbD3qP0t"
console.log(generateCode(6, { letters: false, numbers: true })); // e.g. "492581"
console.log(generateCode(12, { letters: true, numbers: false })); // e.g. "xYzQaBcDeFgH"

module.exports = generateCode;
