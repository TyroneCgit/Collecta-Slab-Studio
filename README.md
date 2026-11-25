# Slab Studio 4

A local graded-card editor for macOS and the browser. Each slab starts with a red-bordered PSA-style front label and a charcoal reverse label with the serial and barcode. Add front and back card artwork, edit the label fields, and adjust the edge trim and corner radius in the live 3D preview. A procedurally drawn demo card is included.

Four transparent retainers meet the card edges inside a shallow pocket, leaving clearance at each corner. Tilt the slab under a strip light to see the holographic finish move across the silver PSA stamps.

The v4 desktop app keeps its own local draft. When opened in the same browser as v3, the editor starts from a local copy of the v3 draft.

The QR code on the right side of the rear label opens PSA’s general certificate lookup. Under **Card → Rear label QR**, choose **Replace** to use your own image. The reset button restores the default code.

## Case material

PSA describes its 2024 standard holder as medical-grade plastic. A Collectors Universe patent application identifies Eastman Tritan TX1501HF copolyester as a preferred material. Eastman reports 91% total light transmission and less than 1% haze for its test sample. [PSA holder announcement](https://www.psacard.com/articles/articleview/11060/meet-the-new-standard) · [Holder patent application](https://patents.google.com/patent/US20250325080A1/en) · [Eastman optical data](https://productcatalog.eastman.com/tds/ProdDatasheet.aspx?product=71070314)

Studio models the rim and divider as clear plastic with an irregular molded surface. Each small facet has its own orientation and polish, so different flecks catch the light as the slab turns. The surface pattern is generated at a fixed scale and stays registered to the plastic in the preview and model exports. The exact production mold finish is unverified.

## Light the case

In **Scene → Studio lighting**, choose **Strip light** for a narrow reflection along the divider and rails. Drag the dot in **Light position** to move the reflection while keeping the slab still. Use the arrow keys for one-degree adjustments, or enter an angle directly. **Source size** changes the width of the reflection and **Light intensity** sets its brightness. **Reset lighting** restores the default softbox.

In **Scene → Backdrop**, choose **Custom** to set a solid color or a two-color gradient. Click a color swatch or enter a hex value. The backdrop appears in the preview and in PNGs exported with the background included.

## Run the editor

Open `index.html` in a browser with WebGL support, or build the macOS app with Xcode Command Line Tools installed.

```sh
./build.sh
open "build/Slab Studio 4.app"
```

## Export a slab

Choose **Export for Xcode** to save a self-contained USDZ. Drag the file into your Xcode project and select your app target. Use the adjacent arrow for GLB or PNG. PNG captures the current view and lighting. USDZ and GLB include the molded case, retainers and artwork. The USDZ approximates the foil with tinted reflections. GLB viewers with thin-film support can render iridescence over both foil and ink. Reflections depend on the viewer’s lighting. Imported artwork and drafts stay on the device.
