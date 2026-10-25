# Standalone DWG reader

This command-line component is licensed under **GPL-3.0-only**. Its source is provided here. It uses the unmodified `@mlightcad/libredwg-web` 0.8.2 package (GPL-3.0), based on GNU LibreDWG. The FCA server executes it as a separate process using file input and JSON/SVG output; it is not bundled into the browser application.

- Wrapper source and build instructions: https://github.com/mlightcad/libredwg-web
- Underlying GNU LibreDWG source: https://www.gnu.org/software/libredwg/
- Package: https://www.npmjs.com/package/@mlightcad/libredwg-web/v/0.8.2
- Full license text: `LICENSE` in this directory.

Install from the FCA root using `npm ci --include=dev`. To invoke independently:

```text
node tools/dwg-reader/cli.js input.dwg output.json
```

The output contains a model-space SVG and decoding metadata. No network request or proprietary AutoCAD installation is used. Input/output paths are supplied as process arguments, never shell commands. Parsing runs in a disposable process so the main application can enforce a timeout and discard failures. The bundled WASM reserves substantial virtual memory; large or complex DWG files may exceed available resources.

This is a 2D model-space preview, not a complete CAD renderer. External references, paper-space viewports, 3D solids, hatches, custom objects, SHX fonts and some dimensions can be missing or simplified. The original file remains the authoritative drawing.
