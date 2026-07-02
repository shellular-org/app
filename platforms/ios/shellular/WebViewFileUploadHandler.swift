import PhotosUI
import UIKit
import UniformTypeIdentifiers
import WebKit

@MainActor
final class WebViewFileUploadHandler: NSObject, UIDocumentPickerDelegate, PHPickerViewControllerDelegate {
    static let inputMetadataMessageName = "shellularFileInput"
    static let inputMetadataScript = """
    (() => {
      function findFileInput(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        for (const node of path) {
          if (node instanceof HTMLInputElement && node.type === 'file') return node;
          if (node instanceof HTMLLabelElement) {
            const input = node.control || node.querySelector('input[type="file"]');
            if (input) return input;
          }
        }

        const target = event.target instanceof Element ? event.target : null;
        const input = target?.closest?.('input[type="file"]');
        if (input) return input;

        const label = target?.closest?.('label');
        return label?.control || label?.querySelector?.('input[type="file"]') || null;
      }

      function postFileInput(event) {
        const input = findFileInput(event);
        if (!input) return;

        window.webkit?.messageHandlers?.shellularFileInput?.postMessage({
          accept: input.getAttribute('accept') || '',
          capture: input.getAttribute('capture') || '',
          multiple: !!input.multiple
        });
      }

      for (const eventName of ['pointerdown', 'mousedown', 'touchstart', 'click', 'focus', 'keydown']) {
        document.addEventListener(eventName, postFileInput, true);
      }
    })();
    """

    private weak var presenter: UIViewController?
    private var completionHandler: (([URL]?) -> Void)?
    private var documentPicker: UIDocumentPickerViewController?
    private var photoPicker: PHPickerViewController?
    private var inputAccept = ""
    private var inputCapture = ""
    private var inputAllowsMultiple = false

    init(presenter: UIViewController) {
        self.presenter = presenter
        super.init()
    }

    func updateInputMetadata(accept: String, capture: String, multiple: Bool) {
        inputAccept = accept
        inputCapture = capture
        inputAllowsMultiple = multiple
    }

    @available(iOS 18.4, *)
    func presentOpenPanel(
        parameters: WKOpenPanelParameters,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        finish(with: nil, dismissPicker: true)

        self.completionHandler = completionHandler

        let allowsMultipleSelection = inputAllowsMultiple || parameters.allowsMultipleSelection
        let contentTypes = acceptedContentTypes()

        if usesPhotoPicker(contentTypes: contentTypes) {
            presentPhotoPicker(allowsMultipleSelection: allowsMultipleSelection)
            return
        }

        let picker = UIDocumentPickerViewController(forOpeningContentTypes: contentTypes, asCopy: true)
        picker.allowsMultipleSelection = allowsMultipleSelection
        picker.delegate = self
        documentPicker = picker

        guard let presenter = topPresenter() else {
            finish(with: nil)
            return
        }

        presenter.present(picker, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finish(with: urls)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(with: nil)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        photoPicker = nil

        guard !results.isEmpty else {
            finish(with: nil)
            return
        }

        loadPhotoPickerURLs(results)
    }

    private func topPresenter() -> UIViewController? {
        var controller = presenter
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller
    }

    private func presentPhotoPicker(allowsMultipleSelection: Bool) {
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = allowsMultipleSelection ? 0 : 1
        configuration.preferredAssetRepresentationMode = .current

        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        photoPicker = picker

        guard let presenter = topPresenter() else {
            finish(with: nil)
            return
        }

        presenter.present(picker, animated: true)
    }

    private func loadPhotoPickerURLs(_ results: [PHPickerResult]) {
        let group = DispatchGroup()
        let lock = NSLock()
        var urls = Array<URL?>(repeating: nil, count: results.count)

        for (index, result) in results.enumerated() {
            let provider = result.itemProvider
            let typeIdentifier = provider.registeredTypeIdentifiers.first {
                UTType($0)?.conforms(to: .image) == true
            } ?? UTType.image.identifier

            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { url, _ in
                defer { group.leave() }
                guard let url else { return }

                let fileExtension =
                    UTType(typeIdentifier)?.preferredFilenameExtension ??
                    (url.pathExtension.isEmpty ? "jpg" : url.pathExtension)
                let destination = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension(fileExtension)

                do {
                    if FileManager.default.fileExists(atPath: destination.path) {
                        try FileManager.default.removeItem(at: destination)
                    }
                    try FileManager.default.copyItem(at: url, to: destination)
                    lock.lock()
                    urls[index] = destination
                    lock.unlock()
                } catch {
                    print("[WebViewFileUpload] Failed to copy photo picker file: \(error)")
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            let selectedURLs = urls.compactMap { $0 }
            self?.finish(with: selectedURLs.isEmpty ? nil : selectedURLs)
        }
    }

    private func acceptedContentTypes() -> [UTType] {
        let rawTypes = inputAccept
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }

        guard !rawTypes.isEmpty else {
            return [.item]
        }

        var types: [UTType] = []
        for rawType in rawTypes {
            if rawType == "image/*" {
                types.append(.image)
            } else if rawType == "video/*" {
                types.append(.movie)
            } else if rawType == "audio/*" {
                types.append(.audio)
            } else if rawType == "text/*" {
                types.append(.text)
            } else if rawType.hasPrefix("."),
                      let type = UTType(filenameExtension: String(rawType.dropFirst())) {
                types.append(type)
            } else if let type = UTType(mimeType: rawType) {
                types.append(type)
            }
        }

        return types.isEmpty ? [.item] : Array(Set(types))
    }

    private func usesPhotoPicker(contentTypes: [UTType]) -> Bool {
        inputCapture.isEmpty &&
        !contentTypes.isEmpty &&
        contentTypes.allSatisfy { $0.conforms(to: .image) }
    }

    private func finish(with urls: [URL]?, dismissPicker: Bool = false) {
        if dismissPicker {
            documentPicker?.dismiss(animated: false)
            photoPicker?.dismiss(animated: false)
        }

        let handler = completionHandler
        completionHandler = nil
        documentPicker = nil
        photoPicker = nil
        handler?(urls)
    }
}

@MainActor
final class FileUploadInputMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var fileUploadHandler: WebViewFileUploadHandler?

    init(fileUploadHandler: WebViewFileUploadHandler) {
        self.fileUploadHandler = fileUploadHandler
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any] else { return }
        fileUploadHandler?.updateInputMetadata(
            accept: body["accept"] as? String ?? "",
            capture: body["capture"] as? String ?? "",
            multiple: body["multiple"] as? Bool ?? false
        )
    }
}
