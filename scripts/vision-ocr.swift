// Reads text out of images using the Vision framework built into macOS.
//
// Free, offline, and the best of everything measured for this archive:
// ~0.73s a page at 97-99% accuracy, against tesseract.js at 2.73s and 90-95%.
// It also keeps the reading order right on two-column pages and ignores
// embedded photographs instead of inventing text from them. ARCHITECTURE.md §7.
//
// Compiled once by scripts/ocr-local.ts, then invoked per batch:
//   vision-ocr <image> [<image> ...]
//
// Prints one JSON object per line: {"path": "...", "text": "...", "confidence": 0.0}
// A line per image rather than one array at the end, so the caller can stream
// progress and a single bad image cannot spoil the whole batch.

import Foundation
import Vision
import AppKit

func recognise(path: String) -> [String: Any] {
    guard let image = NSImage(contentsOfFile: path),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
        return ["path": path, "text": "", "confidence": 0.0, "error": "could not read image"]
    }

    let request = VNRecognizeTextRequest()
    // .accurate is the slower path and the one the bake-off measured; language
    // correction fixes the sort of slips that cost whole shingles downstream.
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([request])
    } catch {
        return ["path": path, "text": "", "confidence": 0.0, "error": "\(error)"]
    }

    guard let observations = request.results else {
        return ["path": path, "text": "", "confidence": 0.0]
    }

    var lines: [String] = []
    var total: Float = 0
    var counted = 0

    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        lines.append(candidate.string)
        total += candidate.confidence
        counted += 1
    }

    return [
        "path": path,
        "text": lines.joined(separator: "\n"),
        "confidence": counted > 0 ? Double(total / Float(counted)) : 0.0,
    ]
}

let paths = Array(CommandLine.arguments.dropFirst())

if paths.isEmpty {
    FileHandle.standardError.write("usage: vision-ocr <image> [<image> ...]\n".data(using: .utf8)!)
    exit(2)
}

for path in paths {
    let result = recognise(path: path)
    if let data = try? JSONSerialization.data(withJSONObject: result),
       let line = String(data: data, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}
