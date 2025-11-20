const generateCode = require('../../utils/verificationCode');
const notify = require('../../utils/notify');

const makeForgotPassword = (modelOrKey, opts = {}) => {
    const policyModelKey = opts.policyModelKey || 'PolicyNumber';
    const userType = opts.userType || (typeof modelOrKey === 'string' ? modelOrKey : 'Admin');
    const templateName = opts.templateName || 'OTP';
    const codeLength = opts.codeLength || 6;

    return async (req, res, next) => {
        try {
            const { email, policyNumber } = req.body || {};

            if (!email && !policyNumber) return res.fail('Provide email or policyNumber', 400);

            let UserModel = null;
            if (typeof modelOrKey === 'string') {
                UserModel = req.models && req.models[modelOrKey];
            } else {
                UserModel = modelOrKey;
            }
            if (!UserModel) return res.fail('Server configuration error (models missing)', 500);

            let user = null;

            if (policyNumber) {
                const PolicyModel = req.models && req.models[policyModelKey];
                if (!PolicyModel) return res.fail('Server configuration error (Policy model missing)', 500);

                const lookupPolicyNumber = (typeof policyNumber === 'string') ? policyNumber.toUpperCase() : policyNumber;

                const policy = await PolicyModel.findOne({ where: { policyNumber: lookupPolicyNumber } });
                if (!policy || policy.userType !== userType) return res.fail('Invalid credentials', 401);

                user = await UserModel.findByPk(policy.userId);
            } else if (email) {
                user = await UserModel.findOne({ where: { email } });
            }

            if (!user) return res.fail('User not found', 404);

            const code = generateCode(codeLength, { letters: false, numbers: true });

            const { PasswordReset } = req.models || {};
            if (!PasswordReset) return res.fail('Server configuration error (PasswordReset model missing)', 500);

            await PasswordReset.create({
                userId: user.id,
                userType,
                token: code
            });

            try {
                await notify(user, userType, templateName, { code: code }, ['email'], true);
            } catch (e) {
                console.error('Failed to send password reset notification:', e && e.message ? e.message : e);
            }

            return res.success({}, 'Verification code sent');
        } catch (err) {
            return next(err);
        }
    };
};

module.exports = {
    makeForgotPassword,
};
