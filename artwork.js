(() => {
  "use strict";
  const defaults = Object.freeze({
    yearSet: "Fold Studies", title: "Helix Fold", cardNumber: "F-14",
    variation: "Ultramarine", gradeText: "MINT", grade: "9", serial: "FS14027"
  });
  const ink = "#13252f", blue = "#3256ce", saffron = "#f5b653", paper = "#f6f0e3";
  let frontPaper, backPaper, sampleCards, lookupQR;

  function surface(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = 2 * width;
    canvas.height = 2 * height;
    const ctx = canvas.getContext("2d");
    ctx.scale(2, 2);
    ctx.imageSmoothingQuality = "high";
    return canvas;
  }

  function polygon(ctx, points, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
  }

  function rule(ctx, x, y, x2, y2, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function type(ctx, text, x, y, font, color, align = "left", width) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    if (width === undefined) ctx.fillText(text, x, y);
    else ctx.fillText(text, x, y, width);
  }

  function foldMark(ctx, cx, cy, scale, color) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
    polygon(ctx, [[-32,24],[-32,-8],[-8,-32],[-8,0]], color);
    polygon(ctx, [[0,32],[0,0],[24,-24],[24,8]], color);
    ctx.restore();
  }

  // PSA wordmark from the public Original Photograph Submission Form.
  // https://www.psacard.com/services/originalphotoauthentication
  const psaOuterLetters = new Path2D(`
    M 25.69 14.77 C 25.69 16.5 24.89 17.87 22.8 17.87 L 8.93 17.87 L 8.93 10.55 L 22.03 10.55
    C 24.73 10.55 25.69 11.68 25.69 13.65 Z M 34.47 19.06 C 31.57 18.41 29.7 17.2 29.7 14.09
    C 29.7 13.22 29.92 11.94 30.34 10.37 C 30.94 8.19 31.49 6.98 32.59 5.96
    C 30.99 4.3 28.41 3.32 24.32 3.32 L 0 3.32 L 0 32.43 L 8.93 32.43 L 8.93 25.11 L 26.66 25.11
    C 31.39 25.11 33.64 22.3 34.47 19.06 M 65.52 21 L 71.15 10.07 L 76.94 21 Z M 76.98 3.32
    L 65.36 3.32 L 56.52 19.65 C 58.11 20.73 58.96 22.27 58.96 24.15
    C 58.96 27.54 56.92 30.35 53.21 32.43 L 59.57 32.43 L 62.18 27.28 L 80.28 27.28 L 83.05 32.43
    L 92.98 32.43 Z M 76.98 3.32 M 94.77 31.82 L 94.89 31.82 C 95.02 31.82 95.12 31.78 95.12 31.67
    C 95.12 31.57 95.06 31.51 94.9 31.51 C 94.84 31.51 94.8 31.52 94.77 31.52 Z M 94.77 32.41
    L 94.52 32.41 L 94.52 31.37 C 94.62 31.35 94.75 31.34 94.92 31.34
    C 95.12 31.34 95.21 31.37 95.29 31.41 C 95.34 31.46 95.39 31.54 95.39 31.64
    C 95.39 31.76 95.3 31.85 95.17 31.89 L 95.17 31.9 C 95.27 31.94 95.33 32.01 95.36 32.15
    C 95.39 32.31 95.41 32.38 95.44 32.41 L 95.18 32.41 C 95.14 32.38 95.12 32.28 95.09 32.16
    C 95.07 32.05 95.01 32 94.88 32 L 94.77 32 Z M 94.12 31.87 C 94.12 32.33 94.46 32.7 94.94 32.7
    C 95.39 32.7 95.73 32.33 95.73 31.88 C 95.73 31.41 95.39 31.03 94.93 31.03
    C 94.46 31.03 94.12 31.41 94.12 31.87 M 96 31.87 C 96 32.46 95.54 32.93 94.93 32.93
    C 94.33 32.93 93.85 32.46 93.85 31.87 C 93.85 31.29 94.33 30.82 94.93 30.82
    C 95.54 30.82 96 31.29 96 31.87`);
  const psaMiddleLetter = new Path2D(`
    M 55.39 6.96 C 49.62 7.38 46.57 7.95 43.01 9.13 C 39.45 10.37 36.56 12.28 36.56 13.41
    C 36.56 13.93 37.13 14.39 38.21 14.75 C 39.35 15.12 40.33 15.38 41.1 15.53 L 46.52 16.77
    C 49.77 17.49 53.12 18.73 55.09 19.97 C 56.69 20.95 57.51 22.39 57.51 24.14
    C 57.51 31.32 47.66 35.81 31.77 35.81 C 26.61 35.81 24.02 34.88 24.02 32.97
    C 24.02 32.3 24.54 31.27 25.62 29.67 C 26.45 28.53 26.91 28.12 27.74 27.86
    C 31.14 26.78 30.73 26.88 31.09 26.88 C 31.35 26.88 31.45 26.98 31.45 27.24
    C 31.45 27.55 31.35 27.66 30.89 28.02 L 29.7 28.89 C 31.25 28.95 32.8 29 33.21 29
    C 39.97 29 45.34 28.02 49.88 25.95 C 51.89 25.07 52.71 24.41 52.71 23.73
    C 52.71 23.06 51.99 22.5 50.13 21.77 C 48.43 21.1 46.26 20.48 44.92 20.23 L 36.41 18.68
    C 32.59 18.01 31.14 16.77 31.14 14.09 C 31.14 13.31 31.35 12.07 31.77 10.52
    C 32.64 7.32 33.36 6.39 36 4.9 C 41.52 1.75 48.43 0 54.98 0 C 57.05 0 59.27 0.26 61.33 0.72
    C 62.46 0.93 62.67 1.24 62.67 2.53 C 62.67 4.02 62.21 5.78 61.54 6.55
    C 60.97 7.32 60.71 7.48 58.34 8.3 C 56.84 8.82 56.22 9.18 53.75 10.84
    C 53.18 11.2 52.87 11.35 52.51 11.35 C 52.09 11.35 51.68 10.99 51.68 10.63
    C 51.68 10.32 51.79 10.11 52.3 9.7 Z M 55.39 6.96`);

  function drawPSA(ctx, x, centerY, width, singleColor) {
    const scale = width / 96;
    ctx.save();
    ctx.translate(x,centerY - 35.8086 * scale / 2);
    ctx.scale(scale,scale);
    ctx.fillStyle = singleColor || "#0050a2";
    ctx.fill(psaOuterLetters);
    ctx.fillStyle = singleColor || "#eb1c2d";
    ctx.fill(psaMiddleLetter);
    ctx.restore();
  }

  function foilGrain(ctx, x, y, width, height, seed) {
    // The same physical flecks stay in place when the label is edited or exported.
    function random() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    const noise = document.createElement("canvas");
    for (const [pitch, opacity] of [[3.1, .31], [1.1, .44]]) {
      noise.width = Math.ceil(width / pitch);
      noise.height = Math.ceil(height / pitch);
      const noiseCtx = noise.getContext("2d");
      const pixels = noiseCtx.createImageData(noise.width, noise.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const tone = random() * 255;
        const warmth = (random() - .5) * 12;
        pixels.data[i] = tone + warmth;
        pixels.data[i + 1] = tone;
        pixels.data[i + 2] = tone - warmth;
        pixels.data[i + 3] = 255;
      }
      noiseCtx.putImageData(pixels, 0, 0);
      ctx.globalAlpha = opacity;
      ctx.drawImage(noise, x, y, width, height);
    }
    ctx.globalCompositeOperation = "source-over";
    const metals = ["#faf8f1", "#e9e8e8", "#cecbd1", "#8c8588", "#706d72"];
    const count = Math.round(width * height / 20);
    for (let i = 0; i < count; i++) {
      const cx = x + random() * width, cy = y + random() * height;
      const length = .55 + 1.55 * random() ** 2;
      const thickness = length * (.24 + .43 * random());
      ctx.fillStyle = metals[Math.floor(random() * metals.length)];
      ctx.globalAlpha = .32 + .46 * random();
      ctx.beginPath();
      ctx.ellipse(cx, cy, length, thickness, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The insert's metalized dies are registered to these two polygons in the 3D model.
  function foil(ctx, rear) {
    ctx.save();
    if (rear) {
      ctx.beginPath(); ctx.moveTo(614,0); ctx.lineTo(922,0); ctx.lineTo(922,210);
      ctx.lineTo(768,261); ctx.lineTo(614,210); ctx.closePath();
    } else {
      ctx.beginPath(); ctx.rect(670,316,204,132);
    }
    ctx.clip();
    const x = rear ? 614 : 670, y = rear ? 0 : 316;
    const w = rear ? 308 : 204, h = rear ? 261 : 132;
    const foilInk = ctx.createLinearGradient(x,y,x+w,y+h);
    foilInk.addColorStop(0, "#9b9190");
    foilInk.addColorStop(.32, "#b5aca9");
    foilInk.addColorStop(.56, "#afa7a5");
    foilInk.addColorStop(1, "#a29998");
    ctx.fillStyle = foilInk; ctx.fillRect(x,y,w,h);
    foilGrain(ctx, x, y, w, h, rear ? 37 : 19);
    drawPSA(ctx,x+w*.07,y+h*(rear ? .39 : .47),w*.86);
    ctx.restore();
  }

  function frontLabelPaper(ctx) {
    const trim = ctx.createLinearGradient(0,0,1536,448);
    trim.addColorStop(0,"#dd0e22");trim.addColorStop(.52,"#d90e23");trim.addColorStop(1,"#c5091c");
    ctx.fillStyle=trim;ctx.fillRect(0,0,1536,448);
    ctx.save();
    ctx.beginPath();ctx.rect(32,51,1472,344);ctx.clip();
    const wash=ctx.createLinearGradient(0,64,96,430);
    wash.addColorStop(0,"#e9f3f2");wash.addColorStop(.52,"#f6f9f4");wash.addColorStop(1,"#f5fbf8");
    ctx.fillStyle=wash;ctx.fillRect(32,51,1472,344);
    ctx.strokeStyle="rgba(118,170,182,.21)";ctx.lineWidth=1;
    for(let base=32;base<=424;base+=5.5){
      ctx.beginPath();
      for(let x=32;x<=1504;x+=4){
        const y=base+9*Math.sin(x*.009+base*.016)+4*Math.sin(x*.027-base*.023);
        if(x===32)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function paperFace(rear) {
    if (rear ? backPaper : frontPaper) return rear ? backPaper : frontPaper;
    const canvas = surface(1536,448), ctx = canvas.getContext("2d");
    if (rear) {
      const field=ctx.createLinearGradient(0,0,1536,355);
      field.addColorStop(0,"#211e26");field.addColorStop(.48,"#191a25");field.addColorStop(1,"#24212a");
      ctx.fillStyle=field;ctx.fillRect(0,0,1536,448);
      for(const y of [56,298]){
        for(const x of [104,246,388])drawPSA(ctx,x,y,70,"#37343d");
      }
      drawPSA(ctx,64,178,440,"#9ba0aa");
      const band=ctx.createLinearGradient(0,355,0,448);
      band.addColorStop(0,"#f6f5f3");band.addColorStop(1,"#e9e9e9");
      ctx.fillStyle=band;ctx.fillRect(0,355,1536,93);
      backPaper = canvas;
    } else {
      frontLabelPaper(ctx);
      frontPaper = canvas;
    }
    foil(ctx,rear);
    return canvas;
  }

  // Code 128 element widths in symbol order, including the seven-element stop symbol.
  const code128 = (
    "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 " +
    "112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 " +
    "311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 " +
    "112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 " +
    "313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
    "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 " +
    "122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 " +
    "124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 " +
    "114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112"
  ).split(" ");

  function barcode(ctx, serial, x, y, width, height) {
    if (!serial || !/^[ -~]+$/.test(serial)) return;
    const pairs = /^(?:[0-9]{2})+$/.test(serial);
    const start = pairs ? 105 : 104;
    const symbols = pairs ? serial.match(/../g).map(Number) : Array.from(serial, c => c.charCodeAt(0) - 32);
    const checksum = symbols.reduce((sum, symbol, i) => sum + symbol * (i+1), start) % 103;
    const runs = [start, ...symbols, checksum, 106].map(v => code128[v]).join("");
    const modules = [...runs].reduce((sum, digit) => sum + Number(digit), 0);
    let before = 0;
    ctx.fillStyle = "#15151a";
    for (let i = 0; i < runs.length; i++) {
      const after = before + Number(runs[i]);
      if (i % 2 === 0) {
        const left = Math.round(x + width * before / modules);
        const right = Math.round(x + width * after / modules);
        ctx.fillRect(left, y, right-left, height);
      }
      before = after;
    }
  }

  function defaultQR() {
    if (lookupQR) return lookupQR;
    // Fixed QR version 3-Q for https://www.psacard.com/cert
    const rows = [
      "11111110010110000000001111111","10000010001101111101101000001",
      "10111010101000001111001011101","10111010000001111000101011101",
      "10111010100101101010001011101","10000010110101011001001000001",
      "11111110101010101010101111111","00000000010111100101100000000",
      "01001010101011110011010110100","01000101100001111110001111111",
      "11100010010100110010110010101","00010001000001100100110011011",
      "00011011001000100101000101001","00111001100001001100001010111",
      "00001010000010100010100010001","10001100101000111001101101001",
      "11110011101001111001100000000","10000001001101000010001110101",
      "00000111001001010100100010001","00011101110011011101000100011",
      "11111110110101100101111111011","00000000110010111000100010101",
      "11111110010111010101101010001","10000010010101011111100011000",
      "10111010110001100011111110000","10111010001010101000000100010",
      "10111010010010001001110000111","10000010101110000110100101011",
      "11111110001011010100111011010"
    ];
    const quietZone = 4;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = rows.length + 2*quietZone;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#101010";
    rows.forEach((row,y) => {
      for (let x=0;x<row.length;x++) {
        if (row[x] === "1") ctx.fillRect(x+quietZone,y+quietZone,1,1);
      }
    });
    lookupQR = canvas;
    return canvas;
  }

  function drawQR(ctx, qrSource) {
    const source = qrSource || defaultQR();
    const x = 1105, y = 42, size = 292;
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    if (!(sw > 0 && sh > 0)) return;
    const pad = qrSource ? 29 : 0; // The lookup code includes its own quiet zone.
    const factor = (size - 2*pad) / Math.max(sw,sh);
    const w = Math.round(sw*factor), h = Math.round(sh*factor);
    ctx.save();
    ctx.beginPath();ctx.roundRect(x,y,size,size,16);ctx.clip();
    ctx.fillStyle = "#fff";ctx.fillRect(x,y,size,size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source,Math.round(x+(size-w)/2),Math.round(y+(size-h)/2),w,h);
    ctx.restore();
  }

  function label(data = defaults, rear = false, qrSource = null) {
    const values = Object.fromEntries(Object.keys(defaults).map(key =>
      [key, String(data[key] ?? defaults[key]).trim()]));
    const canvas = surface(1536,448), ctx = canvas.getContext("2d");
    ctx.drawImage(paperFace(rear),0,0,1536,448);
    const print=(text,x,y,width,size,align="left")=>
      type(ctx,text,x,y,size+"px Helvetica, Arial, sans-serif","#171a1c",align,width);
    if (rear) {
      drawQR(ctx,qrSource);
      barcode(ctx,values.serial,84,363,407,69);
      print(values.serial,1452,430,664,69,"right");
    } else {
      print(values.yearSet.toUpperCase(),72,151,1006,72);
      print(values.cardNumber.toUpperCase(),1456,151,350,72,"right");
      print(values.title.toUpperCase(),72,225,944,72);
      print(values.variation.toUpperCase(),72,299,944,70);
      print(values.gradeText.toUpperCase(),1456,225,403,70,"right");
      print(values.grade,1456,299,403,72,"right");
      barcode(ctx,values.serial,76,313,400,65);
      print(values.serial,1456,375,554,68,"right");
    }
    return canvas;
  }

  // Project an independently drawn, closed, half-twisted ribbon onto the print.
  // Sort the little facets back-to-front to keep the crossing visibly woven.
  function ribbon(ctx,cx,cy,scale,wire) {
    function vertex(angle, cross) {
      const radius = 185 + cross*68*Math.cos(1.5*angle+.4);
      const x = radius*Math.cos(angle), y = radius*Math.sin(angle);
      const z = cross*68*Math.sin(1.5*angle+.4) + 52*Math.sin(2*angle);
      const v = .71*y-.70*z, depth = .70*y+.71*z;
      return {xy:[cx+scale*(.96*x+.28*v),cy+scale*(-.28*x+.96*v)],depth};
    }
    const count = 120, bands = 8, facets = [];
    for(let j=0;j<bands;j++) {
      const u = 2*j/bands-1, v = 2*(j+1)/bands-1;
      for(let i=0;i<count;i++) {
        const a = i*2*Math.PI/count, b = (i+1)*2*Math.PI/count;
        const points = [vertex(a,u),vertex(b,u),vertex(b,v),vertex(a,v)];
        const depth = points.reduce((sum,p) => sum+p.depth,0)/4;
        facets.push({points:points.map(p => p.xy),depth,a,u});
      }
    }
    facets.sort((a,b) => a.depth-b.depth);
    for(const f of facets) {
      const tone = .5+.5*Math.cos(f.a*1.5+.48);
      const color = wire ? ink : 'hsl('+(224+tone*9)+' 58% '+(28+tone*28+f.u*4)+'%)';
      polygon(ctx,f.points,color);
      const [p,q,r] = f.points;
      rule(ctx,...p,...q,wire ? "#6b9198" : "rgba(243,238,212,.70)",wire ? 1.5 : 1.8);
      rule(ctx,...q,...r,wire ? "#55727c" : color,wire ? .8 : 1.2);
    }
  }

  function cardFace(rear) {
    const canvas = surface(760,1064), ctx = canvas.getContext("2d");
    const ground = rear ? ink : paper, textColor = rear ? paper : ink;
    ctx.fillStyle = ground; ctx.fillRect(0,0,760,1064);
    foldMark(ctx,68,72,.9,rear ? saffron : blue);
    type(ctx,"FOLD STUDIES",120,84,"bold 28px Helvetica, Arial, sans-serif",textColor);
    type(ctx,"F–14",704,84,"24px Menlo, monospace",textColor,"right");
    rule(ctx,48,112,712,112,rear ? "#536472" : "#b5b5a9",2);
    if(rear) {
      ctx.save(); ctx.translate(0,24);
      for (let i=0;i<12;i++) rule(ctx,56,224+i*40,704,224+i*40,"#243845");
      for (let i=0;i<17;i++) rule(ctx,56+i*40,224,56+i*40,664,"#243845");
      ribbon(ctx,380,448,1.08,true);
      ctx.restore();
      type(ctx,"Form study 14",56,808,"64px Georgia, serif",paper);
      type(ctx,"Half-twist in a closed loop",56,864,"32px Helvetica, Arial, sans-serif","#b1c7c7");
      rule(ctx,56,944,704,944,"#536472",2);
      type(ctx,"FOLD SERIES",56,1008,"20px Menlo, monospace",paper);
      type(ctx,"F–14",704,1008,"20px Menlo, monospace",paper,"right");
    } else {
      ctx.fillStyle = saffron; ctx.fillRect(48,152,664,584);
      ribbon(ctx,380,444,1.32,false);
      type(ctx,"Helix Fold",48,864,"bold 96px Georgia, serif",ink,"left",664);
      rule(ctx,48,912,712,912,"#b5b5a9",2);
      type(ctx,"ULTRAMARINE",48,992,"24px Menlo, monospace",blue);
      type(ctx,"FOLD SERIES",712,992,"24px Menlo, monospace",ink,"right");
    }
    return canvas;
  }

  async function sample() {
    if (!sampleCards) sampleCards = {front:cardFace(false),back:cardFace(true)};
    return sampleCards;
  }
  window.SlabArt = Object.freeze({defaults, sample, label, defaultQR});
})();
