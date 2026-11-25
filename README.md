# Slab Studio 3

A local graded-card editor for macOS and the browser. Each slab starts with a red-bordered PSA-style front label and a charcoal reverse label with the serial and barcode. Add front and back card artwork, edit the label fields, and adjust the edge trim and corner radius in the live 3D preview. A procedurally drawn demo card is included.

The v3 case has polished glass bevels and a slight aqua tint through its thick edges. The v3 desktop app keeps a separate local draft from Studio 2.

## Light the case

In **Scene → Studio lighting**, choose **Strip light** for a narrow reflection along the divider and rails. Drag the dot in **Light position** to move the reflection while keeping the slab still. Use the arrow keys for one-degree adjustments, or enter an angle directly. **Source size** changes the width of the reflection and **Light intensity** sets its brightness. **Reset lighting** restores the default softbox.

In **Scene → Backdrop**, choose **Custom** to set a solid color or a two-color gradient. Click a color swatch or enter a hex value. The backdrop appears in the preview and in PNGs exported with the background included.

## Run the editor

Open `index.html` in a browser with WebGL support, or build the macOS app with Xcode Command Line Tools installed.

```sh
./build.sh
open "build/Slab Studio 3.app"
```

## Export a slab

Choose **Export for Xcode** to save a self-contained USDZ. Drag the file into your Xcode project and select your app target. Use the adjacent arrow for GLB or PNG. PNG captures the current view and lighting. USDZ and GLB include the case geometry, glass materials and artwork, and use the receiving viewer’s lighting. Imported artwork and drafts stay on the device.
