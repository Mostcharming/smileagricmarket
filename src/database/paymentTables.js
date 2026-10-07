'use strict';

// Shared definitions keep the migration and Sequelize models aligned.
module.exports = S => {
    const id = { type: S.UUID, primaryKey: true, allowNull: false, defaultValue: S.UUIDV4 };
    const text = (nullable = true) => ({ type: S.STRING, allowNull: nullable });
    const money = { type: S.DECIMAL(15, 2), allowNull: false };
    const json = { type: S.JSONB, allowNull: true };
    const date = { type: S.DATE, allowNull: true };
    const foreign = (table, nullable = false) => ({ type: S.UUID, allowNull: nullable,
        references: { model: table, key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
    return {
        PaymentProfile: { table: 'payment_profiles', fields: {
            id, userId: foreign('users'), customerId: text(), bankCode: text(), accountNumber: text(),
            accountName: text(), bankName: text(), verifiedAt: date,
            status: { ...text(false), defaultValue: 'pending' }, identity: json,
            lastError: text(), creationAttemptedAt: date
        }, indexes: [{ unique: true, fields: ['user_id'] }, { unique: true, fields: ['customer_id'] }] },
        ProjectEscrow: { table: 'project_escrows', fields: {
            id, userFarmInvestmentId: foreign('user_farm_investments'), ownerId: foreign('users'),
            reference: text(false), walletName: text(false), providerWalletId: text(),
            accountNumber: text(), accountName: text(), bankName: text(),
            currency: { type: S.STRING(3), allowNull: false }, targetAmount: money,
            confirmedAmount: { ...money, defaultValue: 0 }, releasedAmount: { ...money, defaultValue: 0 },
            status: { ...text(false), defaultValue: 'awaiting_wallet' },
            counterparty: text(), providerTransactionId: text(), milestones: json,
            creationAttemptedAt: date, escrowAttemptedAt: date, lastError: text()
        }, indexes: [
            { unique: true, fields: ['user_farm_investment_id'] }, { unique: true, fields: ['reference'] },
            { unique: true, fields: ['wallet_name'] }, { unique: true, fields: ['provider_wallet_id'] }
        ] },
        PaymentDeposit: { table: 'payment_deposits', fields: {
            id, projectEscrowId: foreign('project_escrows'), investmentPaymentId: foreign('investment_payments'),
            providerTransactionId: text(false), amount: money, currency: { type: S.STRING(3), allowNull: false },
            reviewedBy: foreign('admins'), evidenceReference: { type: S.TEXT, allowNull: false },
            receivedAt: { type: S.DATE, allowNull: false }
        }, indexes: [{ unique: true, fields: ['investment_payment_id'] }, { unique: true, fields: ['provider_transaction_id'] }] },
        EscrowRelease: { table: 'escrow_releases', fields: {
            id, projectEscrowId: foreign('project_escrows'), userFarmMilestoneId: foreign('user_farm_milestones'),
            providerMilestoneId: text(), amount: money,
            status: { ...text(false), defaultValue: 'pending' }, completedAt: date, lastError: text()
        }, indexes: [{ unique: true, fields: ['user_farm_milestone_id'] }] },
        InvestorPayout: { table: 'investor_payouts', fields: {
            id, investmentPaymentId: foreign('investment_payments'), investorId: foreign('users'),
            reference: text(false), amount: money, principal: money, roi: money,
            currency: { type: S.STRING(3), allowNull: false }, dueAt: { type: S.DATE, allowNull: false },
            returnMode: text(false), initiator: text(), counterparty: text(),
            status: { ...text(false), defaultValue: 'scheduled' }, creationAttemptedAt: date,
            completedAt: date, providerTransactionId: text(), lastError: text()
        }, indexes: [{ unique: true, fields: ['investment_payment_id'] }, { unique: true, fields: ['reference'] }, { fields: ['due_at', 'status'] }] },
        PaymentJob: { table: 'payment_jobs', fields: {
            id, key: text(false), action: text(false), entityId: { type: S.UUID, allowNull: false },
            status: { ...text(false), defaultValue: 'pending' },
            attempts: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
            availableAt: { type: S.DATE, allowNull: false, defaultValue: S.NOW },
            leaseUntil: date, leaseToken: { type: S.UUID, allowNull: true }, lastError: text(), retryHistory: json
        }, indexes: [{ unique: true, fields: ['key'] }, { fields: ['status', 'available_at'] }] }
    };
};
