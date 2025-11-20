const { makeLogin } = require("../../common/login.controller");
const { makeForgotPassword } = require("../../common/forgot.controller");
const { makeResetPassword } = require("../../common/reset.controller");

const login = makeLogin("Admin");
const forgot = makeForgotPassword("Admin");
const reset = makeResetPassword("Admin");

module.exports = {
    login,
    forgot,
    reset,
};