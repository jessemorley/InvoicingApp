import SwiftUI

struct StatsView: View {
    @StateObject private var vm = SummaryViewModel()

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Filter bar
            HStack {
                Picker("Date Range", selection: $vm.dateRangePreset) {
                    ForEach(DateRangePreset.allCases, id: \.self) { preset in
                        Text(preset.rawValue).tag(preset)
                    }
                }
                .onChange(of: vm.dateRangePreset) { _, newValue in
                    vm.applyPreset(newValue)
                }

                if vm.dateRangePreset == .custom {
                    DatePicker("From", selection: $vm.startDate, displayedComponents: .date)
                        .labelsHidden()
                    DatePicker("To", selection: $vm.endDate, displayedComponents: .date)
                        .labelsHidden()
                }

                Picker("Status", selection: $vm.statusFilter) {
                    ForEach(StatusFilter.allCases, id: \.self) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }

                Spacer()
            }
            .padding(.horizontal)
            .padding(.vertical, 8)

            Divider()

            if vm.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        // Breakdown by Client
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Breakdown by Client")
                                .font(.headline)

                            VStack(spacing: 8) {
                                HStack {
                                    Text("Client")
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    Text("Paid")
                                        .frame(width: 120, alignment: .trailing)
                                    Text("Outstanding")
                                        .frame(width: 120, alignment: .trailing)
                                }
                                .font(.subheadline.bold())
                                .foregroundStyle(.secondary)

                                Divider()

                                ForEach(vm.topClientBreakdowns) { breakdown in
                                    HStack {
                                        Text(breakdown.name)
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                        CurrencyText(amount: breakdown.paid)
                                            .font(.body.monospacedDigit())
                                            .frame(width: 120, alignment: .trailing)
                                            .foregroundStyle(.green)
                                        CurrencyText(amount: breakdown.outstanding)
                                            .font(.body.monospacedDigit())
                                            .frame(width: 120, alignment: .trailing)
                                            .foregroundStyle(breakdown.outstanding > 0 ? .red : .secondary)
                                    }
                                }

                                Divider()

                                HStack {
                                    Text("Total")
                                        .bold()
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    CurrencyText(amount: vm.totalPaid)
                                        .font(.body.monospacedDigit().bold())
                                        .frame(width: 120, alignment: .trailing)
                                        .foregroundStyle(.green)
                                    CurrencyText(amount: vm.outstandingTotal)
                                        .font(.body.monospacedDigit().bold())
                                        .frame(width: 120, alignment: .trailing)
                                        .foregroundStyle(vm.outstandingTotal > 0 ? .red : .secondary)
                                }
                            }
                        }
                    }
                    .padding(24)
                }
            }
        }
        .navigationTitle("Stats")
        .task { await vm.loadData() }
    }
}
