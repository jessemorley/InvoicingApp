import SwiftUI

struct ManualEntryForm: View {
    @ObservedObject var vm: LogEntryViewModel

    var body: some View {
        TextField("Description", text: $vm.entryDescription)
        TextField("Amount ($)", text: $vm.manualAmount)
    }
}
