// Reads text out of images using the Vision framework built into macOS.
//
// Free, offline, and the best of everything measured for this archive:
// ~0.73s a page at 97-99% accuracy, against tesseract.js at 2.73s and 90-95%.
//
// It does NOT put two-column pages in reading order. Vision returns lines in
// roughly raster order — across the full width of the page — so on a magazine
// spread the left and right columns arrive interleaved, and joining them in
// that order weaves two articles together. This file used to claim otherwise;
// the archive's own output disproved it.
//
// So the geometry travels with each line and `src/lib/text/columns.ts` puts
// them back in order. Ordering here would mean writing that logic in Swift,
// where it could not be tested without a Mac and an image. ARCHITECTURE.md §7.
//
// Compiled once by scripts/ocr-local.ts, then invoked per batch:
//   vision-ocr <image> [<image> ...]
//
// Prints one JSON object per line:
//   {"path": …, "text": …, "confidence": …,
//    "lines": [{"text": …, "confidence": …, "x": …, "y": …, "width": …, "height": …}]}
//
// `text` stays for callers that have not been updated; `lines` is what the
// reading-order pass uses. Coordinates are normalised, origin bottom-left.

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

    var lines: [[String: Any]] = []
    var plain: [String] = []
    var total: Float = 0
    var counted = 0

    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }

        // Where the line sits on the page. Without this the caller cannot tell
        // a left column from a right one, which is the whole problem.
        let box = observation.boundingBox

        lines.append([
            "text": candidate.string,
            "confidence": Double(candidate.confidence),
            "x": Double(box.origin.x),
            "y": Double(box.origin.y),
            "width": Double(box.size.width),
            "height": Double(box.size.height),
        ])
        plain.append(candidate.string)
        total += candidate.confidence
        counted += 1
    }

    return [
        "path": path,
        "lines": lines,
        "text": plain.joined(separator: "\n"),
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
