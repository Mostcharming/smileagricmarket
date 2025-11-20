const { signToken } = require('../../middlewares/common/security');

const makeLogin = (modelOrKey, opts = {}) => {
    const policyModelKey = opts.policyModelKey || 'PolicyNumber';
    const userType = opts.userType || (typeof modelOrKey === 'string' ? modelOrKey : 'Admin');

    return async (req, res, next) => {
        try {
            const { email, policyNumber, password, remember, location } = req.body || {};

            if (!password) return res.fail('Password is required', 400);
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

            if (!user) return res.fail('Invalid credentials', 401);

            let passwordMatches = false;
            if (user.passwordHash) {
                try {
                    const bcrypt = require('bcrypt');
                    passwordMatches = await bcrypt.compare(password, user.passwordHash);
                } catch (e) {
                    passwordMatches = user.passwordHash === password;
                }
            }

            if (!passwordMatches) return res.fail('Invalid credentials', 401);

            if (user.status && user.status !== 'active') return res.fail('Account is not active', 403);

            if (location && (location.lat !== undefined || location.lon !== undefined || location.currentLocation !== undefined)) {
                const updates = {};
                if (location.lat !== undefined) updates.latitude = location.lat;
                if (location.lon !== undefined) updates.longitude = location.lon;
                if (location.currentLocation !== undefined) updates.currentLocation = location.currentLocation;
                try {
                    if (user && typeof user.update === 'function') {
                        await user.update(updates);
                    } else {
                        const { [typeof modelOrKey === 'string' ? modelOrKey : 'User']: UserModelFromReq } = req.models || {};
                        if (UserModelFromReq) await UserModelFromReq.update(updates, { where: { id: user.id } });
                    }
                    if (user && typeof user.reload === 'function') await user.reload();
                } catch (e) {
                    console.error('Failed to update user location:', e && e.message ? e.message : e);
                }
            }

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
                type: userType
            };

            let roleInfo = null;
            try {
                const { UserRole, Role, RolePrivilege, Privilege } = req.models || {};
                if (UserRole && Role) {
                    const userRole = await UserRole.findOne({ where: { userId: user.id, userType } });
                    if (userRole) {
                        const role = await Role.findByPk(userRole.roleId);
                        if (role) {
                            roleInfo = {
                                id: role.id,
                                name: role.name,
                                description: role.description || null,
                                privileges: []
                            };

                            // fetch privileges for this role if models are available
                            try {
                                if (RolePrivilege && Privilege) {
                                    const rolePrivileges = await RolePrivilege.findAll({ where: { roleId: role.id } });
                                    const privilegeIds = (rolePrivileges || []).map(rp => rp.privilegeId).filter(Boolean);
                                    if (privilegeIds.length) {
                                        const privileges = await Privilege.findAll({ where: { id: privilegeIds } });
                                        roleInfo.privileges = (privileges || []).map(p => ({
                                            // id: p.id,
                                            name: p.name,
                                            // description: p.description || null
                                        }));
                                    }
                                }
                            } catch (privErr) {
                                console.error('Privilege lookup failed:', privErr && privErr.message ? privErr.message : privErr);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Role lookup failed:', err && err.message ? err.message : err);
            }

            // attach role name and privileges to safeUser
            safeUser.role = roleInfo ? roleInfo.name : null;
            safeUser.rolePrivileges = roleInfo && Array.isArray(roleInfo.privileges) ? roleInfo.privileges : [];

            let signedToken;
            try {
                signedToken = signToken(safeUser);
            } catch (err) {
                console.error('JWT signing failed, falling back to opaque token:', err.message);
                return res.fail('Authentication token generation failed', 500);
            }

            return res.success({ user: safeUser, token: signedToken }, 'Logged in');
        } catch (err) {
            return next(err);
        }
    };
};
module.exports = { makeLogin }