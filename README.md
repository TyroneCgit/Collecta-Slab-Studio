# Slab Studio 3

A local graded-card editor for macOS and the browser. Add front and back artwork, edit the grading label, and adjust the edge trim and corner radius in the live 3D preview. A procedurally drawn demo card is included.

The v3 case has polished glass bevels and a slight aqua tint through its thick edges. Choose **Scene → Strip light** and drag the slab to see the reflections travel along the divider, the card pocket, and the outer rim. The v3 desktop app keeps a separate local draft from Studio 2.

## Run the editor

Open `index.html` in a browser with WebGL support, or build the macOS app with Xcode Command Line Tools installed.

```sh
./build.sh
open "build/Slab Studio 3.app"
```

## Export a slab

Choose **Export for Xcode** to save a self-contained USDZ. Drag the file into your Xcode project and select your app target. Use the adjacent arrow for GLB or a PNG of the current view. Imported artwork and drafts stay on the device.
