import Foundation

struct CalculationResult: Sendable {
    let baseAmount: Decimal
    let bonusAmount: Decimal
    let superAmount: Decimal
    let totalAmount: Decimal
    let hoursWorked: Decimal?
}

struct CalculationService {

    // MARK: - Day Rate (The ICONIC, The ICONIC Creative)

    static func calculateDayRate(
        client: Client,
        dayType: DayType,
        workflowType: String?,
        brand: String?,
        skus: Int?,
        workflowRates: [ClientWorkflowRate]
    ) -> CalculationResult {
        let base: Decimal
        let bonus: Decimal

        switch dayType {
        case .full:
            base = client.rateFullDay ?? 0
            bonus = calculateBonus(
                workflowType: workflowType,
                brand: brand,
                skus: skus,
                workflowRates: workflowRates
            )
        case .half:
            base = client.rateHalfDay ?? 0
            bonus = 0
        }

        let subtotal = base + bonus
        let superAmount = client.paysSuper ? subtotal * client.superRate : 0
        return CalculationResult(
            baseAmount: base,
            bonusAmount: bonus,
            superAmount: superAmount,
            totalAmount: subtotal + superAmount,
            hoursWorked: nil
        )
    }

    private static func calculateBonus(
        workflowType: String?,
        brand: String?,
        skus: Int?,
        workflowRates: [ClientWorkflowRate]
    ) -> Decimal {
        guard let workflowType else { return 0 }

        // Own Brand always gets $40 bonus, no SKU threshold
        if workflowType == "Own Brand" {
            return 40
        }

        // Apparel/Product: SKU-based bonus
        guard let skus, skus > 0 else { return 0 }

        guard let rate = workflowRates.first(where: { $0.workflow == workflowType }) else {
            return 0
        }

        if skus >= rate.upperLimitSkus {
            return rate.maxBonus
        } else if skus > rate.kpi {
            let overKpi = Decimal(skus - rate.kpi)
            let calculated = overKpi * rate.incentiveRatePerSku
            return min(calculated, rate.maxBonus)
        } else {
            return 0
        }
    }

    // MARK: - Hourly (Images That Sell, JD Sports)

    static func calculateHourly(
        client: Client,
        startTime: Date,
        finishTime: Date,
        breakMinutes: Int
    ) -> CalculationResult {
        let totalMinutes = finishTime.timeIntervalSince(startTime) / 60
        let workedMinutes = totalMinutes - Double(breakMinutes)
        let hours = Decimal(workedMinutes / 60)
        let roundedHours = roundToQuarterHour(hours)

        let rate = client.rateHourly ?? 0
        let base = roundedHours * rate
        let superAmount = client.paysSuper ? base * client.superRate : 0

        return CalculationResult(
            baseAmount: base,
            bonusAmount: 0,
            superAmount: superAmount,
            totalAmount: base + superAmount,
            hoursWorked: roundedHours
        )
    }

    // MARK: - Manual

    static func calculateManual(
        amount: Decimal,
        paysSuper: Bool,
        superRate: Decimal
    ) -> CalculationResult {
        let superAmount = paysSuper ? amount * superRate : 0
        return CalculationResult(
            baseAmount: amount,
            bonusAmount: 0,
            superAmount: superAmount,
            totalAmount: amount + superAmount,
            hoursWorked: nil
        )
    }

    // MARK: - Helpers

    private static func roundToQuarterHour(_ hours: Decimal) -> Decimal {
        // Round to nearest 0.25
        let quartered = (hours * 4).rounded(.plain) / 4
        return quartered
    }
}

private extension Decimal {
    func rounded(_ mode: NSDecimalNumber.RoundingMode) -> Decimal {
        var result = Decimal()
        var mutableSelf = self
        NSDecimalRound(&result, &mutableSelf, 0, mode)
        return result
    }
}
