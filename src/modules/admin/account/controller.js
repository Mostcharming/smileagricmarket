const bcrypt = require('bcrypt');

// Controller for admin account operations: update profile (excluding email) and change password
const updateProfile = () => async (req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        if (!userId) return res.fail('Unauthorized', 401);

        const body = req.body || {};
        const allowed = [
            'firstName', 'lastName', 'phoneNumber', 'picture',
            'state', 'country', 'currentLocation', 'latitude', 'longitude',
            'address', 'city', 'postalCode', 'status'
        ];

        const updates = {};
        for (const key of allowed) {
            if (body[key] !== undefined) updates[key] = body[key];
        }

        // if a file was uploaded, prefer that for picture field
        if (req.profileImage && req.profileImage.filename) {
            // store absolute URL so the DB contains a route like http://host:port/upload/<filename>
            const base = (req.protocol && req.get && req.get('host')) ? `${req.protocol}://${req.get('host')}` : '';
            const rel = req.profileImage.url || `/upload/${req.profileImage.filename}`;
            updates.picture = base ? `${base}${rel}` : rel;
        }

        if (Object.keys(updates).length === 0) return res.fail('No updatable fields provided', 400);

        const Admin = req.models && req.models.Admin;
        if (!Admin) return res.fail('Server configuration error (Admin model missing)', 500);

        const user = await Admin.findByPk(userId);
        if (!user) return res.fail('User not found', 404);

        if (updates.status && !['active', 'inactive', 'suspended'].includes(updates.status)) {
            return res.fail('Invalid status', 400);
        }

        await user.update(updates);
        if (typeof user.reload === 'function') await user.reload();

        const safeUser = {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            picture: user.picture || null,
            phoneNumber: user.phoneNumber || null,
            status: user.status || 'active',
            latitude: user.latitude || null,
            longitude: user.longitude || null,
            currentLocation: user.currentLocation || null,
            state: user.state || null,
            country: user.country || null,
            address: user.address || null,
            city: user.city || null,
            postalCode: user.postalCode || null
        };

        return res.success({ user: safeUser }, 'Profile updated');
    } catch (err) {
        return next(err);
    }
};

const changePassword = () => async (req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        if (!userId) return res.fail('Unauthorized', 401);

        const { oldPassword, newPassword } = req.body || {};
        if (!oldPassword || !newPassword) return res.fail('oldPassword and newPassword are required', 400);
        if (typeof newPassword !== 'string' || newPassword.length < 8) return res.fail('Password must be at least 8 characters', 400);

        const Admin = req.models && req.models.Admin;
        if (!Admin) return res.fail('Server configuration error (Admin model missing)', 500);

        const user = await Admin.findByPk(userId);
        if (!user) return res.fail('User not found', 404);

        let matches = false;
        if (user.passwordHash) {
            try {
                matches = await bcrypt.compare(oldPassword, user.passwordHash);
            } catch (e) {
                // fallback to plain compare if bcrypt fails
                matches = user.passwordHash === oldPassword;
            }
        }

        if (!matches) return res.fail('Old password is incorrect', 401);

        const saltRounds = 10;
        const hashed = await bcrypt.hash(newPassword, saltRounds);
        await user.update({ passwordHash: hashed });

        return res.success(null, 'Password changed');
    } catch (err) {
        return next(err);
    }
};

const getProfile = () => async (req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        if (!userId) return res.fail('Unauthorized', 401);

        const Admin = req.models && req.models.Admin;
        if (!Admin) return res.fail('Server configuration error (Admin model missing)', 500);

        const user = await Admin.findByPk(userId);
        if (!user) return res.fail('User not found', 404);

        const safeUser = {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            picture: user.picture || null,
            phoneNumber: user.phoneNumber || null,
            status: user.status || 'active',
            latitude: user.latitude || null,
            longitude: user.longitude || null,
            currentLocation: user.currentLocation || null,
            state: user.state || null,
            country: user.country || null,
            address: user.address || null,
            city: user.city || null,
            postalCode: user.postalCode || null
        };

        return res.success({ user: safeUser }, 'Profile fetched');
    } catch (err) {
        return next(err);
    }
};

module.exports = {
    updateProfile: updateProfile(),
    changePassword: changePassword(),
    getProfile: getProfile()
};
